import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

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
//
// Além de { email, role, source }, devolve `record`: o registro do usuário de
// onde ler campos extras (subscription_type, points, full_name, city...).
//   source 'base44' → record = retorno de base44.auth.me() (o User inteiro).
//   source 'jwt'    → record = a Account daquele email (via asServiceRole).
// LER de qualquer um dos dois é seguro durante a transição, porque ninguém
// escreve na Account — ela nunca diverge do User. Toda ESCRITA continua indo
// para o User. role nunca vem do record: é sempre 'user' no caminho JWT.
// JWT válido sem Account correspondente → null (sem fallback para sessão).
async function resolveIdentity(req, base44) {
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const secret = Deno.env.get('JWT_SECRET');
    if (secret) {
      const token = authHeader.slice('Bearer '.length).trim();
      const payload = await verifyJwtHS256(token, secret);
      if (payload && payload.email) {
        const accounts = await base44.asServiceRole.entities.Account.filter({ email: payload.email });
        const record = accounts && accounts.length > 0 ? accounts[0] : null;
        if (!record) return null;
        return { email: payload.email, role: 'user', source: 'jwt', record };
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
    return { email: user.email, role: user.role, source: 'base44', record: user };
  }

  return null;
}

const LOJAS_NAO_APP = ['stripe', 'promotional'];

// Só o revenuecatWebhook cria Payment com estes valores. Dois porque o webhook
// passou a distinguir a loja; os Payments do iOS já gravados seguem com o
// rótulo antigo para sempre (não há backfill), então ler os dois é permanente.
const METODOS_DE_LOJA = ['APP_STORE_SUBSCRIPTION', 'PLAY_STORE_SUBSCRIPTION'];

// O subscriber v1 do RevenueCat devolve o store em minúsculas.
function lojaDoRevenueCat(s) {
  const v = (s || '').toUpperCase();
  if (v === 'PLAY_STORE') return 'PLAY_STORE';
  if (v === 'APP_STORE' || v === 'MAC_APP_STORE') return 'APP_STORE';
  return null;
}

// Periodicidade a partir do identificador do produto da loja.
//
// O RevenueCat não manda a duração em campo próprio (period_type é
// NORMAL/TRIAL/INTRO, não mensal/anual), então sobra o id — mesma leitura que o
// revenuecatWebhook já faz. Ids reais: com.despia.playecg.monthly/.yearly no
// iOS e premium:monthly/premium:annual no Android, daí os dois vocabulários.
//
// Desconhecido devolve null, e quem chama mantém o rótulo de antes.
function periodoDoProduto(productId) {
  const v = (productId || '').toLowerCase();
  if (v.includes('year') || v.includes('annual') || v.includes('anual')) return 'year';
  if (v.includes('month') || v.includes('mensal')) return 'month';
  return null;
}

// Pergunta ao RevenueCat o estado REAL da assinatura de loja deste usuário.
//
// POR QUE EXISTE: o revenuecatWebhook, de propósito, NÃO trata CANCELLATION —
// quem pagou o mês usa o mês inteiro. O efeito colateral é que o cancelamento
// não deixava rastro em lugar nenhum, e o Perfil continuava prometendo
// "renovação automática" para quem já tinha cancelado na App Store. Guardar o
// estado na Account no webhook resolveria só os cancelamentos futuros; o
// RevenueCat já sabe de todos: `unsubscribe_detected_at` marca o cancelamento e
// `expires_date` é a data real do fim do acesso — mais confiável que os "+30
// dias" estimados a partir do último Payment (que erravam por um dia).
//
// Qualquer falha (rede, status inesperado, JSON) => null, e o chamador mantém o
// comportamento antigo em vez de derrubar a tela de assinatura.
async function consultarAssinaturaLoja(appUserId, apiKey) {
  let resp;
  try {
    resp = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
  } catch (e) {
    console.error('getUserSubscriptionInfo: rede RevenueCat:', e.message);
    return null;
  }

  if (resp.status !== 200 && resp.status !== 201) {
    console.error('getUserSubscriptionInfo: status inesperado:', resp.status);
    return null;
  }

  let body;
  try {
    body = await resp.json();
  } catch (_e) {
    return null;
  }

  const subscriptions = body?.subscriber?.subscriptions || {};
  const agora = Date.now();

  // Pega a assinatura de loja que vai mais longe: se houve troca de produto, é
  // ela quem define até quando o acesso vale.
  //
  // A ASSINATURA VENCIDA TAMBÉM CONTA, e ela é o motivo desta reescrita. A
  // versão anterior descartava tudo que já tinha expirado (`fim <= agora`) e
  // devolvia null — o MESMO null de "a consulta falhou". Com null, o chamador
  // caía na aritmética de reserva (`paid_at + 30 dias`) e a tela anunciava
  // "Próxima Renovação: 28 de agosto" com "sua assinatura será renovada
  // automaticamente todo mês", em setembro, para uma assinatura que a pessoa
  // tinha cancelado e que a App Store já havia encerrado. A informação certa
  // existia na resposta do RevenueCat e era jogada fora justamente no dia em
  // que passava a importar.
  //
  // Como só a de fim mais distante vence, uma assinatura ativa sempre ganha da
  // vencida — trocar de plano continua mostrando o plano novo.
  let melhor = null;
  // Object.entries e não values: a CHAVE é o identificador do produto, e é dela
  // que sai a periodicidade — o corpo da assinatura não a carrega.
  for (const [productId, sub] of Object.entries(subscriptions)) {
    if (typeof sub?.store === 'string' && LOJAS_NAO_APP.includes(sub.store)) continue;
    const fim = sub?.expires_date ? new Date(sub.expires_date).getTime() : null;
    if (fim == null || isNaN(fim)) continue;
    if (!melhor || fim > melhor.fim) melhor = { fim, sub, productId };
  }

  if (!melhor) return null;

  const expirada = melhor.fim <= agora;

  return {
    expiresAt: new Date(melhor.fim).toISOString(),
    // Vencida NÃO renova, tenha ou não `unsubscribe_detected_at`. Falha de
    // cobrança encerra a assinatura sem que ninguém cancele nada, e sem esta
    // linha esse caso voltaria a prometer renovação automática.
    willRenew: expirada ? false : !melhor.sub.unsubscribe_detected_at,
    expirada,
    store: melhor.sub.store || null,
    interval: periodoDoProduto(melhor.productId)
  };
}

// Pergunta ao Stripe o estado REAL da assinatura.
//
// POR QUE EXISTE: o Stripe era o único caminho em que NADA era consultado. A
// "Próxima Renovação" saía de aritmética — paid_at + 30 dias (ou +365 acima de
// R$400) — e o willRenew ficava null, então a tela prometia "renovação
// automática" para quem já tinha cancelado. O caminho de loja não tinha esse
// problema porque o RevenueCat é consultado; este helper fecha a assimetria.
//
// current_period_end é o fim real do ciclo e cancel_at_period_end diz se ele
// renova — os dois vêm do Stripe, nenhum é estimado.
//
// SOBRE O current_period_end: nas versões novas da API ele saiu do objeto
// Subscription e passou a viver em cada item. Lemos os dois lugares porque esta
// chamada usa a versão padrão da conta, que não está fixada aqui — e ler só um
// deles daria `undefined` silencioso quando a conta mudar de versão.
//
// Qualquer falha (rede, status inesperado, JSON, campo ausente) => null, e o
// chamador mantém o comportamento antigo. Mesmo contrato do
// consultarAssinaturaLoja: esta função NUNCA derruba a tela de assinatura.
async function consultarAssinaturaStripe(subscriptionId, apiKey) {
  let resp;
  try {
    resp = await fetch(
      `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
  } catch (e) {
    console.error('getUserSubscriptionInfo: rede Stripe:', e.message);
    return null;
  }

  if (resp.status !== 200) {
    console.error('getUserSubscriptionInfo: Stripe status inesperado:', resp.status);
    return null;
  }

  let sub;
  try {
    sub = await resp.json();
  } catch (_e) {
    return null;
  }

  const fimUnix = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end ?? null;
  if (typeof fimUnix !== 'number') {
    console.error('getUserSubscriptionInfo: Stripe sem current_period_end para', subscriptionId);
    return null;
  }

  const recorrencia = sub?.items?.data?.[0]?.price?.recurring?.interval ?? null;

  const fimMs = fimUnix * 1000;
  // Mesmo discriminador do caminho de loja, pela mesma razão: sem ele, uma
  // assinatura do Stripe encerrada apareceria como "Acesso Premium até <data no
  // passado>" em vez de dizer que acabou.
  const expirada = fimMs <= Date.now()
    || sub.status === 'canceled'
    || sub.status === 'incomplete_expired';

  return {
    expiresAt: new Date(fimMs).toISOString(),
    // Status terminal não renova, por mais que a flag diga o contrário.
    willRenew: sub.status !== 'canceled'
      && sub.status !== 'incomplete_expired'
      && sub.cancel_at_period_end !== true,
    expirada,
    store: null,
    // 'month' | 'year', direto do preço. NUNCA deduzido do valor pago: um anual
    // com cupom de 99% custa R$ 4,99 e qualquer limiar o classificaria como
    // mensal — foi exatamente esse tipo de heurística que já tinha estragado o
    // relatório de cupons no stripeWebhook.
    interval: recorrencia === 'month' || recorrencia === 'year' ? recorrencia : null
  };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Verificar autenticação
        const identity = await resolveIdentity(req, base44);
        if (!identity) {
            return Response.json({
                error: 'Não autenticado',
                success: false
            }, { status: 401 });
        }
    // A ACCOUNT é o registro do usuário, sempre. NÃO usar identity.record: ele é
    // o User quando a sessão é hospedada, e o User está CONGELADO desde o corte.
    // Ler dele faz o resultado depender de por onde a pessoa entrou no app, e
    // devolve estado que ninguém mais atualiza — foi assim que uma execução de
    // manutenção rebaixou dois assinantes para free.
    const contasDoUsuario = await base44.asServiceRole.entities.Account.filter({
        email: (identity.email || '').trim().toLowerCase()
    });
    const user = contasDoUsuario && contasDoUsuario.length > 0 ? contasDoUsuario[0] : {};
        const email = identity.email;

        console.log('🔍 Getting subscription info for user:', email);

        // Buscar pagamentos do usuário usando service role (sem restrições de RLS)
        const allPayments = await base44.asServiceRole.entities.Payment.list('-created_date');
        const userPayments = allPayments.filter(p => p.user_email === email);
        
        console.log('💳 Total payments in database:', allPayments.length);
        console.log('💳 User payments found:', userPayments.length);
        console.log('💳 User payments:', JSON.stringify(userPayments, null, 2));
        
        const paidPayments = userPayments.filter(p => p.status === 'PAID');
        console.log('✅ Paid payments:', paidPayments.length);

        // ACESSO VITALÍCIO — caminho próprio, antes de qualquer cálculo de
        // renovação.
        //
        // Sem isto o vitalício cai no ramo 'Manual' lá embaixo e a tela de
        // Perfil mente três vezes de uma vez: promete uma "Próxima Renovação"
        // de +365 dias (o `amount >= 400` cai justamente em cima do R$400),
        // rotula o pagamento como "Manual" e manda o comprador falar com o
        // suporte para cancelar uma assinatura que não existe.
        //
        // Quem manda aqui é `lifetime_access` na Account, não o Payment: a flag
        // é a fonte da verdade do invariante (ver ARQUITETURA_AUTH.md §5.8) e
        // continua correta mesmo se a linha de Payment não for encontrada — o
        // que acontece de verdade, porque o filtro de Payment acima compara
        // `user_email` com `identity.email` sem normalizar caixa.
        if (user.lifetime_access === true) {
            const pagamento = paidPayments.find(
                p => p.payment_method === 'STRIPE_LIFETIME'
            ) || null;

            const compradoEm = pagamento?.paid_at
                || pagamento?.created_date
                || user.subscription_start_date
                || user.created_date
                || null;

            console.log('♾️ Acesso vitalício para', email);

            return Response.json({
                success: true,
                hasSubscription: true,
                subscriptionInfo: {
                    // Discriminador novo. A tela ramifica por ele ANTES de
                    // olhar qualquer outro campo.
                    lifetime: true,
                    amount: pagamento?.amount ?? 400,
                    lastRenewal: compradoEm,
                    // null de propósito: não existe próxima renovação. Mandar
                    // uma data qualquer aqui seria mentir com precisão, que é
                    // exatamente o defeito que este bloco existe para corrigir.
                    nextRenewal: null,
                    paymentMethod: 'LIFETIME',
                    store: null,
                    // null, e não o reference_id: o único uso de `paymentId` na
                    // tela é liberar o botão de cancelar assinatura, e não há
                    // assinatura para cancelar.
                    paymentId: null,
                    // null (= "não sabemos"), nunca false. `willRenew === false`
                    // é o que a tela usa para dizer "assinatura cancelada, você
                    // perde o acesso em tal data" — a mensagem mais errada
                    // possível para quem comprou acesso permanente.
                    willRenew: null
                }
            });
        }

        // ACESSO DE CORTESIA — caminho próprio, pelo mesmo motivo do vitalício.
        //
        // Sem este bloco a cortesia cai no ramo 'Manual' logo abaixo e a tela de
        // Perfil mente três vezes: anuncia "Premium — R$59/mês", promete uma
        // próxima renovação de +30 dias que não vai acontecer, e manda falar com
        // o suporte para cancelar uma assinatura que não existe. Pior: esconde
        // justamente o que o usuário precisa saber — que o acesso tem prazo, e
        // qual é. É essa informação que faz a cortesia virar venda.
        //
        // Vem DEPOIS do vitalício de propósito: as duas marcas não coexistem por
        // construção (o adminGrantTrial recusa conta vitalícia e os caminhos de
        // compra limpam a cortesia), e se um dia coexistirem por bug, o acesso
        // permanente é a resposta menos errada.
        const fimCortesia = user.trial_ends_at ? new Date(user.trial_ends_at) : null;
        if (
            fimCortesia && !isNaN(fimCortesia.getTime()) &&
            fimCortesia > new Date() &&
            user.subscription_type === 'premium'
        ) {
            console.log('⏳ Acesso de cortesia para', email, 'até', user.trial_ends_at);

            return Response.json({
                success: true,
                hasSubscription: true,
                subscriptionInfo: {
                    // Discriminador novo, no mesmo formato do `lifetime`. A tela
                    // ramifica por ele antes de olhar qualquer outro campo.
                    trial: true,
                    lifetime: false,
                    trialEndsAt: fimCortesia.toISOString(),
                    // Valor 0: não houve cobrança. Mandar 59 aqui faria a tela
                    // exibir um preço que ninguém pagou.
                    amount: 0,
                    lastRenewal: user.trial_started_at || null,
                    // null de propósito: cortesia não renova. Ver a mesma
                    // decisão no bloco do vitalício acima.
                    nextRenewal: null,
                    paymentMethod: 'TRIAL',
                    store: null,
                    paymentId: null,
                    // null (= "não sabemos"), nunca false: `willRenew === false`
                    // é o gatilho da mensagem "assinatura cancelada" em outros
                    // pontos da tela, e não há assinatura nenhuma aqui.
                    willRenew: null
                }
            });
        }

        if (paidPayments.length === 0) {
            console.log('⚠️ No PAID payments found');
            
            // Retornar informações básicas se for premium mas sem pagamento
            if (user.subscription_type === 'premium') {
                const startDate = user.subscription_start_date 
                    ? new Date(user.subscription_start_date)
                    : new Date(user.created_date);
                
                const nextRenewal = new Date(startDate);
                nextRenewal.setDate(nextRenewal.getDate() + 30);

                return Response.json({
                    success: true,
                    hasSubscription: true,
                    subscriptionInfo: {
                        amount: 59.00,
                        lastRenewal: startDate.toISOString(),
                        nextRenewal: nextRenewal.toISOString(),
                        paymentMethod: 'Manual',
                        store: null,
                        paymentId: null
                    }
                });
            } else {
                return Response.json({
                    success: true,
                    hasSubscription: false
                });
            }
        }

        // Pegar o pagamento mais recente
        const latestPayment = paidPayments.sort((a, b) => 
            new Date(b.created_date) - new Date(a.created_date)
        )[0];

        console.log('📌 Latest payment:', JSON.stringify(latestPayment, null, 2));

        // Calcular próxima renovação
        const lastRenewal = new Date(latestPayment.paid_at || latestPayment.created_date);
        const nextRenewal = new Date(lastRenewal);
        const renewalDays = latestPayment.amount >= 400 ? 365 : 30;
        nextRenewal.setDate(nextRenewal.getDate() + renewalDays);

        // Detectar se é Stripe
        const isStripe = latestPayment.payment_method === 'STRIPE_SUBSCRIPTION' || !!latestPayment.stripe_subscription_id;
        // Assinaturas de loja (RevenueCat, App Store ou Google Play) não têm
        // stripe_subscription_id e precisam ser distinguidas do fallback
        // 'Manual', senão a tela de Perfil manda o assinante falar com o suporte
        // em vez de cancelar na loja.
        const isLoja = METODOS_DE_LOJA.includes(latestPayment.payment_method);
        const paymentId = latestPayment.stripe_subscription_id || null;

        // Só a assinatura de loja passa pelo RevenueCat; Stripe e manual não têm
        // subscriber lá e a consulta seria uma ida de rede jogada fora.
        let estadoLoja = null;
        if (isLoja) {
            const apiKey = Deno.env.get('REVENUECAT_SECRET_KEY');
            if (apiKey) {
                // Os três ids pela mesma razão do syncStoreSubscription: compra
                // feita antes do corte do AuthContext está gravada sob o User.id,
                // e o offer code do iOS nasce colado no id anônimo do aparelho.
                const users = await base44.asServiceRole.entities.User.filter({ email });
                const idLegado = users && users.length > 0 ? users[0].id : null;
                const ids = [...new Set([user.id, user.revenuecat_user_id, idLegado].filter(Boolean))];
                for (const id of ids) {
                    estadoLoja = await consultarAssinaturaLoja(id, apiKey);
                    if (estadoLoja) break;
                }
            } else {
                console.error('getUserSubscriptionInfo: REVENUECAT_SECRET_KEY ausente');
            }
        }

        // INVARIANTE store_expires_at — ONDE A CONTA ANTIGA GANHA O PRAZO QUE
        // NUNCA TEVE.
        //
        // O campo passou a existir depois que muita gente já era assinante de
        // loja, e quem arma a data são os eventos do RevenueCat: uma conta que
        // não receber mais nenhum evento — a que expirou e ninguém percebeu, que
        // é justamente o caso que motivou tudo isto — nunca seria alcançada.
        //
        // Isto NÃO é uma function de migração, de propósito. Uma varredura de
        // uso único vira exatamente o tipo de coisa que fica no repositório
        // depois de servir, e daqui a dois anos ninguém sabe mais o que é nem se
        // pode rodar. Aqui não há nada para lembrar de apagar: a consulta ao
        // RevenueCat que dá a resposta já estava sendo feita acima, para esta
        // mesma tela, por este mesmo usuário. Só o descarte do resultado é que
        // era desperdício.
        //
        // Escrever num endpoint de leitura é a mesma escolha, pelo mesmo motivo,
        // que o getMyAccount já fez ao expirar a cortesia: não há cron nesta
        // plataforma.
        //
        // Só grava quando o valor MUDA — senão seria uma escrita a cada abertura
        // do Perfil. E armar uma data no passado é seguro: quem decide o
        // rebaixamento continua sendo a verificação do getMyAccount, que
        // pergunta à loja de novo antes de tirar o acesso de alguém.
        //
        // Falha aqui é engolida. O prazo é conveniência de manutenção; a tela de
        // assinatura não pode cair por causa dela.
        if (estadoLoja) {
            const prazoAtual = user.store_expires_at ? new Date(user.store_expires_at).getTime() : null;
            const prazoNovo = new Date(estadoLoja.expiresAt).getTime();
            if (prazoNovo !== prazoAtual) {
                try {
                    await base44.asServiceRole.entities.Account.update(user.id, {
                        store_expires_at: estadoLoja.expiresAt
                    });
                    console.log('🗓️ store_expires_at anotado para', email, '->', estadoLoja.expiresAt);
                } catch (e) {
                    console.error('Falha ao anotar store_expires_at (a tela segue normalmente):', e.message);
                }
            }
        }

        // Espelho do bloco acima para o Stripe. Só faz sentido com o id da
        // assinatura em mãos: sem ele não há o que consultar, e o vitalício —
        // que é pagamento único — nem chega aqui, porque isStripe é false para
        // o payment_method dele.
        let estadoStripe = null;
        if (isStripe && paymentId) {
            const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
            if (stripeKey) {
                estadoStripe = await consultarAssinaturaStripe(paymentId, stripeKey);
            } else {
                console.error('getUserSubscriptionInfo: STRIPE_SECRET_KEY ausente');
            }
        }

        // Uma fonte externa só, seja qual for o caminho. Loja e Stripe são
        // mutuamente exclusivos aqui (isLoja e isStripe saem do mesmo Payment),
        // então não há disputa — e quando as duas vêm nulas, valem os +30 dias
        // de antes.
        const estadoExterno = estadoLoja || estadoStripe;

        // QUAL loja. O RevenueCat é a fonte melhor: ele acerta até quem comprou
        // no Android ANTES do webhook distinguir, cujo Payment está gravado como
        // App Store — sem reescrever histórico. Sem resposta dele, vale o que
        // está no Payment.
        const store = isLoja
            ? (lojaDoRevenueCat(estadoLoja?.store)
               || (latestPayment.payment_method === 'PLAY_STORE_SUBSCRIPTION' ? 'PLAY_STORE' : 'APP_STORE'))
            : null;

        const subscriptionInfo = {
            amount: latestPayment.amount,
            lastRenewal: lastRenewal.toISOString(),
            // A data da fonte externa (RevenueCat ou Stripe) é a verdade sobre
            // até quando o acesso vale; os +30 dias só continuam valendo quando
            // nenhuma das duas respondeu.
            nextRenewal: estadoExterno?.expiresAt || nextRenewal.toISOString(),
            // 'APP_STORE_SUBSCRIPTION' aqui significa "compra de loja", não
            // "Apple": é o discriminador que os clientes já instalados comparam.
            // Trocá-lo por loja jogaria o assinante Android com cache antigo no
            // ramo 'Manual' ("fale com o suporte"). Quem diz a loja é `store`.
            paymentMethod: isLoja ? 'APP_STORE_SUBSCRIPTION' : (isStripe ? 'Stripe' : 'Manual'),
            store,
            paymentId: paymentId,
            // null = não sabemos (manual, ou a consulta externa falhou). A tela
            // só avisa do cancelamento quando isso é explicitamente false — e
            // agora o Stripe também consegue dizer false, o que antes era
            // exclusividade do caminho de loja.
            willRenew: estadoExterno ? estadoExterno.willRenew : null,
            // O ciclo pago JÁ TERMINOU, segundo a fonte externa. Discriminador
            // separado do `willRenew` porque as duas coisas são diferentes na
            // tela e a diferença é o usuário inteiro: `willRenew: false` é
            // "você ainda tem acesso, até tal dia"; `expired: true` é "acabou".
            // Só true com resposta externa: sem ela não se afirma que terminou.
            expired: estadoExterno?.expirada === true,
            // 'month' | 'year' | null. Null mantém o rótulo antigo na tela.
            interval: estadoExterno?.interval ?? null
        };

        console.log('✅ Returning subscription info:', subscriptionInfo);

        return Response.json({
            success: true,
            hasSubscription: true,
            subscriptionInfo
        });

    } catch (error) {
        console.error('💥 Error getting subscription info:', error.message);
        console.error('Stack:', error.stack);
        return Response.json({ 
            error: error.message,
            success: false 
        }, { status: 500 });
    }
});