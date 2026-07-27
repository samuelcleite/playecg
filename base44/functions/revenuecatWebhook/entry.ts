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
    // app_user_id foi historicamente o User.id do Base44 e passa a ser o Account.id
    // depois do corte do AuthContext. Durante a transição as duas coisas circulam:
    // compra antiga carrega um id, compra nova carrega o outro, e o RevenueCat não
    // oferece alias pelo caminho que o Despia expõe. Resolvemos pelos dois.
    const appUserId = event.app_user_id;

    console.log('📩 RevenueCat event:', type, 'user:', appUserId);
    if (!appUserId) return Response.json({ received: true });

    // Resolve o app_user_id até a linha User (que continua sendo o registro de escrita
    // até o corte). Tenta como User.id; se não achar, tenta como Account.id e usa o
    // email da Account para chegar no User.
    async function resolveUsers() {
      const porId = await base44.asServiceRole.entities.User.filter({ id: appUserId });
      if (porId.length > 0) return porId;

      const contas = await base44.asServiceRole.entities.Account.filter({ id: appUserId });
      if (contas.length === 0) return [];

      const email = (contas[0].email || '').trim().toLowerCase();
      if (!email) return [];
      return await base44.asServiceRole.entities.User.filter({ email });
    }

    const ACTIVATE = ['INITIAL_PURCHASE','RENEWAL','UNCANCELLATION','PRODUCT_CHANGE','NON_RENEWING_PURCHASE'];
    const DEACTIVATE = ['EXPIRATION']; // CANCELLATION NÃO revoga (só desliga a renovação)
    // Eventos que representam dinheiro novo. UNCANCELLATION e PRODUCT_CHANGE
    // reativam/alteram o plano, mas não geram cobrança — não viram Payment.
    const BILLABLE = ['INITIAL_PURCHASE','RENEWAL','NON_RENEWING_PURCHASE'];

    if (ACTIVATE.includes(type)) {
      const users = await resolveUsers();
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
      const users = await resolveUsers();
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