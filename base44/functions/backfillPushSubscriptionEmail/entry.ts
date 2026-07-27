import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// backfillPushSubscriptionEmail
// -----------------------------------------------------------------------------
// Fase 1.2, passo 1 de 2. Preenche o campo user_email das linhas de
// PushSubscription existentes, resolvendo-o a partir do user_id (que é o
// User.id do Base44).
//
// POR QUÊ: a PushSubscription é a ÚNICA entidade per-user chaveada por user_id.
// Todas as outras usam user_email, que é idêntico em User e Account. Sob JWT não
// existe User.id — a identidade traz email —, então esse campo precisa sair.
//
// PARÂMETROS:
//   apply (boolean, default FALSE) -> false = só relatório (dry run).
//
// Requer admin. Idempotente: linhas que já têm user_email correto são deixadas
// em paz, então pode rodar de novo à vontade.
//
// SÓ ESCREVE user_email. Não toca user_id, que continua sendo a chave viva de
// todo o código até o passo 2 (savePushSubscription, sendTestPush,
// deleteUserAccount e AdminNotifications.jsx). user_id só sai de `properties` e
// de `required` na limpeza da Fase 4 — enquanto estiver em `required`, todo
// create precisa mandá-lo.
//
// ROTA DE FUGA: como user_id permanece intacto e nada lê user_email ainda, esta
// função não muda comportamento nenhum. Se algo der errado, basta não avançar
// para o passo 2.
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

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

async function listAll(entities, entityName, sort = null) {
  const batchSize = 500;
  let skip = 0;
  let all = [];
  while (true) {
    const batch = await entities[entityName].list(sort, batchSize, skip);
    if (!batch || batch.length === 0) break;
    all = all.concat(batch);
    if (batch.length < batchSize) break;
    skip += batchSize;
  }
  return all;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);

    if (!identity || identity.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    let apply = false;
    try {
      const body = await req.json();
      apply = body?.apply === true;
    } catch (_) {
      // sem corpo => dry run
    }

    const svc = base44.asServiceRole.entities;

    const users = await listAll(svc, 'User');
    const subs = await listAll(svc, 'PushSubscription');

    const emailById = new Map();
    for (const u of users) {
      if (u.id) emailById.set(u.id, normalizeEmail(u.email));
    }

    const a_preencher = [];
    const ja_corretas = [];
    const divergentes = [];
    const orfas = [];
    const sem_user_id = [];
    const erros = [];

    for (const sub of subs) {
      const atual = normalizeEmail(sub.user_email);

      if (!sub.user_id) {
        // Linha sem dono resolvível por id. Não inventamos um: só reportamos.
        sem_user_id.push({ id: sub.id, user_email: sub.user_email ?? null });
        continue;
      }

      const esperado = emailById.get(sub.user_id);

      if (!esperado) {
        // user_id que não corresponde a nenhum User: provavelmente inscrição de
        // uma conta já excluída. Não tocamos — vira lixo a limpar à parte.
        orfas.push({ id: sub.id, user_id: sub.user_id, user_email: sub.user_email ?? null });
        continue;
      }

      if (atual === esperado) {
        ja_corretas.push({ id: sub.id, user_email: esperado });
        continue;
      }

      if (atual) {
        // Já tem email E é diferente do que o user_id aponta. Contradição:
        // reportar e NÃO sobrescrever, porque não dá para saber qual está certo.
        divergentes.push({
          id: sub.id,
          user_id: sub.user_id,
          user_email_atual: sub.user_email,
          user_email_pelo_user_id: esperado
        });
        continue;
      }

      a_preencher.push({ id: sub.id, user_id: sub.user_id, user_email: esperado });
      if (apply) {
        try {
          await svc.PushSubscription.update(sub.id, { user_email: esperado });
        } catch (e) {
          erros.push({ id: sub.id, erro: e.message });
        }
      }
    }

    return Response.json({
      success: true,
      dry_run: !apply,
      total_subscriptions: subs.length,
      resumo: {
        a_preencher: a_preencher.length,
        ja_corretas: ja_corretas.length,
        divergentes: divergentes.length,
        orfas: orfas.length,
        sem_user_id: sem_user_id.length,
        erros: erros.length
      },
      a_preencher,
      divergentes,
      orfas,
      sem_user_id,
      erros
    });
  } catch (error) {
    console.error('Erro em backfillPushSubscriptionEmail:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
