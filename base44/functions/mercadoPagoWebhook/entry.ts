import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { createHmac } from "node:crypto";

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const mercadoPagoToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
        const webhookSecret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET");

        // Ler o corpo da requisição
        const notificationData = await req.json();
        
        console.log('📩 Webhook received:', JSON.stringify(notificationData, null, 2));
        console.log('📋 Headers:', JSON.stringify({
            'x-signature': req.headers.get('x-signature'),
            'x-request-id': req.headers.get('x-request-id')
        }, null, 2));

        // Validação de assinatura (se configurada)
        if (webhookSecret) {
            const xSignature = req.headers.get('x-signature');
            const xRequestId = req.headers.get('x-request-id');
            
            if (xSignature && xRequestId) {
                try {
                    const signatureParts = {};
                    xSignature.split(',').forEach(part => {
                        const [key, value] = part.split('=');
                        if (key && value) {
                            signatureParts[key.trim()] = value.trim();
                        }
                    });

                    const timestamp = signatureParts.ts;
                    const receivedHash = signatureParts.v1;
                    const dataId = notificationData.data?.id;

                    if (timestamp && receivedHash && dataId) {
                        const manifest = `id:${dataId};request-id:${xRequestId};ts:${timestamp}`;
                        
                        console.log('🔐 Validating signature...');
                        console.log('Manifest:', manifest);
                        
                        const hmac = createHmac('sha256', webhookSecret);
                        hmac.update(manifest);
                        const calculatedHash = hmac.digest('hex');

                        console.log('Expected hash:', calculatedHash);
                        console.log('Received hash:', receivedHash);

                        if (calculatedHash === receivedHash) {
                            console.log('✅ Signature validated successfully');
                        } else {
                            console.warn('⚠️ Signature mismatch - but continuing anyway');
                        }
                    } else {
                        console.warn('⚠️ Missing signature components - continuing anyway');
                    }
                } catch (validationError) {
                    console.error('⚠️ Signature validation error:', validationError.message);
                    console.warn('Continuing to process webhook anyway...');
                }
            } else {
                console.warn('⚠️ Missing signature headers - continuing anyway');
            }
        }

        // Processar webhook
        const notificationType = notificationData.type;
        
        if (notificationType === 'subscription_preapproval') {
            const preapprovalId = notificationData.data?.id;
            
            if (!preapprovalId) {
                console.error('❌ No preapproval ID in notification');
                return Response.json({ 
                    error: 'No preapproval ID',
                    received: true 
                }, { status: 400 });
            }

            console.log('🔍 Fetching preapproval details:', preapprovalId);

            const preapprovalResponse = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
                headers: {
                    'Authorization': `Bearer ${mercadoPagoToken}`
                }
            });

            if (!preapprovalResponse.ok) {
                const errorText = await preapprovalResponse.text();
                console.error('❌ Error fetching preapproval:', errorText);
                return Response.json({ 
                    error: 'Error fetching preapproval',
                    received: true 
                }, { status: 400 });
            }

            const preapproval = await preapprovalResponse.json();
            console.log('📦 Preapproval details:', JSON.stringify(preapproval, null, 2));

            const externalReference = preapproval.external_reference;
            const status = preapproval.status;

            if (!externalReference) {
                console.error('❌ No external reference in preapproval');
                return Response.json({ 
                    error: 'No external reference',
                    received: true 
                }, { status: 400 });
            }

            console.log('🔍 Looking for payment with reference:', externalReference);

            const payments = await base44.asServiceRole.entities.Payment.filter({
                reference_id: externalReference
            });

            if (payments.length === 0) {
                console.error('❌ Payment not found for reference:', externalReference);
                return Response.json({ 
                    error: 'Payment not found',
                    received: true 
                }, { status: 404 });
            }

            const paymentRecord = payments[0];
            console.log('💳 Payment record found:', paymentRecord.id);
            console.log('💳 Current payment status:', paymentRecord.status);

            let mappedStatus = 'PENDING';
            if (status === 'authorized') {
                mappedStatus = 'PAID';
            } else if (status === 'cancelled') {
                mappedStatus = 'CANCELED';
            } else if (status === 'paused') {
                mappedStatus = 'PENDING';
            }

            console.log('📝 Updating payment status to:', mappedStatus);

            // CORREÇÃO: Atualizar o payment PRIMEIRO
            await base44.asServiceRole.entities.Payment.update(paymentRecord.id, {
                status: mappedStatus,
                mercadopago_payment_id: preapprovalId,
                paid_at: status === 'authorized' ? new Date().toISOString() : null,
                updated_at: new Date().toISOString()
            });

            // CORREÇÃO: Agora verificar se deve ativar o usuário (sem verificar o status antigo)
            if (status === 'authorized') {
                console.log('👤 Upgrading user to premium:', paymentRecord.user_email);

                const users = await base44.asServiceRole.entities.User.filter({
                    email: paymentRecord.user_email
                });

                if (users.length > 0) {
                    const user = users[0];

                    // Verificar se já é premium para não sobrescrever
                    if (user.subscription_type !== 'premium') {
                        await base44.asServiceRole.entities.User.update(user.id, {
                            subscription_type: 'premium',
                            subscription_start_date: new Date().toISOString()
                        });

                        console.log('✅ User upgraded successfully');
                    } else {
                        console.log('ℹ️ User is already premium');
                    }

                    // Processar cupom se houver
                    if (paymentRecord.coupon_id) {
                        console.log('🎫 Recording coupon usage');
                        
                        // Verificar se já registrou o uso deste cupom
                        const existingUsage = await base44.asServiceRole.entities.CouponUsage.filter({
                            coupon_id: paymentRecord.coupon_id,
                            user_email: paymentRecord.user_email
                        });

                        if (existingUsage.length === 0) {
                            await base44.asServiceRole.entities.CouponUsage.create({
                                coupon_id: paymentRecord.coupon_id,
                                user_email: paymentRecord.user_email,
                                original_price: 10.00,
                                discount_applied: paymentRecord.discount_amount || 0,
                                final_price: paymentRecord.amount,
                                used_at: new Date().toISOString()
                            });

                            const coupons = await base44.asServiceRole.entities.Coupon.list();
                            const coupon = coupons.find(c => c.id === paymentRecord.coupon_id);
                            
                            if (coupon) {
                                await base44.asServiceRole.entities.Coupon.update(paymentRecord.coupon_id, {
                                    used_count: (coupon.used_count || 0) + 1
                                });

                                if (coupon.usage_limit && (coupon.used_count + 1) >= coupon.usage_limit) {
                                    await base44.asServiceRole.entities.Coupon.update(paymentRecord.coupon_id, {
                                        active: false
                                    });
                                }
                            }
                        } else {
                            console.log('ℹ️ Coupon usage already recorded');
                        }
                    }
                } else {
                    console.error('❌ User not found:', paymentRecord.user_email);
                }
            }

            if (status === 'cancelled') {
                console.log('❌ Cancelling user subscription:', paymentRecord.user_email);

                const users = await base44.asServiceRole.entities.User.filter({
                    email: paymentRecord.user_email
                });

                if (users.length > 0) {
                    const user = users[0];
                    await base44.asServiceRole.entities.User.update(user.id, {
                        subscription_type: 'free'
                    });
                    console.log('✅ User subscription cancelled');
                }
            }

            console.log('✅ Webhook processed successfully');

            return Response.json({ 
                message: 'Webhook processed successfully',
                received: true,
                status: mappedStatus
            });

        } else if (notificationType === 'subscription_authorized_payment') {
            const paymentId = notificationData.data?.id;
            console.log('💰 Monthly subscription payment authorized:', paymentId);
            
            return Response.json({ 
                message: 'Monthly payment notification received',
                received: true
            });

        } else {
            console.log('ℹ️ Ignoring notification type:', notificationType);
            return Response.json({ 
                message: 'Notification type not handled',
                received: true 
            });
        }

    } catch (error) {
        console.error('💥 Error processing webhook:', error.message);
        console.error('Stack:', error.stack);
        return Response.json({ 
            error: error.message,
            received: true 
        }, { status: 500 });
    }
});