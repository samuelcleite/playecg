import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Verificar autenticação
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ 
                error: 'Não autenticado',
                success: false 
            }, { status: 401 });
        }

        console.log('🔍 Getting subscription info for user:', user.email);

        // Buscar pagamentos do usuário usando service role (sem restrições de RLS)
        const allPayments = await base44.asServiceRole.entities.Payment.list('-created_date');
        const userPayments = allPayments.filter(p => p.user_email === user.email);
        
        console.log('💳 Total payments in database:', allPayments.length);
        console.log('💳 User payments found:', userPayments.length);
        console.log('💳 User payments:', JSON.stringify(userPayments, null, 2));
        
        const paidPayments = userPayments.filter(p => p.status === 'PAID');
        console.log('✅ Paid payments:', paidPayments.length);

        if (paidPayments.length === 0) {
            console.log('⚠️ No PAID payments found');
            
            // Retornar informações básicas se for premium mas sem pagamento
            if (user.subscription_type === 'premium') {
                const startDate = user.subscription_start_date 
                    ? new Date(user.subscription_start_date)
                    : new Date(user.created_date);
                
                const nextRenewal = new Date(startDate);
                nextRenewal.setDate(nextRenewal.getDate() + 30);

                return Response.json({
                    success: true,
                    hasSubscription: true,
                    subscriptionInfo: {
                        amount: 59.00,
                        lastRenewal: startDate.toISOString(),
                        nextRenewal: nextRenewal.toISOString(),
                        paymentMethod: 'Manual',
                        paymentId: null
                    }
                });
            } else {
                return Response.json({
                    success: true,
                    hasSubscription: false
                });
            }
        }

        // Pegar o pagamento mais recente
        const latestPayment = paidPayments.sort((a, b) => 
            new Date(b.created_date) - new Date(a.created_date)
        )[0];

        console.log('📌 Latest payment:', JSON.stringify(latestPayment, null, 2));

        // Calcular próxima renovação
        const lastRenewal = new Date(latestPayment.paid_at || latestPayment.created_date);
        const nextRenewal = new Date(lastRenewal);
        nextRenewal.setDate(nextRenewal.getDate() + 30);

        // Detectar se é Stripe
        const isStripe = latestPayment.payment_method === 'STRIPE_SUBSCRIPTION' || !!latestPayment.stripe_subscription_id;
        const paymentId = latestPayment.stripe_subscription_id || null;

        const subscriptionInfo = {
            amount: latestPayment.amount,
            lastRenewal: lastRenewal.toISOString(),
            nextRenewal: nextRenewal.toISOString(),
            paymentMethod: isStripe ? 'Stripe' : 'Manual',
            paymentId: paymentId
        };

        console.log('✅ Returning subscription info:', subscriptionInfo);

        return Response.json({
            success: true,
            hasSubscription: true,
            subscriptionInfo
        });

    } catch (error) {
        console.error('💥 Error getting subscription info:', error.message);
        console.error('Stack:', error.stack);
        return Response.json({ 
            error: error.message,
            success: false 
        }, { status: 500 });
    }
});