import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// savePushSubscription
// -----------------------------------------------------------------------------
// Fase 1.2, passo 2. Passa a chavear a inscrição por user_email em vez de
// user_id: sob JWT não existe User.id, só email.
//
// user_id continua sendo gravado ENQUANTO for resolvível (as linhas User ainda
// existem), para não quebrar quem ainda lê por ele. Isso não é dupla verdade —
// é o mesmo registro carregando duas chaves para o mesmo dono, não o mesmo dado
// em dois lugares que podem divergir.
//
// CHAVE DE CASAMENTO: o endpoint, sozinho. Ele é a chave natural — vem do push
// service e identifica um navegador/dispositivo específico, globalmente. Casar
// por (dono + endpoint), como era antes, criaria uma linha duplicada sempre que
// o dono mudasse ou não fosse resolvível pela mesma chave, e o usuário passaria
// a receber a mesma notificação duas vezes. Com o endpoint como chave, a linha
// é reaproveitada e o dono é apenas atualizado.
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);

    if (!identity) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { endpoint, p256dh, auth } = await req.json();

    if (!endpoint || !p256dh || !auth) {
      return Response.json({ error: 'Missing subscription fields' }, { status: 400 });
    }

    const user_email = normalizeEmail(identity.email);

    // user_id enquanto existir linha User para este email. Depois do corte,
    // usuário JWT-nativo não terá User e o campo fica vazio — por isso ele saiu
    // de `required` no schema.
    let user_id = null;
    const users = await base44.asServiceRole.entities.User.filter({ email: user_email });
    if (users && users.length > 0) {
      user_id = users[0].id;
    }

    const existing = await base44.asServiceRole.entities.PushSubscription.filter({ endpoint });

    if (existing.length > 0) {
      const updates = { p256dh, auth, user_email };
      if (user_id) updates.user_id = user_id;
      await base44.asServiceRole.entities.PushSubscription.update(existing[0].id, updates);
      return Response.json({ success: true, action: 'updated' });
    }

    const novo = { user_email, endpoint, p256dh, auth };
    if (user_id) novo.user_id = user_id;
    await base44.asServiceRole.entities.PushSubscription.create(novo);

    return Response.json({ success: true, action: 'created' });
  } catch (error) {
    console.error('Erro em savePushSubscription:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
