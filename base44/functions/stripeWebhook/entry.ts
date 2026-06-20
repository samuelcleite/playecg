import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@17.5.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));
        const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

        const signature = req.headers.get('stripe-signature');
        const body = await req.text();

        let event;
        try {
            event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
        } catch (err) {
            console.error('Falha na verificação da assinatura do webhook:', err.message);
            return Response.json({ error: 'Invalid signature' }, { status: 400 });
        }

        console.log('📩 Stripe event:', event.type);

        // Helper para marcar premium e registrar pagamento
        async function activatePremium(email, { amount, subscriptionId, couponId }) {
            if (!email) return;

            const users = await base44.asServiceRole.entities.User.filter({ email });
            if (users.length > 0) {
                await base44.asServiceRole.entities.User.update(users[0].id, {
                    subscription_type: 'premium',
                    subscription_start_date: new Date().toISOString()
                });
            }

            await base44.asServiceRole.entities.Payment.create({
                user_email: email,
                stripe_subscription_id: subscriptionId || null,
                reference_id: subscriptionId || `stripe_${Date.now()}`,
                amount: amount != null ? amount / 100 : 59,
                discount_amount: 0,
                coupon_id: couponId || null,
                status: 'PAID',
                payment_method: 'STRIPE_SUBSCRIPTION',
                paid_at: new Date().toISOString()
            });

            // Registrar uso de cupom
            if (couponId) {
                const existing = await base44.asServiceRole.entities.CouponUsage.filter({
                    coupon_id: couponId,
                    user_email: email
                });
                if (existing.length === 0) {
                    await base44.asServiceRole.entities.CouponUsage.create({
                        coupon_id: couponId,
                        user_email: email,
                        original_price: 59,
                        discount_applied: 0,
                        final_price: amount != null ? amount / 100 : 59,
                        used_at: new Date().toISOString()
                    });
                    const coupons = await base44.asServiceRole.entities.Coupon.filter({ id: couponId });
                    if (coupons.length > 0) {
                        const c = coupons[0];
                        const newCount = (c.used_count || 0) + 1;
                        const update = { used_count: newCount };
                        if (c.usage_limit && newCount >= c.usage_limit) update.active = false;
                        await base44.asServiceRole.entities.Coupon.update(couponId, update);
                    }
                }
            }
        }

        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const email = session.customer_email || session.metadata?.user_email;
            await activatePremium(email, {
                amount: session.amount_total,
                subscriptionId: session.subscription,
                couponId: session.metadata?.coupon_id || null
            });
        }

        if (event.type === 'customer.subscription.deleted') {
            const sub = event.data.object;
            const email = sub.metadata?.user_email;
            if (email) {
                const users = await base44.asServiceRole.entities.User.filter({ email });
                if (users.length > 0) {
                    await base44.asServiceRole.entities.User.update(users[0].id, {
                        subscription_type: 'free'
                    });
                }
            }
        }

        return Response.json({ received: true });

    } catch (error) {
        console.error('Erro no webhook Stripe:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});