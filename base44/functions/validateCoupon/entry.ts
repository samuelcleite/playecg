
import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Verificar autenticação
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ 
                error: 'Não autenticado',
                valid: false 
            }, { status: 401 });
        }

        // Obter dados da requisição
        const { coupon_code } = await req.json();

        if (!coupon_code || typeof coupon_code !== 'string') {
            return Response.json({ 
                error: 'Código do cupom inválido',
                valid: false 
            }, { status: 400 });
        }

        // Normalizar código (uppercase e trim)
        const normalizedCode = coupon_code.trim().toUpperCase();

        // Buscar cupom
        const coupons = await base44.entities.Coupon.filter({ 
            code: normalizedCode 
        });

        if (coupons.length === 0) {
            return Response.json({ 
                error: 'Cupom não encontrado',
                valid: false 
            });
        }

        const coupon = coupons[0];

        // Verificar se está ativo
        if (!coupon.active) {
            return Response.json({ 
                error: 'Cupom desativado',
                valid: false 
            });
        }

        // Verificar data de início
        if (coupon.valid_from) {
            const validFrom = new Date(coupon.valid_from);
            if (new Date() < validFrom) {
                return Response.json({ 
                    error: 'Cupom ainda não está válido',
                    valid: false 
                });
            }
        }

        // Verificar data de expiração
        if (coupon.valid_until) {
            const validUntil = new Date(coupon.valid_until);
            if (new Date() > validUntil) {
                return Response.json({ 
                    error: 'Cupom expirado',
                    valid: false 
                });
            }
        }

        // Verificar limite de uso total
        if (coupon.usage_limit !== null && coupon.usage_limit !== undefined) {
            if (coupon.used_count >= coupon.usage_limit) {
                return Response.json({ 
                    error: 'Cupom atingiu o limite de usos',
                    valid: false 
                });
            }
        }

        // Verificar se o usuário já usou este cupom (se for one_per_user)
        if (coupon.one_per_user) {
            const previousUsage = await base44.entities.CouponUsage.filter({
                coupon_id: coupon.id,
                user_email: user.email
            });

            if (previousUsage.length > 0) {
                return Response.json({ 
                    error: 'Você já utilizou este cupom',
                    valid: false 
                });
            }
        }

        // PREÇO BASE ALTERADO PARA R$ 10,00
        const originalPrice = 10.00;
        let discountAmount = 0;
        
        if (coupon.discount_type === 'percentage') {
            discountAmount = (originalPrice * coupon.discount_value) / 100;
        } else if (coupon.discount_type === 'fixed') {
            discountAmount = coupon.discount_value;
        }

        // Garantir que o desconto não seja maior que o preço
        discountAmount = Math.min(discountAmount, originalPrice);
        const finalPrice = Math.max(0.01, originalPrice - discountAmount); // Mínimo R$ 0,01

        return Response.json({
            valid: true,
            coupon: {
                id: coupon.id,
                code: coupon.code,
                discount_type: coupon.discount_type,
                discount_value: coupon.discount_value,
                description: coupon.description
            },
            pricing: {
                original_price: originalPrice,
                discount_amount: discountAmount,
                final_price: finalPrice
            }
        });

    } catch (error) {
        console.error('Erro ao validar cupom:', error);
        return Response.json({ 
            error: 'Erro ao validar cupom: ' + error.message,
            valid: false 
        }, { status: 500 });
    }
});
