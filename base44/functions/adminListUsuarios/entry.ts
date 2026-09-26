import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// adminListUsuarios — a visão geral da tela de usuários, já classificada.
// -----------------------------------------------------------------------------
// SÓ LÊ. Mesma postura do adminListTrials: uma tela que muda o banco por ter
// sido aberta é uma tela em que não dá para confiar.
//
// UMA CHAMADA POR VISITA, E SÓ O QUE A TABELA MOSTRA.
//
// A tela lia o adminListAccounts, que devolve a Account inteira — inclusive o
// `attempted_case_ids`, que cresce a cada caso respondido e é a coluna mais
// pesada da tabela. Aqui a Account vem projetada (`fields`), sem essa lista e
// sem credencial nenhuma. O adminListAccounts fica como está porque outras
// telas o usam.
//
// A ORIGEM DO PREMIUM É DEDUZIDA, NÃO LIDA.
//
// Nenhum campo diz "este premium é anual". O que existe são marcas espalhadas,
// cada uma escrita por um caminho diferente, e a ordem de leitura abaixo é a
// mesma do getUserSubscriptionInfo:
//
//   1. lifetime_access          → vitalício
//   2. trial_ends_at            → cortesia
//   3. Payment de assinatura    → mensal ou anual (Stripe, App Store, Play)
//      ou store_expires_at
//   4. nenhuma das anteriores   → manual (tela de usuários) ou sem registro
//
// MENSAL OU ANUAL SAI DO VALOR, E ISSO É ESTIMATIVA.
//
// O Stripe conhece o plano (metadata.plan) e a loja também (product_id), mas
// nenhum dos dois webhooks grava isso no Payment. Sobra o valor: o mensal nunca
// passa de R$ 59,90, então acima de R$ 60 é anual. Erra num anual com cupom
// acima de ~88% (que custaria menos que um mensal) e não decide nada quando a
// loja gravou valor zero — aí a periodicidade volta null, sem chute. O detalhe
// do usuário (adminListUsuarioDetalhe) pergunta ao Stripe e ao RevenueCat e dá
// a resposta exata; esta listagem não faz isso porque seriam dezenas de idas de
// rede por visita.
//
// CANCELOU = EX-ASSINANTE.
//
// Nenhum caminho grava "cancelou". O que dá para afirmar é: está free hoje e já
// pagou alguma vez. Payment CANCELED conta como "já pagou" porque só dois
// caminhos o escrevem, e os dois partem de um PAID — o cancelStripeSubscription
// (a pessoa cancelou pelo app) e o estorno do vitalício no stripeWebhook.
// PENDING, DECLINED e EXPIRED são tentativas que nunca viraram dinheiro.
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

// Pagina até esgotar, projetando só as colunas pedidas. Com ~200 contas são
// poucas páginas; o `fields` é o que mantém cada uma leve. Se o servidor
// ignorar o parâmetro, volta o registro inteiro e só se perde a economia.
async function lerTudo(entidade, filtro, campos) {
  const lote = 500;
  let skip = 0;
  let todos = [];
  while (true) {
    const pagina = filtro
      ? await entidade.filter(filtro, null, lote, skip, campos)
      : await entidade.list(null, lote, skip, campos);
    if (!pagina || pagina.length === 0) break;
    todos = todos.concat(pagina);
    if (pagina.length < lote) break;
    skip += lote;
  }
  return todos;
}

const DIA_MS = 24 * 60 * 60 * 1000;

// Tudo o que a tabela e os filtros usam. `attempted_case_ids` e
// `password_hash` ficam de fora de propósito; google_id/apple_id entram só
// para virar booleanos e nunca saem desta função.
const CAMPOS_CONTA = [
  'id', 'created_date', 'email', 'full_name', 'role',
  'subscription_type', 'subscription_start_date',
  'lifetime_access', 'trial_ends_at', 'trial_started_at', 'store_expires_at',
  'google_id', 'apple_id',
  'specialty', 'country', 'state', 'city', 'profile_completed',
  'total_attempts', 'total_correct_attempts',
  'total_first_attempts', 'correct_first_attempts',
  'module_first_attempts', 'module_correct_first_attempts',
  'current_streak', 'last_practice_date', 'last_login_at', 'points', 'level',
  'referred_by_code', 'pending_referral_code'
];

const CAMPOS_PAGAMENTO = [
  'id', 'created_date', 'user_email', 'amount', 'discount_amount', 'coupon_id',
  'status', 'payment_method', 'stripe_subscription_id', 'paid_at'
];

const CAMPOS_CORTESIA = [
  'id', 'created_date', 'user_email', 'granted_at', 'expires_at', 'days',
  'reason', 'kind', 'origem', 'revoked_at'
];

