import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// adminExpireTrials — varre e encerra as cortesias vencidas.
// -----------------------------------------------------------------------------
// POR QUE ISTO EXISTE, se o getMyAccount já expira.
//
// O getMyAccount expira no acesso do próprio usuário, e é ele quem garante que
// ninguém USA o app com cortesia vencida. O que ele não faz é alcançar quem não
// volta: a conta de quem ganhou 7 dias e sumiu segue marcada 'premium' no banco
// para sempre, inflando a contagem de assinantes de toda tela administrativa.
//
// Esta function é o outro lado: passa em todo mundo de uma vez. Não existe cron
// na plataforma — nenhuma function deste projeto roda sozinha — então ela é
// disparada pelo botão da tela de cortesias. Rodá-la nunca é obrigatório para a
// correção do acesso; é higiene de relatório.
//
// É IDEMPOTENTE. Rodar duas vezes seguidas não muda nada na segunda.
// -----------------------------------------------------------------------------

function b64urlToBytes(input) {
  let s = input.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function b64urlToStr(input) {
  let s = input.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return atob(s);
}

// Verifica um JWT HS256 assinado com a mesma JWT_SECRET e os mesmos parâmetros
// (crypto.subtle nativo, sem dependência externa) que googleSignIn/appleSignIn
// usam para assinar. Qualquer falha (base64 inválido, assinatura, exp) => null,
// para cair de volta no fluxo de sessão Base44 em vez de derrubar a função.
async function verifyJwtHS256(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const header = JSON.parse(b64urlToStr(headerB64));
    if (header.alg !== 'HS256') return null;
    const payload = JSON.parse(b64urlToStr(payloadB64));

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlToBytes(sigB64),
      new TextEncoder().encode(`${headerB64}.${payloadB64}`)
    );
    if (!valid) return null;

    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch (_e) {
    return null;
  }
}

// Aceita tanto o JWT próprio (googleSignIn/appleSignIn) quanto a sessão Base44.
// JWT NUNCA concede admin: role é sempre 'user' nesse caminho, por decisão de
// arquitetura — mesmo que o payload assinado carregue um campo role.
async function resolveIdentity(req, base44) {
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const secret = Deno.env.get('JWT_SECRET');
    if (secret) {
      const token = authHeader.slice('Bearer '.length).trim();
      const payload = await verifyJwtHS256(token, secret);
      if (payload && payload.email) {
        return { email: payload.email, role: 'user', source: 'jwt' };
      }
    }
  }

  // base44.auth.me() LANÇA (não retorna null) quando o Authorization traz um
  // Bearer que não é JWT próprio válido nem sessão Base44 — tratamos a exceção
  // como não autenticado: null, o contrato já esperado por quem chama (=> 401).
  let user;
  try {
    user = await base44.auth.me();
  } catch (_e) {
    return null;
  }
  if (user) {
    return { email: user.email, role: user.role, source: 'base44' };
  }

  return null;
}

async function listAll(entities, entityName) {
  const batchSize = 500;
  let skip = 0;
  let all = [];
  while (true) {
    const batch = await entities[entityName].list(null, batchSize, skip);
    if (!batch || batch.length === 0) break;
    all = all.concat(batch);
    if (batch.length < batchSize) break;
    skip += batchSize;
  }
  return all;
}

// -----------------------------------------------------------------------------
// INVARIANTE trial_ends_at — cópia inline
//
// Este bloco é IDÊNTICO ao do getMyAccount. Cópia porque o Base44 não resolve
// import entre functions (mesma razão do resolveIdentity, ver
// ARQUITETURA_AUTH.md §2). Ao mudar a regra aqui, mude lá:
//   grep -rn "INVARIANTE trial_ends_at" base44/
// tem que achar os dois donos da decisão (adminExpireTrials, getMyAccount) além
// dos caminhos de pagamento que só limpam o campo.
//
// A regra: cortesia vencida rebaixa para 'free' — EXCETO quando rebaixar tiraria
// acesso de quem pagou. São dois casos, e os dois já custaram bug neste projeto
// pela versão do lifetime_access:
//
//   1. lifetime_access: comprou acesso permanente. Nunca vira 'free'.
//   2. pagamento posterior: assinou DEPOIS de ganhar a cortesia. A barreira
//      principal contra isso é a limpeza do trial_ends_at nos caminhos de
//      pagamento; esta é a segunda, para o dia em que um caminho novo de
//      promoção esquecer da primeira.
//
// Nos dois casos as marcas de cortesia saem assim mesmo: deixá-las é deixar a
// expiração armada contra a conta errada na próxima passagem.
// -----------------------------------------------------------------------------
function avaliarCortesia(conta, agora) {
  if (!conta.trial_ends_at) return { vencida: false };

  const fim = new Date(conta.trial_ends_at);
  if (isNaN(fim.getTime()) || fim > agora) return { vencida: false };

  if (conta.lifetime_access === true) {
    return { vencida: true, rebaixar: false, motivo: 'lifetime_access' };
  }

  const inicio = conta.trial_started_at ? new Date(conta.trial_started_at) : null;
  const assinou = conta.subscription_start_date ? new Date(conta.subscription_start_date) : null;
  if (
    inicio && assinou &&
    !isNaN(inicio.getTime()) && !isNaN(assinou.getTime()) &&
    assinou > inicio
  ) {
    return { vencida: true, rebaixar: false, motivo: 'pagamento_posterior' };
  }

  return { vencida: true, rebaixar: true };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);

    if (!identity || identity.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const agora = new Date();
    const contas = await listAll(base44.asServiceRole.entities, 'Account');

    const rebaixadas = [];
    const preservadas = [];

    for (const conta of contas) {
      const r = avaliarCortesia(conta, agora);
      if (!r.vencida) continue;

      await base44.asServiceRole.entities.Account.update(conta.id, {
        ...(r.rebaixar ? { subscription_type: 'free' } : {}),
        trial_ends_at: null,
        trial_started_at: null
      });

      if (r.rebaixar) {
        rebaixadas.push(conta.email);
      } else {
        console.log(`🔒 INVARIANTE trial_ends_at (${r.motivo}): rebaixamento ignorado para`, conta.email);
        preservadas.push({ email: conta.email, motivo: r.motivo });
      }
    }

    console.log(
      'adminExpireTrials:', rebaixadas.length, 'rebaixadas,',
      preservadas.length, 'preservadas, por', identity.email
    );

    return Response.json({
      success: true,
      rebaixadas: rebaixadas.length,
      preservadas: preservadas.length,
      emails_rebaixados: rebaixadas,
      emails_preservados: preservadas
    });
  } catch (error) {
    console.error('Erro em adminExpireTrials:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
