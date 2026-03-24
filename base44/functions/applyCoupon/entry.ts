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

        // Verificar se o usuário já é premium
        if (user.subscription_type === 'premium') {
            return Response.json({ 
                error: 'Você já possui assinatura premium',
                success: false 
            }, { status: 400 });
        }

        // Obter dados da requisição
        const { coupon_code } = await req.json();

        let finalPrice = 49; // Preço padrão
        let discountAmount = 0;
        let couponId = null;

        // Se houver cupom, validar e aplicar desconto
        if (coupon_code && coupon_code.trim()) {
            const normalizedCode = coupon_code.trim().toUpperCase();

            // Buscar cupom usando service role para garantir acesso
            const coupons = await base44.asServiceRole.entities.Coupon.filter({ 
                code: normalizedCode 
            });

            if (coupons.length === 0) {
                return Response.json({ 
                    error: 'Cupom não encontrado',
                    success: false 
                }, { status: 400 });
            }

            const coupon = coupons[0];
            couponId = coupon.id;

            // Validações completas (mesmo que no validateCoupon, para segurança)
            if (!coupon.active) {
                return Response.json({ 
                    error: 'Cupom desativado',
                    success: false 
                }, { status: 400 });
            }

            if (coupon.valid_from && new Date() < new Date(coupon.valid_from)) {
                return Response.json({ 
                    error: 'Cupom ainda não está válido',
                    success: false 
                }, { status: 400 });
            }

            if (coupon.valid_until && new Date() > new Date(coupon.valid_until)) {
                return Response.json({ 
                    error: 'Cupom expirado',
                    success: false 
                }, { status: 400 });
            }

            if (coupon.usage_limit !== null && coupon.usage_limit !== undefined) {
                if (coupon.used_count >= coupon.usage_limit) {
                    return Response.json({ 
                        error: 'Cupom atingiu o limite de usos',
                        success: false 
                    }, { status: 400 });
                }
            }

            if (coupon.one_per_user) {
                const previousUsage = await base44.asServiceRole.entities.CouponUsage.filter({
                    coupon_id: coupon.id,
                    user_email: user.email
                });

                if (previousUsage.length > 0) {
                    return Response.json({ 
                        error: 'Você já utilizou este cupom',
                        success: false 
                    }, { status: 400 });
                }
            }

            // Calcular desconto
            const originalPrice = 49;
            
            if (coupon.discount_type === 'percentage') {
                discountAmount = (originalPrice * coupon.discount_value) / 100;
            } else if (coupon.discount_type === 'fixed') {
                discountAmount = coupon.discount_value;
            }

            discountAmount = Math.min(discountAmount, originalPrice);
            finalPrice = Math.max(0, originalPrice - discountAmount);
        }

        // AQUI VOCÊ INTEGRARIA COM O PROVEDOR DE PAGAMENTO (Stripe, MercadoPago, etc.)
        // Por enquanto, vamos simular a aprovação do pagamento
        
        // Simular processamento de pagamento
        // const paymentResult = await processPayment(user, finalPrice);
        // if (!paymentResult.success) {
        //     return Response.json({ error: 'Erro no pagamento', success: false }, { status: 400 });
        // }

        // Após confirmação do pagamento, atualizar dados usando service role

        // 1. Atualizar usuário para premium
        await base44.asServiceRole.entities.User.update(user.id, {
            subscription_type: 'premium'
        });

        // 2. Se usou cupom, registrar uso e atualizar contador
        if (couponId) {
            // Registrar uso do cupom
            await base44.asServiceRole.entities.CouponUsage.create({
                coupon_id: couponId,
                user_email: user.email,
                original_price: 49,
                discount_applied: discountAmount,
                final_price: finalPrice,
                used_at: new Date().toISOString()
            });

            // Atualizar contador do cupom
            const coupon = await base44.asServiceRole.entities.Coupon.list();
            const currentCoupon = coupon.find(c => c.id === couponId);
            
            await base44.asServiceRole.entities.Coupon.update(couponId, {
                used_count: (currentCoupon.used_count || 0) + 1
            });

            // Se atingiu o limite, desativar
            if (currentCoupon.usage_limit && 
                (currentCoupon.used_count + 1) >= currentCoupon.usage_limit) {
                await base44.asServiceRole.entities.Coupon.update(couponId, {
                    active: false
                });
            }
        }

        return Response.json({
            success: true,
            message: 'Upgrade realizado com sucesso!',
            pricing: {
                original_price: 49,
                discount_applied: discountAmount,
                final_price: finalPrice
            }
        });

    } catch (error) {
        console.error('Erro ao aplicar cupom:', error);
        return Response.json({ 
            error: 'Erro ao processar upgrade: ' + error.message,
            success: false 
        }, { status: 500 });
    }
});