// Só os métodos que o revenuecatWebhook e o stripeWebhook gravam para
// assinatura. Payments do Android anteriores à distinção de loja estão como
// APP_STORE_SUBSCRIPTION para sempre (sem backfill) — a plataforma exata sai do
// RevenueCat, no detalhe.
const METODOS_ASSINATURA = ['STRIPE_SUBSCRIPTION', 'APP_STORE_SUBSCRIPTION', 'PLAY_STORE_SUBSCRIPTION'];
const METODO_VITALICIO = 'STRIPE_LIFETIME';

// O mensal mais caro é R$ 59,90 (loja). Qualquer valor acima é anual.
const LIMIAR_ANUAL = 60;

// Folga para "pagamento atrasado": um ciclo mais dez dias. Menos que isso
// dispararia com renovação que só atrasou um pouco no webhook.
const FOLGA_DIAS = { mensal: 40, anual: 375 };

const email = (v) => (v || '').trim().toLowerCase();
const dataDoPagamento = (p) => p.paid_at || p.created_date || null;
const ehAssinatura = (p) => METODOS_ASSINATURA.includes(p.payment_method) || !!p.stripe_subscription_id;

function plataformaDoPagamento(p) {
  if (!p) return null;
  if (p.payment_method === 'APP_STORE_SUBSCRIPTION') return 'app_store';
  if (p.payment_method === 'PLAY_STORE_SUBSCRIPTION') return 'play_store';
  if (p.payment_method === 'STRIPE_SUBSCRIPTION' || p.payment_method === METODO_VITALICIO || p.stripe_subscription_id) {
    return 'stripe';
  }
  return null;
}

function periodicidadePeloValor(valor) {
  if (typeof valor !== 'number' || !(valor > 0)) return null;
  return valor > LIMIAR_ANUAL ? 'anual' : 'mensal';
}

