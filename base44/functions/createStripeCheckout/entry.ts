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

        if (user.subscription_type === 'premium') {
            return Response.json({ error: 'Você já possui assinatura premium', success: false }, { status: 400 });
        }

        const { coupon_code, plan } = await req.json();
        const accountId = user.id;

        const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));
        const PRICES = {
            monthly: "price_1TkQEzLZdvjM2hGBtJTOirwu",
            annual:  "price_1Tpp38LZdvjM2hGBeSCKbKWh"
        };
        const priceId = PRICES[plan] || PRICES.monthly; // default seguro = mensal
        const origin = req.headers.get('origin') || '';

        // Validar cupom (se enviado) e resolver desconto Stripe
        let stripeCouponId = null;
        let appliedCouponId = null;
        if (coupon_code && coupon_code.trim()) {
            const normalizedCode = coupon_code.trim().toUpperCase();
            const coupons = await base44.asServiceRole.entities.Coupon.filter({ code: normalizedCode });

            if (coupons.length === 0) {
                return Response.json({ error: 'Cupom não encontrado', success: false }, { status: 400 });
            }

            const coupon = coupons[0];

            if (!coupon.active) {
                return Response.json({ error: 'Cupom desativado', success: false }, { status: 400 });
            }
            if (coupon.valid_from && new Date() < new Date(coupon.valid_from)) {
                return Response.json({ error: 'Cupom ainda não está válido', success: false }, { status: 400 });
            }
            if (coupon.valid_until && new Date() > new Date(coupon.valid_until)) {
                return Response.json({ error: 'Cupom expirado', success: false }, { status: 400 });
            }
            if (coupon.usage_limit != null && coupon.used_count >= coupon.usage_limit) {
                return Response.json({ error: 'Cupom atingiu o limite de usos', success: false }, { status: 400 });
            }
            if (coupon.one_per_user) {
                const previousUsage = await base44.asServiceRole.entities.CouponUsage.filter({
                    coupon_id: coupon.id,
                    user_email: user.email
                });
                if (previousUsage.length > 0) {
                    return Response.json({ error: 'Você já utilizou este cupom', success: false }, { status: 400 });
                }
            }

            appliedCouponId = coupon.id;

            // Criar um cupom Stripe correspondente (recorrente 'forever' para manter desconto na assinatura)
            const stripeCouponParams = coupon.discount_type === 'percentage'
                ? { percent_off: coupon.discount_value, duration: 'forever' }
                : { amount_off: Math.round(coupon.discount_value * 100), currency: 'brl', duration: 'forever' };

            const stripeCoupon = await stripe.coupons.create(stripeCouponParams);
            stripeCouponId = stripeCoupon.id;
        }

        const sessionParams = {
            mode: 'subscription',
            line_items: [{ price: priceId, quantity: 1 }],
            customer_email: user.email,
            success_url: `${origin}/Dashboard?payment=success`,
            cancel_url: `${origin}/Upgrade?payment=cancel`,
            metadata: {
                base44_app_id: Deno.env.get("BASE44_APP_ID"),
                user_email: user.email,
                // NOTA: nada lê este campo. O stripeWebhook resolve o usuário por
                // customer_email -> customer_details.email -> metadata.user_email, nunca
                // por user_id. Fica aqui só para leitura humana no painel do Stripe, e por
                // isso passa a carregar o Account.id, que é a identidade do usuário depois
                // do corte. Se o Account não existir ainda, cai para o User.id.
                user_id: accountId || user.id,
                coupon_id: appliedCouponId || ''
            },
            subscription_data: {
                metadata: {
                    user_email: user.email,
                    coupon_id: appliedCouponId || ''
                }
            }
        };

        if (stripeCouponId) {
            sessionParams.discounts = [{ coupon: stripeCouponId }];
        }

        const session = await stripe.checkout.sessions.create(sessionParams);

        return Response.json({ success: true, url: session.url });

    } catch (error) {
        console.error('Erro ao criar checkout Stripe:', error.message);
        return Response.json({ error: error.message, success: false }, { status: 500 });
    }
});