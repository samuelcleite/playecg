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

    // `store` no log: é o campo que decide o payment_method logo abaixo, e sem
    // isso só dá para conferir se ele chegou olhando o Payment já gravado.
    console.log('📩 RevenueCat event:', type, 'store:', event.store, 'user:', appUserId);
    if (!appUserId) return Response.json({ received: true });

    // Resolve o app_user_id até a Account, que passa a ser o registro de escrita.
    // Tenta como Account.id (compras feitas depois do corte); se não achar, tenta
    // como User.id (todas as compras anteriores) e chega na Account pelo email.
    async function resolveAccount() {
      const porId = await base44.asServiceRole.entities.Account.filter({ id: appUserId });
      if (porId.length > 0) return porId[0];

      // Id anônimo do aparelho, gravado pelo linkRevenueCatUser.
      //
      // É o caminho do offer code do iOS: o resgate acontece FORA do app, o
      // external_id nunca é enviado, e a assinatura nasce colada num
      // $RCAnonymousID. Sem esta consulta o evento cai no vazio e a pessoa paga
      // sem receber acesso.
      const porAparelho = await base44.asServiceRole.entities.Account.filter({
        revenuecat_user_id: appUserId
      });
      if (porAparelho.length === 1) return porAparelho[0];
      if (porAparelho.length > 1) {
        // Duas contas apontando para o mesmo aparelho (a pessoa saiu e outra
        // entrou no mesmo iPhone). Escolher uma seria chutar, e o erro é
        // assimétrico: conceder para a conta errada dá premium a quem não pagou
        // E deixa quem pagou sem nada. Não resolver deixa só o segundo caso, e
        // este log é o que permite arrumar à mão.
        console.error(
          `🚨 revenuecat_user_id ${appUserId} aponta para ${porAparelho.length} contas. ` +
          `Evento NÃO atribuído — resolver à mão: ` +
          porAparelho.map((c) => c.email).join(', ')
        );
        return null;
      }

      const users = await base44.asServiceRole.entities.User.filter({ id: appUserId });
      if (users.length === 0) return null;

      const email = (users[0].email || '').trim().toLowerCase();
      if (!email) return null;
      const contas = await base44.asServiceRole.entities.Account.filter({ email });
      return contas.length > 0 ? contas[0] : null;
    }

    const ACTIVATE = ['INITIAL_PURCHASE','RENEWAL','UNCANCELLATION','PRODUCT_CHANGE','NON_RENEWING_PURCHASE'];
    const DEACTIVATE = ['EXPIRATION']; // CANCELLATION NÃO revoga (só desliga a renovação)
    // Eventos que representam dinheiro novo. UNCANCELLATION e PRODUCT_CHANGE
    // reativam/alteram o plano, mas não geram cobrança — não viram Payment.
    const BILLABLE = ['INITIAL_PURCHASE','RENEWAL','NON_RENEWING_PURCHASE'];

    // Só compra NOVA notifica. RENEWAL fica de fora de propósito: o
    // checkout.session.completed do Stripe só dispara na primeira compra, então
    // notificar renovação aqui encheria a caixa de entrada de renovação de loja
    // sem nenhuma equivalente da web — assimetria que engana quem lê.
    const NOTIFICAR = ['INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE'];

    const ADMIN_EMAIL = 'ecgdescomplica@gmail.com';

    const LOJA_LABEL = {
      APP_STORE:     'App Store (iOS)',
      PLAY_STORE:    'Google Play (Android)',
      MAC_APP_STORE: 'Mac App Store',
      AMAZON:        'Amazon Appstore',
      STRIPE:        'Stripe (via RevenueCat)',
      PROMOTIONAL:   'Cortesia / promocional'
    };

    // A modalidade sai do product_id porque o RevenueCat não manda a duração em
    // campo próprio (period_type é NORMAL/TRIAL/INTRO, não mensal/anual). Os ids
    // reais são com.despia.playecg.monthly / .yearly no iOS e premium:monthly /
    // premium:annual no Android — daí os dois vocabulários. Não existe vitalício
    // nas lojas: ele é só Stripe (README §5).
    function modalidadeDoProduto(productId) {
      const p = (productId || '').toLowerCase();
      if (p.includes('year') || p.includes('annual') || p.includes('anual')) return 'Anual';
      if (p.includes('month') || p.includes('mensal')) return 'Mensal';
      return `Não identificada (product_id: ${productId || 'ausente'})`;
    }

    // INVARIANTE store_expires_at
    // Até quando o ciclo pago vale, em ISO, ou null quando o evento não diz.
    //
    // É esta data que dá ao premium de loja a única coisa que ele não tinha: um
    // prazo escrito na nossa Account. Sem ela, o EXPIRATION do RevenueCat era o
    // ÚNICO caminho no sistema inteiro capaz de rebaixar um assinante de loja —
    // um evento externo, sem segunda chance. Perdido, mal atribuído ou
    // respondido com erro, o acesso pago virava vitalício por acidente, e nada
    // no sistema percebia. Foi o que aconteceu: assinatura cancelada, expirada
    // na App Store em 29/08, e a conta seguiu premium.
    //
    // A data NÃO rebaixa ninguém sozinha — ela só autoriza o getMyAccount a
    // perguntar ao RevenueCat quando o prazo passa. Quem decide continua sendo
    // a loja. Por isso um RENEWAL perdido não derruba pagante: o prazo vence, a
    // consulta responde "ativa", e a data é empurrada para a frente.
    //
    // null quando ausente (o NON_RENEWING_PURCHASE não tem expiração): campo
    // vazio significa "não vence por este caminho", que é o certo para uma
    // compra sem prazo.
    function fimDoCicloPago(ev) {
      const ms = ev?.expiration_at_ms;
      if (typeof ms !== 'number' || !isFinite(ms)) return null;
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d.toISOString();
    }

    // Mesmo contrato do stripeWebhook: falha de e-mail é engolida. Erro aqui
    // faria o RevenueCat re-tentar o evento e regravar o Payment.
    async function notificarCompra(conta, ev) {
      try {
        const modalidade = modalidadeDoProduto(ev.product_id);
        const loja = LOJA_LABEL[ev.store] || ev.store || 'origem não informada';
        const preco = ev.price_in_purchased_currency;
        const valor = preco != null ? `${preco} ${ev.currency || 'BRL'}` : 'não informado';
        const quando = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

        await base44.asServiceRole.integrations.Core.SendEmail({
          from_name: 'PlayECG — Vendas',
          to: ADMIN_EMAIL,
          subject: `[COMPRA] ${modalidade} — ${conta.email || 'e-mail desconhecido'}`,
          body: [
            'Nova compra confirmada no PlayECG.',
            '',
            `Usuário:    ${conta.full_name || 'nome não informado'}`,
            `E-mail:     ${conta.email || 'não informado'}`,
            `Origem:     ${loja}`,
            `Modalidade: ${modalidade}`,
            `Valor pago: ${valor}`,
            `Data:       ${quando} (horário de Brasília)`
          ].join('\n')
        });
      } catch (e) {
        console.error('Falha ao notificar compra de loja (acesso JÁ concedido):', e.message);
      }
    }

    if (ACTIVATE.includes(type)) {
      const conta = await resolveAccount();
      if (conta) {
        await base44.asServiceRole.entities.Account.update(conta.id, {
          subscription_type: 'premium',
          subscription_start_date: new Date().toISOString(),
          // INVARIANTE trial_ends_at
          // Quem PAGA deixa de ter cortesia. Sem isto, o assinante que comprou
          // na loja durante o trial seria rebaixado pela expiração do
          // getMyAccount no dia em que a cortesia venceria.
          trial_ends_at: null,
          trial_started_at: null,
          // INVARIANTE store_expires_at
          // O prazo do ciclo pago, reescrito a CADA ativação. É o RENEWAL que
          // empurra a data para a frente mês a mês; sem ele aqui, o segundo mês
          // de todo assinante venceria na data do primeiro.
          store_expires_at: fimDoCicloPago(event)
        });

      // ── ATRIBUIÇÃO DE PARCERIA ──────────────────────────────────────
      // A loja não sabe o que é o nosso cupom: a compra chega sem código
      // nenhum. O único registro de quem indicou é a PENDÊNCIA que o
      // validateCoupon gravou quando a pessoa digitou o código, e é ela que
      // vira atribuição aqui.
      //
      // Só em compra NOVA. Renovação não reabre a questão de quem indicou —
      // e uma pendência digitada depois da assinatura não pode roubar o
      // crédito de quem trouxe o cliente.
      //
      // Escrita separada da que concede o premium, pelo mesmo motivo do
      // stripeWebhook: aquela mexe em subscription_type e trial_ends_at, e
      // não pode ganhar companhia que possa falhar.
      let cupomDaAtribuicao = conta.referred_by_coupon_id || null;

      if (type === 'INITIAL_PURCHASE' || type === 'NON_RENEWING_PURCHASE') {
        try {
          const atribuicao = {
            pending_referral_coupon_id: null,
            pending_referral_code: null,
            pending_referral_at: null
          };
          if (conta.pending_referral_coupon_id) {
            atribuicao.referred_by_coupon_id = conta.pending_referral_coupon_id;
            atribuicao.referred_by_code = conta.pending_referral_code || null;
            atribuicao.referred_at = new Date().toISOString();
            cupomDaAtribuicao = conta.pending_referral_coupon_id;
          }
          await base44.asServiceRole.entities.Account.update(conta.id, atribuicao);
        } catch (erroAtribuicao) {
          console.error(
            'Falha ao gravar atribuição de parceria (acesso JÁ concedido):',
            erroAtribuicao.message
          );
        }
      }

      // ── RESGATE DO CUPOM ────────────────────────────────────────────
      // Sem isto, limite de uso é decorativo em metade das plataformas: o
      // used_count nunca subiria numa compra de loja, um cupom com limite de
      // 100 nunca esgotaria pelo app, e o one_per_user não teria CouponUsage
      // para consultar — a mesma pessoa reusaria o código à vontade.
      //
      // Só em compra NOVA: renovação não é resgate novo.
      //
      // Preços de LOJA, que são maiores que os do Stripe (o Google e a Apple
      // cobram comissão). Usar os 59/499 do plans.ts aqui gravaria desconto
      // errado no relatório.
      if (cupomDaAtribuicao && (type === 'INITIAL_PURCHASE' || type === 'NON_RENEWING_PURCHASE')) {
        try {
          const jaUsou = await base44.asServiceRole.entities.CouponUsage.filter({
            coupon_id: cupomDaAtribuicao,
            user_email: conta.email
          });

          if (jaUsou.length === 0) {
            const anual = modalidadeDoProduto(event.product_id) === 'Anual';
            const precoCheio = anual ? 499.90 : 59.90;
            const pago = event.price_in_purchased_currency ?? precoCheio;

            await base44.asServiceRole.entities.CouponUsage.create({
              coupon_id: cupomDaAtribuicao,
              user_email: conta.email,
              original_price: precoCheio,
              discount_applied: Math.max(0, precoCheio - pago),
              final_price: pago,
              used_at: new Date().toISOString()
            });

            // Read-modify-write sem atomicidade, igual ao do stripeWebhook. O
            // SDK do Base44 não expõe update condicional nem transação (ver o
            // mesmo reconhecimento nas vagas do vitalício).
            const cupons = await base44.asServiceRole.entities.Coupon.filter({ id: cupomDaAtribuicao });
            if (cupons.length > 0) {
              const c = cupons[0];
              const novoTotal = (c.used_count || 0) + 1;
              const update = { used_count: novoTotal };
              if (c.usage_limit && novoTotal >= c.usage_limit) update.active = false;
              await base44.asServiceRole.entities.Coupon.update(cupomDaAtribuicao, update);
            }
          }
        } catch (erroResgate) {
          console.error('Falha ao registrar resgate de cupom (acesso JÁ concedido):', erroResgate.message);
        }
      }

        if (BILLABLE.includes(type)) {
          // O RevenueCat manda a loja em `event.store`. Só APP_STORE e
          // PLAY_STORE viram rótulo próprio: qualquer outra coisa (campo
          // ausente, AMAZON, TEST_STORE...) cai no rótulo histórico da App
          // Store, que é o que TODOS os leitores já tratam. Inventar um
          // terceiro valor aqui deixaria o Payment invisível para
          // getUserSubscriptionInfo e para a checagem de exclusão de conta.
          const paymentMethod = event.store === 'PLAY_STORE'
            ? 'PLAY_STORE_SUBSCRIPTION'
            : 'APP_STORE_SUBSCRIPTION';

          // O premium já foi concedido acima. Se o registro de Payment falhar,
          // apenas logamos: retornar erro faria o RevenueCat re-tentar o evento
          // inteiro sem necessidade.
          try {
            await base44.asServiceRole.entities.Payment.create({
              user_email: conta.email,
              reference_id: event.transaction_id || event.original_transaction_id || `appstore_${Date.now()}`,
              amount: event.price_in_purchased_currency ?? 0,
              discount_amount: 0,
              // Atribuição congelada no momento do pagamento. Sem isto, as
              // compras de loja ficavam invisíveis para o relatório por
              // parceiro, que agrupa por Payment.coupon_id.
              //
              // Aqui coupon_id significa "o cupom que trouxe este assinante",
              // não "desconto aplicado nesta cobrança" — o desconto da loja
              // vem da oferta do Play, não do nosso cupom, e por isso
              // discount_amount continua zero.
              coupon_id: cupomDaAtribuicao,
              status: 'PAID',
              payment_method: paymentMethod,
              paid_at: new Date().toISOString()
            });
          } catch (paymentError) {
            console.error('Erro ao criar Payment de loja:', paymentError.message);
          }

          if (NOTIFICAR.includes(type)) await notificarCompra(conta, event);
        }
      }
    } else if (DEACTIVATE.includes(type)) {
      const conta = await resolveAccount();
      if (conta) {
        // INVARIANTE lifetime_access
        // Quem tem lifetime_access NUNCA é escrito como 'free'.
        // subscription_type é o que CONCEDE o acesso — todas as telas do app
        // checam 'premium' e nenhuma sabe o que é vitalício. lifetime_access
        // não concede nada: ele só impede o rebaixamento. É a combinação dos
        // dois que sustenta o vitalício sem tocar em nenhuma tela.
        //
        // Aqui isso importa porque o comprador vitalício pode ter tido uma
        // assinatura de loja antes (ele só precisava estar 'free' no dia da
        // compra, não nunca ter assinado). Quando aquela assinatura expirar,
        // a App Store / Play Store manda EXPIRATION meses depois e rebaixaria
        // alguém que pagou pelo acesso permanente.
        // INVARIANTE trial_ends_at
        // Cortesia em curso também barra o rebaixamento, pelo mesmo motivo e no
        // mesmo cenário: quem ganhou cortesia estava 'free' no dia (a concessão
        // recusa assinante pago), mas pode ter tido assinatura de loja antes. O
        // EXPIRATION tardio dela chegaria agora e apagaria uma cortesia que mal
        // começou.
        //
        // A cortesia não é apagada nem adiada: ela continua com o prazo que
        // tinha, e vence sozinha no getMyAccount.
        const fimCortesia = conta.trial_ends_at ? new Date(conta.trial_ends_at) : null;
        const emCortesia = !!(
          fimCortesia && !isNaN(fimCortesia.getTime()) && fimCortesia > new Date()
        );

        // INVARIANTE store_expires_at
        // O ciclo pago acabou — este evento É a notícia disso. A data sai da
        // Account nos TRÊS desfechos abaixo, inclusive nos dois em que o
        // rebaixamento é recusado: deixá-la lá seria deixar uma expiração
        // armada contra quem o invariante acabou de proteger, e o getMyAccount
        // gastaria uma consulta ao RevenueCat a cada carregamento de tela para
        // reencontrar a mesma resposta.
        if (conta.lifetime_access === true) {
          console.log('🔒 INVARIANTE lifetime_access: rebaixamento ignorado para', conta.email);
          await base44.asServiceRole.entities.Account.update(conta.id, { store_expires_at: null });
        } else if (emCortesia) {
          console.log('🔒 INVARIANTE trial_ends_at: rebaixamento ignorado (cortesia em curso) para', conta.email);
          await base44.asServiceRole.entities.Account.update(conta.id, { store_expires_at: null });
        } else {
          await base44.asServiceRole.entities.Account.update(conta.id, {
            subscription_type: 'free',
            store_expires_at: null
          });
        }
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error('Erro no webhook RevenueCat:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});