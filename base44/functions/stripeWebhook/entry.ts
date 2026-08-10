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

        // payment_method do Payment de uma compra vitalícia. É o discriminador
        // que o charge.refunded usa para saber se aquele estorno é de um
        // vitalício — nunca o valor da cobrança, que colide com o anual.
        const LIFETIME_PAYMENT_METHOD = 'STRIPE_LIFETIME';

        // Notificação de venda para o time. É AVISO, não parte da concessão.
        //
        // O try/catch de dentro não é zelo: se uma falha de e-mail escapasse,
        // o webhook devolveria 500, o Stripe re-tentaria o evento inteiro e o
        // re-envio criaria um SEGUNDO Payment e concederia o acesso de novo.
        // Notificação nunca pode derrubar pagamento.
        const ADMIN_EMAIL = 'ecgdescomplica@gmail.com';

        const PLANO_LABEL = {
            monthly:  { curto: 'Mensal',    longo: 'Mensal (R$59/mês)' },
            annual:   { curto: 'Anual',     longo: 'Anual (R$499/ano)' },
            lifetime: { curto: 'Vitalício', longo: 'Vitalício (R$400, pagamento único)' }
        };

        async function notificarCompra({ plano, email, conta, amount, couponId }) {
            try {
                const label = PLANO_LABEL[plano] || {
                    curto: 'Plano indefinido',
                    longo: `Não identificada (metadata.plan: ${plano || 'ausente'})`
                };
                const valor = amount != null
                    ? (amount / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                    : 'não informado';
                const quando = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

                const linhas = [
                    'Nova compra confirmada no PlayECG.',
                    '',
                    `Usuário:    ${conta?.full_name || 'nome não informado'}`,
                    `E-mail:     ${email || 'não informado'}`,
                    'Origem:     Site / PWA (Stripe)',
                    `Modalidade: ${label.longo}`,
                    `Valor pago: ${valor}`,
                    `Data:       ${quando} (horário de Brasília)`
                ];
                if (couponId) linhas.push(`Cupom:      ${couponId}`);
                if (!conta) {
                    linhas.push(
                        '',
                        'ATENÇÃO: nenhuma Account com este e-mail. O pagamento entrou, ' +
                        'mas o acesso NÃO foi concedido automaticamente — liberar à mão.'
                    );
                }

                await base44.asServiceRole.integrations.Core.SendEmail({
                    from_name: 'PlayECG — Vendas',
                    to: ADMIN_EMAIL,
                    subject: `[COMPRA] ${label.curto} — ${email || 'e-mail desconhecido'}`,
                    body: linhas.join('\n')
                });
            } catch (e) {
                console.error('Falha ao notificar compra (acesso JÁ concedido):', e.message);
            }
        }

        // Concede o vitalício. Caminho separado do das assinaturas de propósito:
        // o valor vem da session, não de heurística, e não há cupom nem
        // stripe_subscription_id para registrar.
        async function activateLifetime(email, { amount, paymentIntentId }) {
            if (!email) return;

            const contas = await base44.asServiceRole.entities.Account.filter({
                email: email.trim().toLowerCase()
            });
            if (contas.length > 0) {
                await base44.asServiceRole.entities.Account.update(contas[0].id, {
                    // subscription_type é o que concede o acesso: todas as telas
                    // do app checam 'premium' e nenhuma sabe o que é vitalício.
                    subscription_type: 'premium',
                    // lifetime_access é o que impede o rebaixamento futuro.
                    lifetime_access: true,
                    subscription_start_date: new Date().toISOString()
                });
            }

            // VAGAS: aqui NÃO se confere limite. Se o evento chegou, o dinheiro
            // já foi cobrado — negar acesso agora seria cobrar sem entregar. O
            // limite vive só na criação da session. Excedente é registrado para
            // aparecer no log, não para bloquear.
            const vitalicios = await base44.asServiceRole.entities.Account.filter(
                { lifetime_access: true }, '-created_date', 5000, 0, ['id']
            );
            const limite = Number(Deno.env.get('LIFETIME_VAGAS') ?? 100);
            if (vitalicios.length > limite) {
                console.warn(
                    `⚠️ Vitalício acima do limite: ${vitalicios.length}/${limite}. ` +
                    `Acesso CONCEDIDO mesmo assim para ${email} — o pagamento já foi cobrado.`
                );
            }

            await base44.asServiceRole.entities.Payment.create({
                user_email: email,
                // Sem stripe_subscription_id: pagamento único não tem assinatura.
                // Quem lê este campo (getUserSubscriptionInfo, cancelStripeSubscription)
                // já trata a ausência dele — o cancelStripeSubscription, aliás,
                // depende dela para recusar cancelar um vitalício.
                stripe_subscription_id: null,
                // O PaymentIntent é a chave do estorno: o charge.refunded traz
                // charge.payment_intent, e é por ele que a cobrança é ligada de
                // volta a esta linha.
                reference_id: paymentIntentId || `stripe_lifetime_${Date.now()}`,
                // Valor REAL da session. A heurística `amount/100 >= 400 ? 499 : 59`
                // usada no caminho das assinaturas erraria justamente aqui: R$400
                // cai em cima do limiar dela e viraria 499.
                amount: amount != null ? amount / 100 : 400,
                discount_amount: 0,
                coupon_id: null,
                status: 'PAID',
                payment_method: LIFETIME_PAYMENT_METHOD,
                paid_at: new Date().toISOString()
            });

            // Sem CouponUsage de propósito: não existe cupom neste fluxo.

            await notificarCompra({
                plano: 'lifetime',
                email,
                conta: contas.length > 0 ? contas[0] : null,
                amount
            });
        }

        // Helper para marcar premium e registrar pagamento
        async function activatePremium(email, { amount, subscriptionId, couponId, plano }) {
            if (!email) return;

            // CORTE: a assinatura passa a viver na Account. A resolução já era
            // por email, que é idêntico dos dois lados — só o alvo muda.
            const contas = await base44.asServiceRole.entities.Account.filter({
                email: email.trim().toLowerCase()
            });
            if (contas.length > 0) {
                await base44.asServiceRole.entities.Account.update(contas[0].id, {
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
                    const basePrice = amount != null && amount / 100 >= 400 ? 499 : 59;
                    const finalPrice = amount != null ? amount / 100 : basePrice;
                    await base44.asServiceRole.entities.CouponUsage.create({
                        coupon_id: couponId,
                        user_email: email,
                        original_price: basePrice,
                        discount_applied: Math.max(0, basePrice - finalPrice),
                        final_price: finalPrice,
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

            await notificarCompra({
                plano,
                email,
                conta: contas.length > 0 ? contas[0] : null,
                amount,
                couponId
            });
        }

        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const email = session.customer_email || session.customer_details?.email || session.metadata?.user_email;

            // O plano vem explícito da metadata da session, gravado pelo
            // createStripeCheckout. Nada de inferir pelo valor.
            if (session.metadata?.plan === 'lifetime') {
                await activateLifetime(email, {
                    amount: session.amount_total,
                    paymentIntentId: typeof session.payment_intent === 'string'
                        ? session.payment_intent
                        : session.payment_intent?.id || null
                });
            } else {
                await activatePremium(email, {
                    amount: session.amount_total,
                    subscriptionId: session.subscription,
                    couponId: session.metadata?.coupon_id || null,
                    plano: session.metadata?.plan || null
                });
            }
        }

        if (event.type === 'customer.subscription.deleted') {
            const sub = event.data.object;
            const email = sub.metadata?.user_email;
            if (email) {
                const contas = await base44.asServiceRole.entities.Account.filter({
                    email: email.trim().toLowerCase()
                });
                if (contas.length > 0) {
                    // INVARIANTE lifetime_access
                    // Quem tem lifetime_access NUNCA é escrito como 'free'.
                    // subscription_type é o que CONCEDE o acesso — todas as
                    // telas do app checam 'premium' e nenhuma sabe o que é
                    // vitalício. lifetime_access não concede nada: ele só
                    // impede o rebaixamento. É a combinação dos dois que
                    // sustenta o vitalício sem tocar em nenhuma tela.
                    //
                    // Aqui isso importa porque um comprador vitalício pode ter
                    // tido uma assinatura antes (ele só precisava estar 'free'
                    // no dia da compra, não nunca ter assinado). Quando aquela
                    // assinatura antiga expirar no Stripe, este evento chega e
                    // rebaixaria alguém que pagou pelo acesso permanente.
                    if (contas[0].lifetime_access === true) {
                        console.log('🔒 INVARIANTE lifetime_access: rebaixamento ignorado para', email);
                    } else {
                        await base44.asServiceRole.entities.Account.update(contas[0].id, {
                            subscription_type: 'free'
                        });
                    }
                }
            }
        }

        // ESTORNO — exigido pelo direito de arrependimento do CDC.
        //
        // charge.refunded dispara para QUALQUER estorno, inclusive o de uma
        // assinatura. Antes de revogar coisa alguma é obrigatório confirmar que
        // aquela cobrança é de um vitalício, e isso é feito pelo registro em
        // Payment — pelo PaymentIntent gravado no reference_id —, nunca por
        // adivinhação de valor.
        if (event.type === 'charge.refunded') {
            const charge = event.data.object;
            const paymentIntentId = typeof charge.payment_intent === 'string'
                ? charge.payment_intent
                : charge.payment_intent?.id || null;

            // NÃO usamos charge.refunds[]: desde a API 2022-11-15 a lista de
            // refunds deixou de vir expandida por padrão na Charge, e continua
            // assim na 2026-05-27.dahlia — ela viria ausente ou truncada.
            // `amount` e `amount_refunded` estão sempre na Charge, e são o que
            // basta para distinguir estorno total de parcial.
            const total = charge.amount_refunded >= charge.amount;

            let pagamento = null;
            if (paymentIntentId) {
                const linhas = await base44.asServiceRole.entities.Payment.filter({
                    reference_id: paymentIntentId
                });
                pagamento = linhas && linhas.length > 0 ? linhas[0] : null;
            }

            if (!pagamento || pagamento.payment_method !== LIFETIME_PAYMENT_METHOD) {
                // Estorno de assinatura, ou cobrança que não conhecemos.
                // Ignorar é o comportamento certo: o ciclo de vida da
                // assinatura é do customer.subscription.deleted, não daqui.
                console.log('↩️ charge.refunded ignorado (não é vitalício):', paymentIntentId);
            } else if (!total) {
                // ESTORNO PARCIAL NÃO REVOGA.
                //
                // O vitalício é indivisível: não existe "70% de acesso
                // permanente". Um estorno parcial é, na prática, um ajuste
                // comercial — desconto retroativo, correção de cobrança — e
                // não uma desistência da compra. O arrependimento do CDC é
                // devolução integral, e é essa que aparece aqui como total.
                //
                // O erro é assimétrico: revogar por engano tira o acesso de
                // quem pagou; não revogar por engano deixa acesso a quem
                // recebeu parte do dinheiro de volta. O segundo é reversível
                // à mão, o primeiro queima o cliente.
                console.warn(
                    `⚠️ Estorno PARCIAL de vitalício (${charge.amount_refunded}/${charge.amount}) ` +
                    `para ${pagamento.user_email}. Acesso MANTIDO — revisar à mão.`
                );
            } else {
                const contas = await base44.asServiceRole.entities.Account.filter({
                    email: (pagamento.user_email || '').trim().toLowerCase()
                });
                const conta = contas.length > 0 ? contas[0] : null;

                if (conta) {
                    // Ordem intencional: primeiro cai lifetime_access, depois
                    // subscription_type. Invertido, uma falha no meio deixaria
                    // a conta 'free' com lifetime_access true — um usuário sem
                    // acesso e blindado contra recuperá-lo por qualquer
                    // caminho automático.
                    await base44.asServiceRole.entities.Account.update(conta.id, {
                        lifetime_access: false,
                        subscription_type: 'free'
                    });
                } else {
                    // A conta sumiu entre a compra e o estorno (exclusão de
                    // conta, e-mail alterado no registro). O dinheiro voltou e
                    // NADA foi revogado — mas o Payment abaixo vira CANCELED do
                    // mesmo jeito, então sem este log o rastro fica idêntico ao
                    // de um estorno bem sucedido.
                    console.error(
                        `🚨 Estorno total de vitalício SEM Account para ${pagamento.user_email}. ` +
                        `Acesso NAO foi revogado — verificar e revogar a mao.`
                    );
                }

                await base44.asServiceRole.entities.Payment.update(pagamento.id, {
                    status: 'CANCELED',
                    updated_at: new Date().toISOString()
                });

                // O log tem que distinguir os dois desfechos. Antes ele afirmava
                // "acesso revogado" mesmo quando a busca da Account voltava
                // vazia e nada tinha sido revogado — quem fosse investigar um
                // cliente reclamando de acesso indevido leria no log que a
                // revogação aconteceu, e procuraria o problema no lugar errado.
                console.log(
                    conta
                        ? '↩️ Vitalício estornado e acesso revogado: ' + pagamento.user_email
                        : '↩️ Vitalício estornado SEM revogar acesso: ' + pagamento.user_email
                );
            }
        }

        return Response.json({ received: true });

    } catch (error) {
        console.error('Erro no webhook Stripe:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});