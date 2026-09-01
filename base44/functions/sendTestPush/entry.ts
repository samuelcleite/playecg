import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import webpush from 'npm:web-push@3.6.7';

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);

    if (!identity || identity.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { user_email, user_emails, title, body } = await req.json();

    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    const vapidSubject = Deno.env.get('VAPID_SUBJECT');

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    // Alvo por e-mail: um, vários, ou toda a base. O fallback por user_id foi
    // removido junto com o campo: a entidade não tem mais essa chave.
    //
    // Com LISTA, o filtro é em memória e não uma consulta por e-mail. O SDK do
    // Base44 não tem operador de conjunto, então a alternativa seria N idas ao
    // banco — e a lista completa já é lida assim no caminho de broadcast logo
    // abaixo, com o mesmo teto de 1000.
    const alvos = new Set(
      [...(Array.isArray(user_emails) ? user_emails : []), user_email]
        .map(e => (e || '').trim().toLowerCase())
        .filter(Boolean)
    );

    // SELEÇÃO VAZIA NÃO É BROADCAST.
    //
    // Sem esta guarda, mandar `user_emails: []` cairia no ramo de "todos" logo
    // abaixo e a mensagem iria para a base inteira — o oposto exato do que quem
    // escolheu destinatários pediu. Broadcast só quando o campo não vem: é uma
    // ausência, não uma lista vazia. A tela também trava o botão nesse estado,
    // mas a proteção precisa estar aqui: o único jeito de um engano deste tipo
    // ser reversível é ele não acontecer.
    if (Array.isArray(user_emails) && alvos.size === 0) {
      return Response.json(
        { success: false, error: 'Nenhum destinatário selecionado' },
        { status: 400 }
      );
    }

    let subscriptions;
    if (alvos.size > 0) {
      const todas = await base44.asServiceRole.entities.PushSubscription.list('-created_date', 1000);
      subscriptions = todas.filter(s => alvos.has((s.user_email || '').trim().toLowerCase()));
    } else {
      subscriptions = await base44.asServiceRole.entities.PushSubscription.list('-created_date', 1000);
    }

    if (subscriptions.length === 0) {
      return Response.json({ 
        success: false, 
        error: 'Nenhuma inscrição de push encontrada' 
      });
    }

    const payload = JSON.stringify({
      title: title || 'PlayECG - Teste',
      body: body || 'Esta é uma notificação de teste! 🎉',
      icon: 'https://media.base44.com/images/public/68e28688c6f4ec5cd17e317d/88192cd50_903B5817-5009-4B34-8478-509B00A9C6B8.png'
    });

    const results = [];

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        }, payload);
        results.push({ endpoint: sub.endpoint, status: 'sent' });
      } catch (err) {
        // If subscription is expired/invalid, remove it
        if (err.statusCode === 410 || err.statusCode === 404) {
          await base44.asServiceRole.entities.PushSubscription.delete(sub.id);
          results.push({ endpoint: sub.endpoint, status: 'removed (expired)' });
        } else {
          results.push({ endpoint: sub.endpoint, status: 'error', error: err.message });
        }
      }
    }

    return Response.json({ success: true, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});