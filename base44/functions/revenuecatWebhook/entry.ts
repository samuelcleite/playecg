import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    // Autenticação: valor do header configurado no painel do RevenueCat
    const authHeader = req.headers.get('authorization');
    const expected = Deno.env.get('REVENUECAT_WEBHOOK_AUTH');
    if (!expected || authHeader !== expected) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // A auth já foi validada acima pelo nosso segredo. Agora removemos o header
    // Authorization (formato "cru", sem Bearer) antes de passar ao SDK do Base44,
    // porque createClientFromRequest exige "Bearer <token>" e quebraria com ele.
    const cleanHeaders = new Headers(req.headers);
    cleanHeaders.delete('authorization');
    const cleanReq = new Request(req.url, {
      method: req.method,
      headers: cleanHeaders,
      body: req.body,
    });

    const base44 = createClientFromRequest(cleanReq);
    const payload = await req.json();
    const event = payload.event || {};
    const type = event.type;
    const appUserId = event.app_user_id; // = User.id do Base44 (external_id)

    console.log('📩 RevenueCat event:', type, 'user:', appUserId);
    if (!appUserId) return Response.json({ received: true });

    const ACTIVATE = ['INITIAL_PURCHASE','RENEWAL','UNCANCELLATION','PRODUCT_CHANGE','NON_RENEWING_PURCHASE'];
    const DEACTIVATE = ['EXPIRATION']; // CANCELLATION NÃO revoga (só desliga a renovação)
    // Eventos que representam dinheiro novo. UNCANCELLATION e PRODUCT_CHANGE
    // reativam/alteram o plano, mas não geram cobrança — não viram Payment.
    const BILLABLE = ['INITIAL_PURCHASE','RENEWAL','NON_RENEWING_PURCHASE'];

    if (ACTIVATE.includes(type)) {
      const users = await base44.asServiceRole.entities.User.filter({ id: appUserId });
      if (users.length > 0) {
        await base44.asServiceRole.entities.User.update(users[0].id, {
          subscription_type: 'premium',
          subscription_start_date: new Date().toISOString()
        });

        if (BILLABLE.includes(type)) {
          // O premium já foi concedido acima. Se o registro de Payment falhar,
          // apenas logamos: retornar erro faria o RevenueCat re-tentar o evento
          // inteiro sem necessidade.
          try {
            await base44.asServiceRole.entities.Payment.create({
              user_email: users[0].email,
              reference_id: event.transaction_id || event.original_transaction_id || `appstore_${Date.now()}`,
              amount: event.price_in_purchased_currency ?? 0,
              discount_amount: 0,
              status: 'PAID',
              payment_method: 'APP_STORE_SUBSCRIPTION',
              paid_at: new Date().toISOString()
            });
          } catch (paymentError) {
            console.error('Erro ao criar Payment do App Store:', paymentError.message);
          }
        }
      }
    } else if (DEACTIVATE.includes(type)) {
      const users = await base44.asServiceRole.entities.User.filter({ id: appUserId });
      if (users.length > 0) {
        await base44.asServiceRole.entities.User.update(users[0].id, {
          subscription_type: 'free'
        });
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error('Erro no webhook RevenueCat:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});