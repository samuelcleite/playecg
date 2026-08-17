import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// adminListTrials — a lista de acessos de cortesia, agrupada por pessoa.
// -----------------------------------------------------------------------------
// SÓ LÊ. Nenhuma escrita, nem a de expirar quem já venceu: uma tela que muda o
// banco por ter sido aberta é uma tela em que não dá para confiar. Quem expira
// é o getMyAccount (no acesso do próprio usuário) e o adminExpireTrials (no
// botão, quando o admin pede).
//
// O ESTADO É DERIVADO, NÃO ARMAZENADO.
//
// A verdade sobre uma conta está na Account: `trial_ends_at` no futuro é
// cortesia em curso, e `subscription_type` diz se há acesso. O TrialGrant é
// história. Cruzar os dois na leitura evita ter um campo `status` no grant que
// precisaria ser reescrito toda vez que a Account mudasse por outro caminho —
// e que ficaria mentindo justamente quando alguém comprasse durante o trial,
// que é o evento mais importante de medir.
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

const DIA_MS = 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);

    if (!identity || identity.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const agora = new Date();
    const grants = await listAll(base44.asServiceRole.entities, 'TrialGrant');
    const contas = await listAll(base44.asServiceRole.entities, 'Account');

    const porEmail = new Map();
    for (const c of contas) {
      const chave = (c.email || '').trim().toLowerCase();
      if (chave) porEmail.set(chave, c);
    }

    // Agrupa os grants por pessoa. Extensões produzem várias linhas para o mesmo
    // e-mail e a tela mostra uma pessoa por linha, com o total.
    const agrupado = new Map();
    for (const g of grants) {
      const chave = (g.user_email || '').trim().toLowerCase();
      if (!chave) continue;
      if (!agrupado.has(chave)) agrupado.set(chave, []);
      agrupado.get(chave).push(g);
    }

    const trials = [];
    for (const [email, lista] of agrupado) {
      lista.sort((a, b) => new Date(a.granted_at || a.created_date) - new Date(b.granted_at || b.created_date));
      const primeiro = lista[0];
      const ultimo = lista[lista.length - 1];
      const conta = porEmail.get(email) || null;

      const fim = conta?.trial_ends_at ? new Date(conta.trial_ends_at) : null;
      const fimValido = fim && !isNaN(fim.getTime()) ? fim : null;
      const emCortesia = !!(fimValido && fimValido > agora && conta?.subscription_type === 'premium');

      // A ordem importa. 'ativo' vem primeiro porque é o único estado em que a
      // Account ainda carrega a cortesia; depois dele, o que decide é o que a
      // conta virou.
      let estado;
      if (!conta) {
        // Conta apagada depois da concessão (deleteUserAccount). O grant fica
        // como registro histórico, sem ninguém do outro lado.
        estado = 'sem_conta';
      } else if (emCortesia) {
        estado = 'ativo';
      } else if (conta.subscription_type === 'premium' || conta.lifetime_access === true) {
        // "Virou premium sem cortesia pendurada": comprou durante ou depois do
        // trial, ou um admin promoveu na mão. NÃO é prova de pagamento — quem
        // prova é o Payment, na tela de pagamentos.
        estado = 'premium';
      } else if (lista.some(g => g.revoked_at)) {
        estado = 'revogado';
      } else {
        estado = 'expirado';
      }

      trials.push({
        user_email: email,
        full_name: conta?.full_name || null,
        estado,
        // Só faz sentido enquanto 'ativo'; nos demais estados a tela não mostra.
        trial_ends_at: conta?.trial_ends_at || null,
        dias_restantes: emCortesia ? Math.ceil((fimValido.getTime() - agora.getTime()) / DIA_MS) : null,
        subscription_type: conta?.subscription_type || null,
        lifetime_access: conta?.lifetime_access === true,
        concessoes: lista.length,
        dias_totais: lista.reduce((s, g) => s + (Number(g.days) || 0), 0),
        primeira_concessao: primeiro.granted_at || primeiro.created_date || null,
        ultima_concessao: ultimo.granted_at || ultimo.created_date || null,
        ultimo_prazo: ultimo.expires_at || null,
        granted_by: ultimo.granted_by || null,
        reason: ultimo.reason || '',
        revoked_at: lista.find(g => g.revoked_at)?.revoked_at || null,
        revoked_by: lista.find(g => g.revoked_by)?.revoked_by || null
      });
    }

    // Mais recente primeiro: a tela é operacional, e o que acabou de ser feito é
    // o que o admin quer conferir.
    trials.sort((a, b) => new Date(b.ultima_concessao || 0) - new Date(a.ultima_concessao || 0));

    const resumo = {
      ativos: trials.filter(t => t.estado === 'ativo').length,
      expirados: trials.filter(t => t.estado === 'expirado').length,
      revogados: trials.filter(t => t.estado === 'revogado').length,
      premium: trials.filter(t => t.estado === 'premium').length,
      total: trials.length,
      // Contas que a expiração preguiçosa ainda não alcançou porque a pessoa não
      // abriu o app depois do vencimento. É o número que o botão "Expirar
      // vencidos" zera.
      vencidos_pendentes: contas.filter(c =>
        c.trial_ends_at &&
        !isNaN(new Date(c.trial_ends_at).getTime()) &&
        new Date(c.trial_ends_at) <= agora
      ).length
    };

    return Response.json({ success: true, trials, resumo });
  } catch (error) {
    console.error('Erro em adminListTrials:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
