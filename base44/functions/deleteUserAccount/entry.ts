import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe@17.5.0';

// Lojas de billing nativo: só o próprio usuário cancela, dentro da loja — nunca via servidor.
const STORE_SUBS = ['app_store', 'play_store'];
// Lojas do RevenueCat que NÃO exigem cancelamento na loja: Stripe (cancelável via API,
// aqui tratado à parte) e promotional (cortesia, não cobra). Qualquer outra loja resolvida
// é tratada como billing de loja e bloqueia.
const NON_STORE = ['stripe', 'promotional'];

// Consulta UM app_user_id no RevenueCat. Retorna:
//   { error: true }                    -> incerteza (fail closed)
//   { active: true }                   -> entitlement de loja ativo
//   { active: false, historico: bool } -> sem entitlement ativo; `historico` diz se o
//                                         RevenueCat conhece esse id de alguma forma.
// `historico` é o que distingue "nunca comprou" de "id errado": o GET /v1/subscribers é
// "get-or-create", então um id errado mas bem-formado devolve 200/201 com um subscriber
// VAZIO. Quem decide o que fazer com isso é checkActiveStoreSubscription.
async function checkOneSubscriber(appUserId) {
    const apiKey = Deno.env.get('REVENUECAT_SECRET_KEY');
    if (!apiKey) {
        console.error('deleteUserAccount: REVENUECAT_SECRET_KEY ausente');
        return { error: true };
    }

    let resp;
    try {
        resp = await fetch(
            `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
            { headers: { Authorization: `Bearer ${apiKey}` } }
        );
    } catch (e) {
        console.error('deleteUserAccount: falha de rede ao consultar RevenueCat:', e.message);
        return { error: true };
    }

    // GET é "get-or-create": 200 (existente) ou 201 (criado vazio) são OK. Outro status = incerteza.
    if (resp.status !== 200 && resp.status !== 201) {
        console.error('deleteUserAccount: RevenueCat status inesperado:', resp.status);
        return { error: true };
    }

    let body;
    try {
        body = await resp.json();
    } catch (e) {
        console.error('deleteUserAccount: JSON inválido do RevenueCat:', e.message);
        return { error: true };
    }

    const subscriber = body?.subscriber || {};
    const entitlements = subscriber.entitlements || {};
    const subscriptions = subscriber.subscriptions || {};
    const now = Date.now();

    for (const ent of Object.values(entitlements)) {
        // Ativo: sem expiração (vitalício) OU expiração no futuro.
        const exp = ent?.expires_date;
        const isActive = exp == null || new Date(exp).getTime() > now;
        if (!isActive) continue;

        // Entitlement ATIVO: a loja vem da subscription vinculada pelo product_identifier.
        const sub = subscriptions[ent?.product_identifier];
        const store = sub?.store;

        if (typeof store !== 'string' || store.length === 0) {
            // Ativo mas loja indeterminável → FAIL CLOSED (não liberar exclusão).
            console.error('deleteUserAccount: entitlement ativo sem store resolvível:', ent?.product_identifier);
            return { error: true };
        }
        if (NON_STORE.includes(store)) {
            continue; // Stripe/promotional: não bloqueia por este entitlement.
        }
        if (sub.unsubscribe_detected_at) {
            // Renovação já desligada na loja: sem cobrança futura → a justificativa do
            // bloqueio evapora. Deixa passar (não trava a conta até a expiração).
            continue;
        }
        // app_store, play_store, ou qualquer outra loja nativa resolvida, com renovação
        // ainda ativa → bloquear.
        return { active: true };
    }

    // Nenhum entitlement de loja ativo para este id.
    const historico =
        Object.keys(entitlements).length > 0 ||
        Object.keys(subscriptions).length > 0 ||
        Object.keys(subscriber.non_subscriptions || {}).length > 0;

    return { active: false, historico };
}

// Consulta TODOS os ids sob os quais este usuário pode ter comprado.
//
// Por que mais de um: o app_user_id do RevenueCat foi historicamente o User.id do Base44
// e passa a ser o Account.id depois do corte do AuthContext. Durante a transição as duas
// coisas coexistem — compra feita antes está gravada sob um id, compra feita depois sob o
// outro — e o RevenueCat não oferece alias pelo caminho que o Despia expõe (só
// revenuecat://purchase, launchPaywall e getpurchasehistory://). Então a única saída
// correta é perguntar por todos os ids candidatos.
//
// FAIL CLOSED em três situações:
//   - qualquer consulta incerta (rede, status, JSON, loja indeterminável);
//   - qualquer id com entitlement de loja ativo;
//   - existe compra de App Store nos nossos registros e NENHUM dos ids é conhecido pelo
//     RevenueCat — sinal de que estamos perguntando pelo id errado, não de que não há
//     assinatura. Sem isso, esta função autorizaria excluir conta com assinatura ATIVA.
async function checkActiveStoreSubscription(appUserIds, hadStorePurchase) {
    const apiKey = Deno.env.get('REVENUECAT_SECRET_KEY');
    if (!apiKey) {
        console.error('deleteUserAccount: REVENUECAT_SECRET_KEY ausente');
        return { error: true };
    }

    const ids = [...new Set((appUserIds || []).filter(Boolean))];
    if (ids.length === 0) {
        // Sem nenhum id para consultar não dá para afirmar nada.
        console.error('deleteUserAccount: nenhum app_user_id candidato para consultar');
        return { error: true };
    }

    let algumHistorico = false;
    for (const id of ids) {
        const r = await checkOneSubscriber(id);
        if (r.error) return { error: true };
        if (r.active) return { active: true };
        if (r.historico) algumHistorico = true;
    }

    if (hadStorePurchase && !algumHistorico) {
        console.error(
            'deleteUserAccount: existe Payment de App Store mas o RevenueCat não conhece nenhum dos ids:',
            ids.join(', ')
        );
        return { error: true };
    }

    return { active: false };
}

// Cancela a assinatura Stripe se houver uma viva. Robusto a ponteiros obsoletos:
// sub inexistente (resource_missing) ou em status terminal → sucesso (nada a cobrar).
// Falha real (rede/auth/Stripe ao cancelar uma sub viva) → { ok: false } para abortar.
async function cancelStripeIfActive(base44, userEmail) {
    const payments = await base44.asServiceRole.entities.Payment.filter({
        user_email: userEmail,
        status: 'PAID'
    });

    const stripePayment = payments
        .filter(p => p.stripe_subscription_id)
        .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];

    if (!stripePayment || !stripePayment.stripe_subscription_id) {
        return { ok: true }; // nada de Stripe a cancelar
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
    const subId = stripePayment.stripe_subscription_id;
    const TERMINAL = ['canceled', 'incomplete_expired'];

    let sub;
    try {
        sub = await stripe.subscriptions.retrieve(subId);
    } catch (e) {
        // Sub não existe mais no Stripe (ponteiro obsoleto) → seguir com a exclusão.
        if (e?.code === 'resource_missing' || e?.statusCode === 404) {
            return { ok: true };
        }
        console.error('deleteUserAccount: falha ao consultar Stripe:', e.message);
        return { ok: false };
    }

    if (TERMINAL.includes(sub.status)) {
        return { ok: true }; // já encerrada, nada a cobrar
    }

    try {
        await stripe.subscriptions.cancel(subId); // imediato (reusa o comportamento atual)
    } catch (e) {
        console.error('deleteUserAccount: falha ao cancelar Stripe:', e.message);
        return { ok: false };
    }

    return { ok: true };
}

// Apaga TODAS as linhas que casam com o filtro, drenando em lotes até esgotar.
// Não assume que .filter() devolve todas as linhas de uma vez: re-consulta do topo após
// cada lote (as linhas já apagadas não voltam), até uma consulta retornar zero. Correto
// independentemente de haver ou não limite de paginação default no backend.
// Teto de iterações converte um eventual hang (delete que "sucede" sem apagar) em erro
// diagnosticável em vez de travar a função até o timeout.
async function deleteAll(base44, entityName, filter) {
    const MAX_PASSES = 100;
    for (let pass = 0; pass < MAX_PASSES; pass++) {
        const rows = await base44.asServiceRole.entities[entityName].filter(filter);
        if (!rows || rows.length === 0) return;
        for (const row of rows) {
            await base44.asServiceRole.entities[entityName].delete(row.id);
        }
    }
    throw new Error(`deleteAll(${entityName}): excedeu ${MAX_PASSES} passagens sem esgotar as linhas`);
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const userEmail = user.email;

        // 1) Assinatura de loja ativa → BLOQUEAR antes de apagar qualquer coisa.
        // Sinal local de compra na loja: só o revenuecatWebhook cria Payment com este
        // payment_method. Deliberadamente NÃO usamos subscription_type === 'premium' aqui:
        // assinante de Stripe e upgrade manual também são premium e nunca existiram no
        // RevenueCat — bloqueá-los quebraria a exclusão de conta exigida pela Apple.
        const storePayments = await base44.asServiceRole.entities.Payment.filter({
            user_email: userEmail,
            payment_method: 'APP_STORE_SUBSCRIPTION'
        });
        // Ids candidatos no RevenueCat: o User.id (usado por toda compra até hoje) e o
        // Account.id (usado depois do corte do AuthContext). Consultar os dois cobre a
        // transição inteira sem depender de qual fase estamos.
        const contas = await base44.asServiceRole.entities.Account.filter({
            email: (userEmail || '').trim().toLowerCase()
        });
        const accountId = contas && contas.length > 0 ? contas[0].id : null;

        const storeCheck = await checkActiveStoreSubscription(
            [user.id, accountId],
            storePayments.length > 0
        );
        if (storeCheck.error) {
            // FAIL CLOSED: não conseguimos verificar → não excluir.
            return Response.json({
                success: false,
                code: 'store_check_failed',
                error: 'Não foi possível verificar sua assinatura agora. Nenhum dado foi excluído. Tente novamente em instantes.'
            });
        }
        if (storeCheck.active) {
            return Response.json({
                success: false,
                code: 'store_subscription_active',
                error: 'Cancele sua assinatura na App Store / Google Play antes de excluir a conta.'
            });
        }

        // 2) Cancelar Stripe (se houver) ANTES de apagar Payment.
        const stripeResult = await cancelStripeIfActive(base44, userEmail);
        if (!stripeResult.ok) {
            return Response.json({
                success: false,
                code: 'stripe_cancel_failed',
                error: 'Não foi possível cancelar sua assinatura agora. Nenhum dado foi excluído. Tente novamente em instantes.'
            });
        }

        // 3) A partir daqui, apagar. Filhos primeiro, User por último: uma falha parcial
        // deixa apenas dados órfãos benignos e a conta ainda autenticável para retry.
        await deleteAll(base44, 'QuizAttempt', { user_email: userEmail });
        await deleteAll(base44, 'DailyQuizStats', { user_email: userEmail });
        await deleteAll(base44, 'CouponUsage', { user_email: userEmail });
        await deleteAll(base44, 'UserProgress', { user_email: userEmail });
        await deleteAll(base44, 'UserAchievement', { user_email: userEmail });
        // Duas passagens: a PushSubscription migrou de user_id para user_email na
        // Fase 1.2, e linhas antigas podem ter só uma das duas chaves preenchidas.
        // Apagar por email E por id garante que nada sobrevive à exclusão da
        // conta — deixar uma inscrição órfã significaria continuar mandando push
        // para alguém que pediu para ser esquecido.
        await deleteAll(base44, 'PushSubscription', { user_email: userEmail });
        await deleteAll(base44, 'PushSubscription', { user_id: user.id });
        // Payment por último entre os filhos: só depois do cancelamento do Stripe.
        await deleteAll(base44, 'Payment', { user_email: userEmail });

        // User por último.
        await base44.asServiceRole.entities.User.delete(user.id);

        return Response.json({ success: true });
    } catch (error) {
        console.error('Error deleting account:', error);
        return Response.json({
            success: false,
            error: error.message || 'Erro ao deletar conta'
        }, { status: 500 });
    }
});