function dataValida(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// Resumo da história de pagamento de uma pessoa: por onde pagou, de que plano
// (estimado), e quando. Serve igual para quem está premium e para o
// ex-assinante — a diferença entre os dois é só o estado atual da conta.
function resumirAssinatura(pagos) {
  if (pagos.length === 0) return null;
  const primeiro = pagos[0];
  const ultimo = pagos[pagos.length - 1];
  const vitalicio = pagos.find(p => p.payment_method === METODO_VITALICIO) || null;
  const ultimaAssinatura = [...pagos].reverse().find(ehAssinatura) || null;
  const referencia = ultimaAssinatura || vitalicio || ultimo;

  return {
    // 'outro' = Payment sem método conhecido (registro manual ou legado).
    tipo: ultimaAssinatura ? 'assinatura' : (vitalicio ? 'vitalicio' : 'outro'),
    plataforma: plataformaDoPagamento(referencia),
    // Valor estimado — ver o cabeçalho. null quando o valor não decide.
    plano: ultimaAssinatura
      ? periodicidadePeloValor(ultimaAssinatura.amount)
      : (vitalicio ? 'vitalicio' : null),
    vitalicio_estornado: !!(vitalicio && vitalicio.status === 'CANCELED'),
    primeiro_pagamento_em: dataDoPagamento(primeiro),
    ultimo_pagamento_em: dataDoPagamento(ultimo),
    ultimo_valor: typeof ultimo.amount === 'number' ? ultimo.amount : null,
    total_pago: pagos.reduce((s, p) => s + (typeof p.amount === 'number' ? p.amount : 0), 0),
    qtd_pagamentos: pagos.length
  };
}

// Premium: de onde veio, e se algo nele parece errado.
function classificarPremium(conta, assinatura, agora) {
  const fimCortesia = dataValida(conta.trial_ends_at);
  const prazoLoja = dataValida(conta.store_expires_at);

  if (conta.lifetime_access === true) {
    return { origem: 'vitalicio', plataforma: 'stripe', alerta: null };
  }

  if (fimCortesia) {
    return {
      origem: 'cortesia',
      plataforma: null,
      // Vencida e ainda premium: a expiração preguiçosa só passa quando a
      // pessoa reabre o app (ou no "Encerrar vencidos" da tela de cortesias).
      alerta: fimCortesia <= agora ? 'cortesia_vencida_pendente' : null
    };
  }

  if (assinatura?.tipo === 'assinatura' || prazoLoja) {
    const plano = assinatura?.tipo === 'assinatura' ? assinatura.plano : null;
    const plataforma = assinatura?.plataforma || 'loja';

    let alerta = null;
    if (prazoLoja) {
      // Prazo de loja no passado: o getMyAccount pergunta ao RevenueCat no
      // próximo acesso da pessoa. Se ela não voltar, fica premium assim.
      if (prazoLoja <= agora) alerta = 'prazo_loja_vencido';
    } else if (assinatura?.ultimo_pagamento_em) {
      const dias = (agora.getTime() - new Date(assinatura.ultimo_pagamento_em).getTime()) / DIA_MS;
      if (dias > FOLGA_DIAS[plano || 'mensal']) alerta = 'sem_pagamento_recente';
    }

    return { origem: plano || 'assinatura', plataforma, alerta };
  }

  return { origem: 'manual', plataforma: null, alerta: null };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);

    if (!identity || identity.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const svc = base44.asServiceRole.entities;
    const agora = new Date();

    // Sequencial e não Promise.all: são quatro leituras por visita e nenhuma
    // pressa justifica disparar todas no mesmo instante contra o limite de
    // volume do app.
    const contas = await lerTudo(svc.Account, null, CAMPOS_CONTA);
    const pagamentos = await lerTudo(svc.Payment, null, CAMPOS_PAGAMENTO);
    const cortesias = await lerTudo(svc.TrialGrant, null, CAMPOS_CORTESIA);
    const fasesConcluidas = await lerTudo(svc.UserProgress, { status: 'completed' }, ['user_email']);

    const agrupar = (lista) => {
      const mapa = new Map();
      for (const item of lista) {
        const chave = email(item.user_email);
        if (!chave) continue;
        if (!mapa.has(chave)) mapa.set(chave, []);
        mapa.get(chave).push(item);
      }
      return mapa;
    };

    const pagamentosPorEmail = agrupar(pagamentos);
    const cortesiasPorEmail = agrupar(cortesias);
    const fasesPorEmail = new Map();
    for (const f of fasesConcluidas) {
      const chave = email(f.user_email);
      if (chave) fasesPorEmail.set(chave, (fasesPorEmail.get(chave) || 0) + 1);
    }

    const usuarios = contas.map((c) => {
      const chave = email(c.email);
      const pags = (pagamentosPorEmail.get(chave) || [])
        .sort((a, b) => new Date(dataDoPagamento(a) || 0) - new Date(dataDoPagamento(b) || 0));
      const pagos = pags.filter(p => p.status === 'PAID' || p.status === 'CANCELED');
      const grants = (cortesiasPorEmail.get(chave) || [])
        .sort((a, b) => new Date(a.granted_at || a.created_date || 0) - new Date(b.granted_at || b.created_date || 0));
      const assinatura = resumirAssinatura(pagos);
      const premium = c.subscription_type === 'premium';

      let situacao;
      let origem = null;
      let plataforma = assinatura?.plataforma || null;
      let alerta = null;

      if (premium) {
        situacao = 'premium';
        const cls = classificarPremium(c, assinatura, agora);
        origem = cls.origem;
        plataforma = cls.plataforma;
        alerta = cls.alerta;
      } else if (pagos.length > 0) {
        situacao = 'ex_assinante';
      } else if (grants.length > 0 || c.trial_ends_at) {
        situacao = 'cortesia_vencida';
      } else {
        situacao = 'nunca_pagou';
      }

      return {
        id: c.id,
        email: chave,
        full_name: c.full_name || null,
        created_date: c.created_date || null,
        role: c.role || 'user',
        premium,
        situacao,
        origem,
        plataforma,
        alerta,
        assinatura,
        subscription_start_date: c.subscription_start_date || null,
        trial_ends_at: c.trial_ends_at || null,
        store_expires_at: c.store_expires_at || null,
        login_google: !!c.google_id,
        login_apple: !!c.apple_id,
        last_login_at: c.last_login_at || null,
        specialty: c.specialty || null,
        city: c.city || null,
        state: c.state || null,
        country: c.country || null,
        profile_completed: c.profile_completed === true,
        total_attempts: c.total_attempts || 0,
        // null = desconhecido (conta que não praticou desde que o campo nasceu),
        // não zero. A tela mostra "—".
        total_correct_attempts: typeof c.total_correct_attempts === 'number' ? c.total_correct_attempts : null,
        total_first_attempts: c.total_first_attempts || 0,
        correct_first_attempts: c.correct_first_attempts || 0,
        module_first_attempts: c.module_first_attempts || 0,
        module_correct_first_attempts: c.module_correct_first_attempts || 0,
        current_streak: c.current_streak || 0,
        last_practice_date: c.last_practice_date || null,
        points: c.points || 0,
        level: c.level || 1,
        fases_concluidas: fasesPorEmail.get(chave) || 0,
        referred_by_code: c.referred_by_code || null,
        pending_referral_code: c.pending_referral_code || null,
        pagamentos: pags.map(p => ({
          id: p.id,
          amount: typeof p.amount === 'number' ? p.amount : null,
          discount_amount: p.discount_amount || 0,
          coupon_id: p.coupon_id || null,
          status: p.status,
          payment_method: p.payment_method || null,
          stripe_subscription_id: p.stripe_subscription_id || null,
          data: dataDoPagamento(p)
        })),
        cortesias: grants.map(g => ({
          id: g.id,
          granted_at: g.granted_at || g.created_date || null,
          expires_at: g.expires_at || null,
          days: g.days || null,
          reason: g.reason || '',
          kind: g.kind || 'grant',
          // Grant anterior ao campo não tem origem e era sempre do admin.
          origem: g.origem || 'admin',
          revoked_at: g.revoked_at || null
        }))
      };
    });

    usuarios.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));

    return Response.json({ success: true, gerado_em: agora.toISOString(), usuarios });
  } catch (error) {
    console.error('Erro em adminListUsuarios:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
