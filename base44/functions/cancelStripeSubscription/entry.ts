import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@17.5.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Não autenticado', success: false }, { status: 401 });
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

        await base44.asServiceRole.entities.User.update(user.id, {
            subscription_type: 'free'
        });

        return Response.json({ success: true, message: 'Assinatura cancelada com sucesso' });

    } catch (error) {
        console.error('Erro ao cancelar assinatura Stripe:', error.message);
        return Response.json({ error: error.message, success: false }, { status: 500 });
    }
});