import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// getMyAccount
// -----------------------------------------------------------------------------
// Devolve a Account do usuário autenticado. É o `auth.me()` do mundo JWT: o
// objeto de sessão que o AuthContext passa a usar no lugar do User do Base44.
//
// Existe porque a Account tem `read: false` no RLS — o frontend não a lê de
// jeito nenhum, nem com sessão válida. Toda leitura passa por aqui.
//
// Funciona pelos dois caminhos de identidade. No caminho `base44` devolve a
// Account correspondente ao email da sessão, e não o User: depois do corte a
// Account é o registro único, e um admin que também use o app deve ver os
// mesmos dados independentemente de por onde entrou.
//
// NUNCA devolve password_hash. google_id/apple_id viram booleanos: a tela pode
// querer mostrar por onde a pessoa entra, mas o valor em si não deve transitar.
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

function sanitize(account, identity) {
  const { password_hash, google_id, apple_id, ...rest } = account;
  return {
    ...rest,
    // role vem da IDENTIDADE, não do registro: só a sessão Base44 concede admin.
    // Ler Account.role aqui abriria um caminho de escalação caso alguém um dia
    // gravasse 'admin' nesse campo.
    role: identity.role === 'admin' ? 'admin' : 'user',
    tem_google: !!google_id,
    tem_apple: !!apple_id,
    tem_senha: !!password_hash
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);

    if (!identity) {
      return Response.json({ error: 'Não autenticado', success: false }, { status: 401 });
    }

    const email = (identity.email || '').trim().toLowerCase();
    const accounts = await base44.asServiceRole.entities.Account.filter({ email });
    const account = accounts && accounts.length > 0 ? accounts[0] : null;

    if (!account) {
      // Autenticado sem Account. Acontece com admin que só existe como User e
      // nunca usou o app. O frontend trata como "sem sessão de usuário".
      return Response.json(
        { error: 'Conta não encontrada', code: 'account_not_found', success: false },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      account: sanitize(account, identity),
      source: identity.source
    });
  } catch (error) {
    console.error('Erro em getMyAccount:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
