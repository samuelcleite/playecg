// Base44 function: appleSignIn — verifica o id_token da Apple e devolve NOSSO JWT
import { createClientFromRequest } from 'npm:@base44/sdk';

// ---- helpers HS256 (mesmo padrão do googleSignIn) ----
function b64url(bytes) {
  const str =
    typeof bytes === 'string' ? bytes : String.fromCharCode(...new Uint8Array(bytes));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToStr(input) {
  let s = input.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return atob(s);
}
function b64urlToBytes(input) {
  const bin = b64urlToStr(input);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
async function signJwt(payload, secret, ttl = 60 * 60 * 24 * 30) {
  const now = Math.floor(Date.now() / 1000);
  const data = `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64url(
    JSON.stringify({ ...payload, iat: now, exp: now + ttl })
  )}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${b64url(sig)}`;
}

// ---- verificação do id_token da Apple (RS256 via JWKS pública + claims) ----
async function verifyAppleIdToken(idToken, clientId) {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Token Apple malformado');
  const header = JSON.parse(b64urlToStr(parts[0]));
  const payload = JSON.parse(b64urlToStr(parts[1]));

  const jwksRes = await fetch('https://appleid.apple.com/auth/keys');
  if (!jwksRes.ok) throw new Error('Falha ao buscar chaves da Apple');
  const jwks = await jwksRes.json();
  const jwk = (jwks.keys || []).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Chave de assinatura Apple desconhecida');

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const sig = b64urlToBytes(parts[2]);
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    sig,
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!valid) throw new Error('Assinatura do token Apple inválida');

  if (payload.iss !== 'https://appleid.apple.com') throw new Error('Emissor inesperado');
  if (payload.aud !== clientId) throw new Error('Token não emitido para este app');
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token Apple expirado');
  return payload;
}

// ---- handler ----
export default async function appleSignIn(req) {
  try {
    return await handle(req);
  } catch (e) {
    console.error('appleSignIn falhou:', e?.stack || e?.message || e);
    return Response.json(
      { error: `appleSignIn: ${e?.message || e}`, stage: 'exception' },
      { status: 500 }
    );
  }
}

async function handle(req) {
  const { apple_id_token, full_name } = await req.json();
  if (!apple_id_token)
    return Response.json({ error: 'apple_id_token é obrigatório' }, { status: 400 });

  const clientId = Deno.env.get('APPLE_SERVICES_ID');
  let payload;
  try {
    payload = await verifyAppleIdToken(apple_id_token, clientId);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 401 });
  }

  const appleSub = payload.sub;
  // Apple manda o email (real ou relay) quando o escopo email foi concedido
  const email = (payload.email || `apple-${appleSub}@apple.local`).toLowerCase().trim();

  const base44 = createClientFromRequest(req);

  // acha por apple_id primeiro, depois por email (linka Apple a conta existente, não duplica)
  let accounts = await base44.asServiceRole.entities.Account.filter({ apple_id: appleSub });
  let account = accounts?.[0];
  if (!account) {
    accounts = await base44.asServiceRole.entities.Account.filter({ email });
    account = accounts?.[0];
  }

  if (!account) {
    account = await base44.asServiceRole.entities.Account.create({
      email,
      full_name: (full_name || '').trim() || email.split('@')[0], // Apple só manda o nome no 1º login
      apple_id: appleSub,
      email_verified: payload.email_verified === true || payload.email_verified === 'true',
      subscription_type: 'free',
      role: 'user',
      last_login_at: new Date().toISOString(),
    });
  } else {
    await base44.asServiceRole.entities.Account.update(account.id, {
      apple_id: account.apple_id || appleSub,
      full_name: account.full_name || (full_name || '').trim() || email.split('@')[0],
      last_login_at: new Date().toISOString(),
    });
  }

  const token = await signJwt(
    { sub: account.id, email: account.email, role: account.role },
    Deno.env.get('JWT_SECRET')
  );
  return Response.json({
    token,
    account: {
      id: account.id,
      email: account.email,
      full_name: account.full_name,
      role: account.role,
    },
  });
}