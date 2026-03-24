import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ 
                error: 'Não autenticado',
                success: false 
            }, { status: 401 });
        }

        if (user.subscription_type === 'premium') {
            return Response.json({ 
                error: 'Você já possui assinatura premium',
                success: false 
            }, { status: 400 });
        }

        const { coupon_code } = await req.json();

        // PREÇO BASE: R$ 10,00/mês
        let finalPrice = 10.00;
        let discountAmount = 0;
        let couponId = null;

        if (coupon_code && coupon_code.trim()) {
            const normalizedCode = coupon_code.trim().toUpperCase();
            const coupons = await base44.asServiceRole.entities.Coupon.filter({ 
                code: normalizedCode 
            });

            if (coupons.length > 0) {
                const coupon = coupons[0];
                
                if (coupon.active) {
                    if (coupon.discount_type === 'percentage') {
                        discountAmount = (10.00 * coupon.discount_value) / 100;
                    } else {
                        discountAmount = Math.min(coupon.discount_value, 10.00);
                    }
                    discountAmount = Math.min(discountAmount, 10.00);
                    finalPrice = Math.max(0.01, 10.00 - discountAmount);
                    couponId = coupon.id;
                }
            }
        }

        const mercadoPagoToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
        
        if (!mercadoPagoToken) {
            return Response.json({ 
                error: 'Chave de API do Mercado Pago não configurada',
                success: false 
            }, { status: 500 });
        }

        console.log('🔑 Using Mercado Pago token (first 20 chars):', mercadoPagoToken.substring(0, 20) + '...');
        console.log('👤 Creating subscription for user:', user.email);
        console.log('💰 Amount:', finalPrice);

        const origin = req.headers.get('origin');

        // CRIAR ASSINATURA RECORRENTE MENSAL - PRODUÇÃO
        const preapprovalData = {
            reason: "Assinatura Premium - ECG Master",
            auto_recurring: {
                frequency: 1,
                frequency_type: "months",
                transaction_amount: finalPrice,
                currency_id: "BRL"
            },
            back_url: `${origin}/dashboard?payment=success`,
            payer_email: user.email,
            external_reference: `subscription_${user.id}_${Date.now()}`
        };

        console.log('📤 Sending request to Mercado Pago API...');
        console.log('📋 Payload:', JSON.stringify(preapprovalData, null, 2));

        const response = await fetch('https://api.mercadopago.com/preapproval', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${mercadoPagoToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(preapprovalData)
        });

        const responseText = await response.text();
        
        console.log('📥 Mercado Pago Response Status:', response.status);
        console.log('📥 Mercado Pago Response Body:', responseText);

        if (!response.ok) {
            console.error('❌ Mercado Pago error:', response.status, responseText);
            
            let errorMessage = 'Erro ao criar assinatura no Mercado Pago';
            let errorDetails = {};
            
            try {
                const errorData = JSON.parse(responseText);
                errorDetails = errorData;
                if (errorData.message) {
                    errorMessage = errorData.message;
                } else if (errorData.error) {
                    errorMessage = errorData.error;
                } else if (errorData.cause && errorData.cause.length > 0) {
                    errorMessage = errorData.cause[0].description || errorMessage;
                }
            } catch (e) {
                errorMessage = responseText;
            }
            
            return Response.json({ 
                error: errorMessage,
                success: false,
                debug: {
                    status: response.status,
                    body: errorDetails,
                    tokenPrefix: mercadoPagoToken.substring(0, 20)
                }
            }, { status: 400 });
        }

        const preapproval = JSON.parse(responseText);
        
        console.log('✅ Preapproval created successfully:', preapproval.id);

        // Salvar registro de pagamento
        await base44.asServiceRole.entities.Payment.create({
            user_email: user.email,
            mercadopago_preference_id: preapproval.id,
            reference_id: preapprovalData.external_reference,
            amount: finalPrice,
            discount_amount: discountAmount,
            coupon_id: couponId,
            status: 'PENDING',
            payment_method: 'MERCADOPAGO_SUBSCRIPTION'
        });

        return Response.json({
            success: true,
            preapproval_id: preapproval.id,
            status: preapproval.status,
            init_point: preapproval.init_point,
            amount: finalPrice
        });

    } catch (error) {
        console.error('💥 Error creating subscription:', error.message);
        console.error('💥 Stack trace:', error.stack);
        return Response.json({ 
            error: 'Erro interno ao processar pagamento',
            success: false,
            debug: {
                errorMessage: error.message,
                errorStack: error.stack
            }
        }, { status: 500 });
    }
});