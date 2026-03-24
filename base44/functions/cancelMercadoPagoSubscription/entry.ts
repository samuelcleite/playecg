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

        // Verificar se o usuário é premium
        if (user.subscription_type !== 'premium') {
            return Response.json({ 
                error: 'Você não possui assinatura premium ativa',
                success: false 
            }, { status: 400 });
        }

        const mercadoPagoToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
        
        if (!mercadoPagoToken) {
            return Response.json({ 
                error: 'Configuração do Mercado Pago não encontrada',
                success: false 
            }, { status: 500 });
        }

        console.log('🔍 Looking for active subscription for user:', user.email);

        // Buscar o pagamento ativo do usuário
        const payments = await base44.asServiceRole.entities.Payment.filter({
            user_email: user.email,
            status: 'PAID'
        });

        if (payments.length === 0) {
            return Response.json({ 
                error: 'Assinatura ativa não encontrada',
                success: false 
            }, { status: 404 });
        }

        // Pegar o pagamento mais recente
        const payment = payments.sort((a, b) => 
            new Date(b.created_date) - new Date(a.created_date)
        )[0];

        const preapprovalId = payment.mercadopago_payment_id || payment.mercadopago_preference_id;

        if (!preapprovalId) {
            return Response.json({ 
                error: 'ID da assinatura não encontrado',
                success: false 
            }, { status: 400 });
        }

        console.log('🚫 Cancelling subscription:', preapprovalId);

        // Cancelar assinatura no Mercado Pago
        const cancelResponse = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${mercadoPagoToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                status: 'cancelled'
            })
        });

        const responseText = await cancelResponse.text();
        
        console.log('📥 Mercado Pago Cancel Response Status:', cancelResponse.status);
        console.log('📥 Mercado Pago Cancel Response Body:', responseText);

        if (!cancelResponse.ok) {
            console.error('❌ Error cancelling subscription:', cancelResponse.status, responseText);
            
            let errorMessage = 'Erro ao cancelar assinatura no Mercado Pago';
            try {
                const errorData = JSON.parse(responseText);
                if (errorData.message) {
                    errorMessage = errorData.message;
                } else if (errorData.error) {
                    errorMessage = errorData.error;
                }
            } catch (e) {
                errorMessage = responseText;
            }
            
            return Response.json({ 
                error: errorMessage,
                success: false
            }, { status: 400 });
        }

        console.log('✅ Subscription cancelled successfully');

        // Atualizar status do pagamento
        await base44.asServiceRole.entities.Payment.update(payment.id, {
            status: 'CANCELED',
            updated_at: new Date().toISOString()
        });

        // Atualizar usuário para free
        await base44.asServiceRole.entities.User.update(user.id, {
            subscription_type: 'free'
        });

        console.log('✅ User downgraded to free:', user.email);

        return Response.json({
            success: true,
            message: 'Assinatura cancelada com sucesso'
        });

    } catch (error) {
        console.error('💥 Error cancelling subscription:', error.message);
        console.error('💥 Stack trace:', error.stack);
        return Response.json({ 
            error: 'Erro interno ao cancelar assinatura',
            success: false
        }, { status: 500 });
    }
});