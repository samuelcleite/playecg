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

export default async function googleSignIn(req) {
  let { google_code } = await req.json();
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

  const info = JSON.parse(
    atob(tokenData.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
  );
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
    });
  } else {
    await base44.asServiceRole.entities.Account.update(account.id, {
      google_id: account.google_id || info.sub || '',
      avatar_url: account.avatar_url || info.picture || '',
      email_verified: true,
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
      subscription_type: account.subscription_type,
    },
  });
}