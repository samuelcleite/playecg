import { createClientFromRequest } from 'npm:@base44/sdk';

function b64url(input) {
  const str =
    typeof input === 'string' ? input : String.fromCharCode(...new Uint8Array(input));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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

// O payload do id_token é JSON em UTF-8, codificado em base64url. O `atob`
// devolve BYTES — um caractere por byte —, e o JSON.parse direto sobre isso
// corrompia todo nome com acento: "João" virava "JoÃ£o". Foi assim que as
// contas nasceram até 26/09/2026, e o formulário de perfil abria com o nome
// estragado. Ler os bytes como UTF-8 antes do parse resolve.
function lerPayloadDoIdToken(idToken) {
  let s = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bytes = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

// A forma exata como o bug acima gravava um nome: os bytes UTF-8 lidos como um
// caractere cada. Conta antiga cujo nome é IGUAL a isto nunca foi editada pela
// pessoa, e pode receber o nome certo no próximo login.
function nomeComOBugAntigo(nome) {
  return String.fromCharCode(...new TextEncoder().encode(nome));
}

// Origem do cadastro, informada pelo app (plataformaDoCadastro, em
// src/utils/platform.js). Lista fechada: qualquer outro valor é ignorado em vez
// de gravado.
const PLATAFORMAS = ['ios_app', 'android_app', 'web_mobile', 'web_desktop'];

export default async function googleSignIn(req) {
  // try/catch no corpo inteiro: sem isto, QUALQUER exceção vira um 500 mudo e o
  // usuário vê "Request failed with status code 500" sem nada acionável — foi
  // exatamente o que aconteceu no primeiro login pela Home.
  try {
    return await handle(req);
  } catch (e) {
    console.error('googleSignIn falhou:', e?.stack || e?.message || e);
    return Response.json(
      { error: `googleSignIn: ${e?.message || e}`, stage: 'exception' },
      { status: 500 }
    );
  }
}

async function handle(req) {
  let { google_code, plataforma } = await req.json();
  if (!google_code)
    return Response.json({ error: 'google_code is required' }, { status: 400 });
  if (google_code.includes('%')) {
    try {
      google_code = decodeURIComponent(google_code);
    } catch {
      /* mantém */
    }
  }

  const APP_BASE_URL = Deno.env.get('APP_BASE_URL') || req.headers.get('origin');
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: google_code,
      client_id: Deno.env.get('GOOGLE_CLIENT_ID'),
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET'),
      redirect_uri: `${APP_BASE_URL}/native-callback.html`,
      grant_type: 'authorization_code',
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.id_token) {
    return Response.json(
      { error: tokenData.error_description || 'Google code exchange failed' },
      { status: 401 }
    );
  }

  const info = lerPayloadDoIdToken(tokenData.id_token);
  if (!info.email)
    return Response.json({ error: 'Google account has no email' }, { status: 401 });
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(info.iss))
    return Response.json({ error: 'Unexpected token issuer' }, { status: 401 });
  if (info.exp && info.exp < Math.floor(Date.now() / 1000))
    return Response.json({ error: 'Token expired' }, { status: 401 });
  if (info.aud !== Deno.env.get('GOOGLE_CLIENT_ID'))
    return Response.json({ error: 'Token not issued for this app' }, { status: 401 });

  const email = info.email.toLowerCase().trim();
  const base44 = createClientFromRequest(req);
  const [existing] = await base44.asServiceRole.entities.Account.filter({ email });

  let account = existing;
  if (!account) {
    account = await base44.asServiceRole.entities.Account.create({
      email,
      full_name: info.name || email.split('@')[0],
      google_id: info.sub || '',
      avatar_url: info.picture || '',
      email_verified: true,
      role: 'user',
      subscription_type: 'free',
      last_login_at: new Date().toISOString(),
      ...(PLATAFORMAS.includes(plataforma) ? { plataforma_cadastro: plataforma } : {}),
    });
  } else {
    // Conta criada antes da correção do UTF-8: o nome só é trocado se for
    // exatamente a versão estragada do nome que o Google manda agora. Nome que a
    // pessoa editou nunca é tocado.
    const nomeCorrigido =
      info.name && account.full_name !== info.name && account.full_name === nomeComOBugAntigo(info.name)
        ? info.name
        : null;
    await base44.asServiceRole.entities.Account.update(account.id, {
      google_id: account.google_id || info.sub || '',
      avatar_url: account.avatar_url || info.picture || '',
      email_verified: true,
      last_login_at: new Date().toISOString(),
      ...(nomeCorrigido ? { full_name: nomeCorrigido } : {}),
    });
    if (nomeCorrigido) account = { ...account, full_name: nomeCorrigido };
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
      subscription_type: account.subscription_type,
    },
  });
}