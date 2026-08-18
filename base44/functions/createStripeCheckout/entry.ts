import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@17.5.0';

function b64urlToBytes(input) {
  let s = input.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function b64urlToStr(input) {
  let s = input.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return atob(s);
}

// Verifica um JWT HS256 assinado com a mesma JWT_SECRET e os mesmos parâmetros
// (crypto.subtle nativo, sem dependência externa) que googleSignIn/appleSignIn
// usam para assinar. Qualquer falha (base64 inválido, assinatura, exp) => null,
// para cair de volta no fluxo de sessão Base44 em vez de derrubar a função.
async function verifyJwtHS256(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const header = JSON.parse(b64urlToStr(headerB64));
    if (header.alg !== 'HS256') return null;
    const payload = JSON.parse(b64urlToStr(payloadB64));

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlToBytes(sigB64),
      new TextEncoder().encode(`${headerB64}.${payloadB64}`)
    );
    if (!valid) return null;

    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch (_e) {
    return null;
  }
}

// Aceita tanto o JWT próprio (googleSignIn/appleSignIn) quanto a sessão Base44.
// JWT NUNCA concede admin: role é sempre 'user' nesse caminho, por decisão de
// arquitetura — mesmo que o payload assinado carregue um campo role.
async function resolveIdentity(req, base44) {
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const secret = Deno.env.get('JWT_SECRET');
    if (secret) {
      const token = authHeader.slice('Bearer '.length).trim();
      const payload = await verifyJwtHS256(token, secret);
      if (payload && payload.email) {
        return { email: payload.email, role: 'user', source: 'jwt' };
      }
    }
  }

  // base44.auth.me() LANÇA (não retorna null) quando o Authorization traz um
  // Bearer que não é JWT próprio válido nem sessão Base44 — tratamos a exceção
  // como não autenticado: null, o contrato já esperado por quem chama (=> 401).
  let user;
  try {
    user = await base44.auth.me();
  } catch (_e) {
    return null;
  }
  if (user) {
    return { email: user.email, role: user.role, source: 'base44' };
  }

  return null;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const identity = await resolveIdentity(req, base44);
        if (!identity) {
            return Response.json({ error: 'Não autenticado', success: false }, { status: 401 });
        }

        // O registro do usuário é a Account. Antes isto era base44.auth.me(), que
        // sob JWT falha — e falharia justamente no fluxo de pagamento.
        const contas = await base44.asServiceRole.entities.Account.filter({
            email: (identity.email || '').trim().toLowerCase()
        });
        const user = contas && contas.length > 0 ? contas[0] : null;
        if (!user) {
            return Response.json({ error: 'Conta não encontrada', success: false }, { status: 404 });
        }

        // ACESSO DE CORTESIA CONTA COMO "SEM PLANO" AQUI.
        //
        // Quem está em cortesia é 'premium' — é assim que ele tem acesso — e sem
        // esta distinção a trava logo abaixo recusaria a compra dele com "você
        // já possui assinatura premium". Seria o pior defeito possível desta
        // feature: a cortesia existe para virar venda, e o caminho da venda
        // estaria fechado justamente para quem está experimentando.
        //
        // O que a trava protege é o assinante PAGANTE, que não deve ser cobrado
        // duas vezes. Cortesia não é cobrança, então não há o que proteger.
        const fimCortesia = user.trial_ends_at ? new Date(user.trial_ends_at) : null;
        const emCortesia = !!(
            fimCortesia && !isNaN(fimCortesia.getTime()) && fimCortesia > new Date()
        );

        if (user.subscription_type === 'premium' && !emCortesia) {
            return Response.json({ error: 'Você já possui assinatura premium', success: false }, { status: 400 });
        }

        const { coupon_code, plan } = await req.json();
        const accountId = user.id;

        const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

        // Cópia inline da FONTE ÚNICA DE PLANOS (base44/shared/plans.ts). O
        // Base44 não resolve import relativo entre functions — mesma restrição
        // que obriga o resolveIdentity a ser copiado. Ao mudar preço ou price
        // ID, mude no original primeiro.
        const PLANOS = {
            monthly:  { priceId: "price_1TkQEzLZdvjM2hGBtJTOirwu", valor: 59,  mode: 'subscription' },
            annual:   { priceId: "price_1Tpp38LZdvjM2hGBeSCKbKWh", valor: 499, mode: 'subscription' },
            lifetime: { priceId: "price_1U1jqCLZdvjM2hGBNWpDkSn9", valor: 400, mode: 'payment' }
        };
        const LIFETIME_VAGAS = Number(Deno.env.get('LIFETIME_VAGAS') ?? 100);

        // Resolve o plano. Desconhecido cai no mensal, como antes: errar para o
        // plano mais barato cobra menos do que o usuário esperava.
        //
        // hasOwnProperty e não `PLANOS[plan]`: com o acesso direto, um plan
        // igual a "constructor" ou "toString" acha o membro herdado do
        // Object.prototype, passa como plano válido e chega no Stripe com
        // priceId undefined. O código antigo tinha o mesmo furo.
        const planoId = Object.prototype.hasOwnProperty.call(PLANOS, plan) ? plan : 'monthly';
        const plano = PLANOS[planoId];
        const priceId = plano.priceId;
        const origin = req.headers.get('origin') || '';

        // ── TRAVAS DO VITALÍCIO ──────────────────────────────────────────────
        // Vivem aqui, no BACKEND, e não na tela: o link de venda vai circular
        // no WhatsApp, e chamar esta function direto com { plan: 'lifetime' } é
        // trivial para qualquer pessoa com o console do navegador aberto.
        if (planoId === 'lifetime') {
            // (a) Elegibilidade. A oferta é para quem ainda não tem plano
            // ativo. A checagem é do status ATUAL, não do histórico: quem já
            // foi assinante e hoje está 'free' pode comprar normalmente.
            //
            // A checagem de premium lá em cima já barra o assinante ativo;
            // esta existe para barrar qualquer outro valor que não seja
            // exatamente 'free'.
            //
            // Cortesia passa, pela mesma razão de lá em cima: "plano ativo"
            // quer dizer plano PAGO. Quem está experimentando é exatamente o
            // público desta oferta, e recusá-lo aqui mandaria a pessoa mais
            // perto da compra de volta para o paywall.
            if (user.subscription_type !== 'free' && !emCortesia) {
                return Response.json({
                    error: 'O plano vitalício é uma oferta para quem ainda não tem um plano ativo.',
                    success: false
                }, { status: 400 });
            }

            // (b) Vagas. Contagem server-side dos Accounts já vitalícios.
            //
            // NÃO É ATÔMICA, e não há como torná-la: o SDK do Base44 não expõe
            // update condicional, unicidade nem transação (ver o relatório).
            // Duas sessões criadas no mesmo instante podem passar as duas pela
            // mesma contagem. Isso é aceito de propósito — a regra que importa
            // é a do webhook, que NUNCA nega acesso por vaga esgotada. Vender
            // 101 é problema pequeno; cobrar sem entregar é problema grande.
            const vitalicios = await base44.asServiceRole.entities.Account.filter(
                { lifetime_access: true }, '-created_date', 5000, 0, ['id']
            );
            if (vitalicios.length >= LIFETIME_VAGAS) {
                return Response.json({
                    error: 'As vagas do plano vitalício se esgotaram.',
                    success: false
                }, { status: 400 });
            }
        }

        // Validar cupom (se enviado) e resolver desconto Stripe.
        //
        // O vitalício ignora cupom em silêncio: o preço é o preço, e falhar
        // seria pior — o link é privado e pode chegar a alguém que tem um
        // cupom guardado e o cola por reflexo.
        let stripeCouponId = null;
        let appliedCouponId = null;
        if (planoId !== 'lifetime' && coupon_code && coupon_code.trim()) {
            const normalizedCode = coupon_code.trim().toUpperCase();
            const coupons = await base44.asServiceRole.entities.Coupon.filter({ code: normalizedCode });

            if (coupons.length === 0) {
                return Response.json({ error: 'Cupom não encontrado', success: false }, { status: 400 });
            }

            const coupon = coupons[0];

            if (!coupon.active) {
                return Response.json({ error: 'Cupom desativado', success: false }, { status: 400 });
            }
            if (coupon.valid_from && new Date() < new Date(coupon.valid_from)) {
                return Response.json({ error: 'Cupom ainda não está válido', success: false }, { status: 400 });
            }
            if (coupon.valid_until && new Date() > new Date(coupon.valid_until)) {
                return Response.json({ error: 'Cupom expirado', success: false }, { status: 400 });
            }
            if (coupon.usage_limit != null && coupon.used_count >= coupon.usage_limit) {
                return Response.json({ error: 'Cupom atingiu o limite de usos', success: false }, { status: 400 });
            }
            if (coupon.one_per_user) {
                const previousUsage = await base44.asServiceRole.entities.CouponUsage.filter({
                    coupon_id: coupon.id,
                    user_email: user.email
                });
                if (previousUsage.length > 0) {
                    return Response.json({ error: 'Você já utilizou este cupom', success: false }, { status: 400 });
                }
            }

            appliedCouponId = coupon.id;

            // ── DURAÇÃO DO DESCONTO ──────────────────────────────────────────
            // Antes daqui saía `duration: 'forever'` fixo, e era a única
            // duração que o sistema sabia expressar.
            //
            // O FALLBACK É OBRIGATÓRIO, não é zelo. O campo `duration` entrou
            // no schema do Coupon agora, e default de JSON Schema NÃO preenche
            // registro que já existia — o banco é Mongo (ver o Registro de
            // aprendizados no README). O cupom TESTE1 está em produção
            // exatamente assim, sem o campo. Sem este `??` ele iria para o
            // Stripe como `duration: undefined`, a criação falharia e o
            // usuário levaria um 500 no meio do checkout.
            //
            // O Base44 carimba o default na ESCRITA, então cupom salvo pelo
            // painel depois daquele schema já chega com 'forever' explícito.
            // Quem depende do fallback é o registro que ninguém mais tocou.
            const duracao = coupon.duration ?? 'forever';

            // Valor presente e fora do enum é cupom mal cadastrado, e a saída
            // NÃO é cair em 'forever': num desconto percentual, 'forever' é a
            // opção mais cara que existe. Errar para o mais caro é o oposto do
            // que esta function faz no resto (o plano desconhecido cai no
            // mensal justamente para errar para baixo). Recusa explícita.
            if (!['once', 'repeating', 'forever'].includes(duracao)) {
                console.error(`Cupom ${coupon.code}: duration inválida:`, coupon.duration);
                return Response.json({ error: 'Cupom mal configurado', success: false }, { status: 400 });
            }

            const duracaoParams = { duration: duracao };

            if (duracao === 'repeating') {
                // duration_in_months obrigatório e > 0. É regra CONDICIONAL, e
                // JSON Schema não sabe expressar isso — então ela só pode viver
                // aqui. Sem a checagem, o Stripe recusa a criação do cupom e o
                // erro chega ao usuário como um 500 genérico.
                const meses = Number(coupon.duration_in_months);
                if (!Number.isInteger(meses) || meses <= 0) {
                    console.error(
                        `Cupom ${coupon.code}: repeating exige duration_in_months > 0, veio:`,
                        coupon.duration_in_months
                    );
                    return Response.json({ error: 'Cupom mal configurado', success: false }, { status: 400 });
                }
                duracaoParams.duration_in_months = meses;
            }
            // Em 'once' e 'forever' o duration_in_months NÃO vai junto: o
            // Stripe recusa a combinação, mesmo que o valor esteja gravado no
            // nosso registro (sobra de um cupom que já foi repeating).

            const desconto = coupon.discount_type === 'percentage'
                ? { percent_off: coupon.discount_value }
                : { amount_off: Math.round(coupon.discount_value * 100), currency: 'brl' };

            // JANELA DE RESGATE. O cupom nasce aqui, mas só é resgatado quando
            // a pessoa conclui o pagamento — e a maioria não conclui. Sem
            // prazo, cada checkout abandonado deixa no Stripe um cupom VÁLIDO
            // para sempre, indistinguível de um cupom em uso.
            //
            // 7 dias é folga larga sobre as 24h de validade padrão da Checkout
            // Session: nenhum pagamento legítimo chega depois disso, porque a
            // própria session já expirou muito antes. Passado o prazo, o órfão
            // fica inequivocamente morto.
            //
            // redeem_by governa só o RESGATE. Assinatura que já resgatou mantém
            // o desconto pelo tempo do `duration` — 'forever' segue sendo para
            // sempre.
            const prazoDeResgate = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

            const stripeCoupon = await stripe.coupons.create({
                ...desconto,
                ...duracaoParams,
                redeem_by: prazoDeResgate
            });
            stripeCouponId = stripeCoupon.id;
        }

        const sessionParams = {
            mode: plano.mode,
            line_items: [{ price: priceId, quantity: 1 }],
            customer_email: user.email,
            success_url: `${origin}/Dashboard?payment=success`,
            // O vitalício não sai do paywall, então cancelar não pode devolver
            // para ele: devolve para a própria página de venda.
            cancel_url: planoId === 'lifetime'
                ? `${origin}/Vitalicio?payment=cancel`
                : `${origin}/Upgrade?payment=cancel`,
            metadata: {
                base44_app_id: Deno.env.get("BASE44_APP_ID"),
                user_email: user.email,
                // O QUE foi comprado, explícito, em TODOS os planos — inclusive
                // nos de assinatura, que não precisam disso hoje. O webhook não
                // pode ter que adivinhar o plano pelo valor da cobrança: R$400
                // do vitalício cai justamente em cima do limiar de 400 que a
                // heurística de lá usa para separar mensal de anual.
                plan: planoId,
                // NOTA: nada lê este campo. O stripeWebhook resolve o usuário por
                // customer_email -> customer_details.email -> metadata.user_email, nunca
                // por user_id. Fica aqui só para leitura humana no painel do Stripe, e por
                // isso passa a carregar o Account.id, que é a identidade do usuário depois
                // do corte. Se o Account não existir ainda, cai para o User.id.
                user_id: accountId || user.id,
                coupon_id: appliedCouponId || ''
            }
        };

        if (plano.mode === 'subscription') {
            // subscription_data só existe em mode 'subscription'. O Stripe
            // rejeita a criação da session se ele vier junto com 'payment'.
            sessionParams.subscription_data = {
                metadata: {
                    user_email: user.email,
                    coupon_id: appliedCouponId || ''
                }
            };
        } else {
            // Em mode 'payment' o Checkout NÃO cria Customer por padrão
            // (customer_creation: 'if_required', e pagamento avulso não
            // requer um). O comprador ficaria só como `customer_details` na
            // session: sem objeto Customer, ele não aparece na lista de
            // clientes do painel, não acumula histórico e um estorno futuro
            // fica sem cliente para clicar. Forçamos 'always' para o vitalício
            // ficar rastreável do mesmo jeito que um assinante.
            sessionParams.customer_creation = 'always';

            // Metadata no PaymentIntent, que a cobrança herda. Nada no nosso
            // código depende disso — a identificação do estorno é feita pelo
            // registro em Payment —, mas é o que torna a cobrança legível no
            // painel do Stripe quando alguém for investigar um estorno à mão.
            sessionParams.payment_intent_data = {
                metadata: {
                    user_email: user.email,
                    plan: planoId
                }
            };
        }

        if (stripeCouponId) {
            sessionParams.discounts = [{ coupon: stripeCouponId }];
        }

        // O cupom Stripe é criado ANTES da session. Se a session falhar, ele
        // fica órfão e nada mais o alcança — o `stripeCouponId` morre com a
        // requisição. Limpar aqui é a única chance.
        //
        // A falha da limpeza é engolida de propósito: ela não pode substituir o
        // erro de verdade, que é o da session. Um cupom sobrando é problema
        // pequeno; esconder a causa do checkout ter falhado é grande.
        //
        // O `throw` devolve o erro original para o catch de fora, então a
        // resposta ao cliente continua exatamente a mesma de antes.
        let session;
        try {
            session = await stripe.checkout.sessions.create(sessionParams);
        } catch (erroDaSession) {
            if (stripeCouponId) {
                try {
                    await stripe.coupons.del(stripeCouponId);
                    console.log('Cupom Stripe órfão removido após falha da session:', stripeCouponId);
                } catch (erroDaLimpeza) {
                    console.error(
                        'Falha ao remover cupom Stripe órfão',
                        stripeCouponId, '-', erroDaLimpeza.message
                    );
                }
            }
            throw erroDaSession;
        }

        return Response.json({ success: true, url: session.url });

    } catch (error) {
        console.error('Erro ao criar checkout Stripe:', error.message);
        return Response.json({ error: error.message, success: false }, { status: 500 });
    }
});