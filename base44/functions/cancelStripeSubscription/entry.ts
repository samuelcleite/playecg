import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@17.5.0';

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
        if (!identity) {
            return Response.json({ error: 'Não autenticado', success: false }, { status: 401 });
        }

        // O registro do usuário é a Account. Antes isto era base44.auth.me(), que
        // sob JWT falha — e falharia justamente no fluxo de pagamento.
        const contas = await base44.asServiceRole.entities.Account.filter({
            email: (identity.email || '').trim().toLowerCase()
        });
        const user = contas && contas.length > 0 ? contas[0] : null;
        if (!user) {
            return Response.json({ error: 'Conta não encontrada', success: false }, { status: 404 });
        }

        if (user.subscription_type !== 'premium') {
            return Response.json({ error: 'Você não possui assinatura premium ativa', success: false }, { status: 400 });
        }

        const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

        // Buscar pagamento Stripe mais recente do usuário
        const payments = await base44.asServiceRole.entities.Payment.filter({
            user_email: user.email,
            status: 'PAID'
        });

        const stripePayment = payments
            .filter(p => p.stripe_subscription_id)
            .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];

        if (!stripePayment || !stripePayment.stripe_subscription_id) {
            return Response.json({ error: 'Assinatura Stripe ativa não encontrada', success: false }, { status: 404 });
        }

        // Cancelar assinatura no Stripe
        await stripe.subscriptions.cancel(stripePayment.stripe_subscription_id);

        await base44.asServiceRole.entities.Payment.update(stripePayment.id, {
            status: 'CANCELED',
            updated_at: new Date().toISOString()
        });

        // CORTE: a assinatura vive na Account (já resolvida acima).
        await base44.asServiceRole.entities.Account.update(user.id, {
            subscription_type: 'free'
        });

        return Response.json({ success: true, message: 'Assinatura cancelada com sucesso' });

    } catch (error) {
        console.error('Erro ao cancelar assinatura Stripe:', error.message);
        return Response.json({ error: error.message, success: false }, { status: 500 });
    }
});