import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@17.5.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Não autenticado', success: false }, { status: 401 });
        }

        if (user.subscription_type === 'premium') {
            return Response.json({ error: 'Você já possui assinatura premium', success: false }, { status: 400 });
        }

        const { coupon_code } = await req.json();

        const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));
        const priceId = "price_1TkQ29LWtNC4GBiNH0JMTzeI";
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
                user_id: user.id,
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