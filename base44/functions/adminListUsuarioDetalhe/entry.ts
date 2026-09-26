import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// adminListUsuarioDetalhe — o que UM usuário já fez no app, para o painel de
// detalhe da tela de usuários.
// -----------------------------------------------------------------------------
// SÓ LÊ, inclusive do lado de fora. O getUserSubscriptionInfo aproveita a
// consulta ao RevenueCat para anotar store_expires_at na Account; aqui não. Um
// admin abrindo o detalhe de alguém não pode mudar o estado dessa pessoa.
//
// UMA CHAMADA POR CLIQUE, TUDO LIMITADO A ESTE E-MAIL.
//
// "Já usou o Quiz aleatório / os Módulos / o Caso do dia?" é respondido com
// uma consulta de UM registro por tipo (o mais recente), nunca baixando o
// histórico de tentativas — que para um usuário ativo passa de mil linhas e é
// exatamente o tipo de leitura que estoura o limite de volume do app (README
// §2, o 429).
//
// ESTADO REAL DA ASSINATURA.
//
// A listagem (adminListUsuarios) estima mensal/anual pelo valor pago e não
// sabe quem desligou a renovação. Aqui a resposta vem de quem sabe: Stripe
// (cancel_at_period_end e o intervalo do preço) e RevenueCat
// (unsubscribe_detected_at e o product_id). As duas consultas são cópias das
// do getUserSubscriptionInfo — o Base44 não resolve import entre functions.
// -----------------------------------------------------------------------------

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

