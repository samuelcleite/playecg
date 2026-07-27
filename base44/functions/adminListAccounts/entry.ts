import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// adminListAccounts
// -----------------------------------------------------------------------------
// Leitura da lista de Accounts para as telas administrativas.
//
// Necessária porque a Account tem `read: false` no RLS: nem admin consegue lê-la
// do frontend. Hoje AdminUsers.jsx, AdminActivity.jsx e AdminPayments.jsx leem
// `base44.entities.User.list()` direto; quando a Account virar o registro único,
// essas leituras passam a vir daqui.
//
// NÃO é chamada por ninguém ainda: as telas são repontadas depois que o
// backfillAccountFromUser rodar com apply. Antes disso a Account está
// praticamente vazia e a troca deixaria as telas admin em branco.
//
// Só leitura. A alteração de assinatura feita hoje em AdminUsers.jsx:123
// (`User.update(id, { subscription_type: 'free' })`) precisa de uma função
// própria de escrita — está no inventário da Fase 3, não aqui.
//
// Gate: admin. Como o caminho JWT nunca concede admin (role hardcoded 'user'),
// na prática só a sessão Base44 alcança esta função — que é exatamente o
// desenho: telas admin ficam no login do Base44 em definitivo.
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

// Nunca devolver o lado de credencial da Account, nem para admin: a tela não
// precisa e o valor não deveria transitar. google_id/apple_id ficam como
// booleanos para o caso de ser útil saber por onde a pessoa entra.
function sanitize(account) {
  const { password_hash: _ph, google_id, apple_id, ...rest } = account;
  return {
    ...rest,
    tem_google: !!google_id,
    tem_apple: !!apple_id,
    tem_senha: !!account.password_hash
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);

    if (!identity || identity.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const accounts = await listAll(base44.asServiceRole.entities, 'Account');

    return Response.json({
      success: true,
      total: accounts.length,
      accounts: accounts.map(sanitize)
    });
  } catch (error) {
    console.error('Erro em adminListAccounts:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