// ── Cópias do getUserSubscriptionInfo (consultas ao RevenueCat e ao Stripe) ──

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
    console.error('adminListUsuarioDetalhe: rede RevenueCat:', e.message);
    return null;
  }

  if (resp.status !== 200 && resp.status !== 201) {
    console.error('adminListUsuarioDetalhe: status inesperado:', resp.status);
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
    console.error('adminListUsuarioDetalhe: rede Stripe:', e.message);
    return null;
  }

  if (resp.status !== 200) {
    console.error('adminListUsuarioDetalhe: Stripe status inesperado:', resp.status);
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
    console.error('adminListUsuarioDetalhe: Stripe sem current_period_end para', subscriptionId);
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


const TIPOS_DE_QUIZ = ['random', 'module', 'daily'];

const CAMPOS_TENTATIVA = ['case_id', 'correct', 'quiz_type', 'module_id', 'phase_id', 'created_date'];

const CAMPOS_PROGRESSO = [
  'module_id', 'phase_id', 'completion_count', 'completion_goal', 'status', 'last_updated'
];

// O primeiro registro de uma consulta, ou null. Uma falha aqui vira null e não
// derruba o painel: cada bloco do detalhe é independente dos outros.
async function primeiro(entidade, filtro, ordem, campos) {
  try {
    const r = await entidade.filter(filtro, ordem, 1, 0, campos);
    return r && r.length > 0 ? r[0] : null;
  } catch (e) {
    console.error('adminListUsuarioDetalhe: leitura falhou:', e.message);
    return null;
  }
}

async function lista(entidade, filtro, ordem, limite, campos) {
  try {
    return (await entidade.filter(filtro, ordem, limite, 0, campos)) || [];
  } catch (e) {
    console.error('adminListUsuarioDetalhe: leitura falhou:', e.message);
    return [];
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);

    if (!identity || identity.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const corpo = await req.json();
    const email = (corpo?.email || '').trim().toLowerCase();
    if (!email) {
      return Response.json({ error: 'Parâmetro: email', success: false }, { status: 400 });
    }

    // Vem da listagem, que já leu os Payments deste usuário. Recebê-lo do
    // corpo evita reler a tabela de pagamentos a cada clique; e aceitar o
    // valor do cliente é seguro aqui pelo mesmo motivo do adminListRecords:
    // quem passou no gate já pode ler tudo, e o id só escolhe qual assinatura
    // do Stripe consultar.
    const stripeSubscriptionId = typeof corpo?.stripe_subscription_id === 'string'
      ? corpo.stripe_subscription_id
      : null;
    const temPagamentoDeLoja = corpo?.tem_pagamento_loja === true;

    const svc = base44.asServiceRole.entities;

    const conta = await primeiro(svc.Account, { email }, null, [
      'id', 'email', 'revenuecat_user_id', 'store_expires_at'
    ]);
    if (!conta) {
      return Response.json({ error: 'Conta não encontrada', success: false }, { status: 404 });
    }

    // ── USO DO APP ───────────────────────────────────────────────────────
    const primeiraTentativa = await primeiro(svc.QuizAttempt, { user_email: email }, 'created_date', ['created_date']);

    const ultimoUso = {};
    for (const tipo of TIPOS_DE_QUIZ) {
      const t = await primeiro(svc.QuizAttempt, { user_email: email, quiz_type: tipo }, '-created_date', ['created_date']);
      ultimoUso[tipo] = t ? t.created_date : null;
    }

    const recentes = await lista(svc.QuizAttempt, { user_email: email }, '-created_date', 15, CAMPOS_TENTATIVA);

    const progresso = await lista(svc.UserProgress, { user_email: email }, '-last_updated', 200, CAMPOS_PROGRESSO);

    // ── CONQUISTAS ───────────────────────────────────────────────────────
    const ganhas = await lista(svc.UserAchievement, { user_email: email }, '-earned_at', 200, ['achievement_id', 'earned_at']);
    let catalogoConquistas = [];
    try {
      catalogoConquistas = (await svc.Achievement.list('order', 200, 0, ['id', 'name', 'icon', 'active'])) || [];
    } catch (e) {
      console.error('adminListUsuarioDetalhe: Achievement falhou:', e.message);
    }
    const nomeDaConquista = new Map(catalogoConquistas.map(a => [a.id, a]));
    const conquistas = ganhas.map(g => ({
      achievement_id: g.achievement_id,
      earned_at: g.earned_at,
      name: nomeDaConquista.get(g.achievement_id)?.name || null,
      icon: nomeDaConquista.get(g.achievement_id)?.icon || null
    }));
    const conquistasAtivas = catalogoConquistas.filter(a => a.active !== false).length;

    // ── ASSINATURA, DIRETO DA FONTE ──────────────────────────────────────
    // null = não se aplica (a pessoa não tem esse tipo de assinatura);
    // { erro: true } = deveria ter resposta e a consulta falhou.
    let loja = null;
    if (temPagamentoDeLoja || conta.store_expires_at) {
      const apiKey = Deno.env.get('REVENUECAT_SECRET_KEY');
      if (!apiKey) {
        console.error('adminListUsuarioDetalhe: REVENUECAT_SECRET_KEY ausente');
        loja = { erro: true };
      } else {
        // Os três ids pela mesma razão do getUserSubscriptionInfo: compra
        // anterior ao corte está sob o User.id, e o offer code do iOS nasce no
        // id anônimo do aparelho.
        const legado = await primeiro(svc.User, { email }, null, ['id']);
        const ids = [...new Set([conta.id, conta.revenuecat_user_id, legado?.id].filter(Boolean))];
        for (const id of ids) {
          loja = await consultarAssinaturaLoja(id, apiKey);
          if (loja) break;
        }
        if (loja) loja = { ...loja, store: lojaDoRevenueCat(loja.store) };
        else loja = { erro: true };
      }
    }

    let stripe = null;
    if (stripeSubscriptionId) {
      const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
      if (!stripeKey) {
        console.error('adminListUsuarioDetalhe: STRIPE_SECRET_KEY ausente');
        stripe = { erro: true };
      } else {
        stripe = (await consultarAssinaturaStripe(stripeSubscriptionId, stripeKey)) || { erro: true };
      }
    }

    return Response.json({
      success: true,
      email,
      uso: {
        primeira_tentativa_em: primeiraTentativa?.created_date || null,
        ultimo_uso: ultimoUso,
        recentes
      },
      progresso,
      conquistas,
      conquistas_ativas: conquistasAtivas,
      assinatura_externa: { loja, stripe }
    });
  } catch (error) {
    console.error('Erro em adminListUsuarioDetalhe:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
