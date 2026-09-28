import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// adminListFinanceiro — receitas e despesas para a tela Financeiro.
// -----------------------------------------------------------------------------
// SÓ LÊ. Duas leituras por visita: o Payment projetado por `fields` (nada de
// e-mail nem cupom — a tela não mostra pessoas) e as despesas (Expense), que
// são poucas e lançadas à mão. O nome começa com adminList de propósito: é o
// que dá retentativa em 429 (README §2).
//
// A receita já sai classificada daqui, uma linha por Payment que é dinheiro:
//   - competencia: o dia da venda em Brasília (paid_at, ou created_date nos
//     registros antigos sem paid_at). Plano anual entra inteiro no mês da venda.
//   - caixa: o dia em que o dinheiro cai na conta, pela regra combinada com o
//     Samuel em 28/09/2026 — Stripe e Google Play pagam em 30 dias, App Store
//     em 60. Canal sem regra (Mercado Pago legado, registro manual) cai no
//     mesmo dia da venda.
//
// O que NÃO é receita, e por quê:
//   - PENDING, DECLINED, EXPIRED: o dinheiro nunca entrou.
//   - CANCELED no vitalício (STRIPE_LIFETIME): é estorno — o stripeWebhook só
//     marca CANCELED no charge.refunded total. O dinheiro voltou.
// CANCELED em assinatura Stripe CONTA como receita: quem grava é o
// cancelStripeSubscription, na última cobrança paga, quando a pessoa cancela a
// renovação. O Stripe não devolve nada nesse cancelamento.
//
// Valores são os do Payment: bruto, antes da taxa da loja/Stripe. A taxa entra
// como despesa (categoria "taxas"), à mão. Na loja o valor é
// price_in_purchased_currency — compra feita em outra moeda entra sem conversão.
// -----------------------------------------------------------------------------

const CAMPOS_PAGAMENTO = [
  'id', 'amount', 'status', 'payment_method', 'reference_id',
  'stripe_subscription_id', 'paid_at', 'created_date'
];

const PRAZO_DIAS = { stripe: 30, google: 30, apple: 60, outro: 0 };

// Pagina até esgotar. Parar na primeira página cortaria a receita em silêncio.
async function lerTudo(entidade, campos) {
  const lote = 500;
  let skip = 0;
  let todos = [];
  while (true) {
    const pagina = await entidade.list(null, lote, skip, campos);
    if (!pagina || pagina.length === 0) break;
    todos = todos.concat(pagina);
    if (pagina.length < lote) break;
    skip += lote;
  }
  return todos;
}

// Payments do Android anteriores a 03/08/2026 (commit 37f393a) foram gravados
// como APP_STORE_SUBSCRIPTION. O que os denuncia é o reference_id: o
// RevenueCat manda como transaction_id o order id do Google Play, que sempre
// começa com "GPA."; o da App Store é numérico. Sem isto, venda do Google
// antiga cairia no caixa 30 dias mais tarde do que caiu.
function canalDoPagamento(p) {
  const metodo = p.payment_method;
  if (metodo === 'PLAY_STORE_SUBSCRIPTION') return 'google';
  if (metodo === 'APP_STORE_SUBSCRIPTION') {
    return String(p.reference_id || '').startsWith('GPA.') ? 'google' : 'apple';
  }
  if (metodo === 'STRIPE_SUBSCRIPTION' || metodo === 'STRIPE_LIFETIME' || p.stripe_subscription_id) {
    return 'stripe';
  }
  return 'outro';
}

// Motivo para ficar fora da receita, ou null quando é receita.
function motivoDeFora(p) {
  if (p.status === 'PAID') return null;
  if (p.status === 'CANCELED') return p.payment_method === 'STRIPE_LIFETIME' ? 'estornado' : null;
  return 'nao_pago';
}

const formatoDiaBrasilia = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

// 'YYYY-MM-DD' do instante no fuso de Brasília. Venda às 23h do dia 31 é do
// mês que termina, não do seguinte (em UTC ela já seria dia 1º).
function diaBrasilia(valor) {
  if (!valor) return null;
  const d = new Date(valor);
  if (isNaN(d.getTime())) return null;
  return formatoDiaBrasilia.format(d);
}

function somarDias(dia, dias) {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

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

    if (!identity || identity.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const svc = base44.asServiceRole.entities;

    // Sequencial, pelo mesmo motivo do adminListUsuarios: nada aqui justifica
    // disparar as leituras no mesmo instante contra o limite de volume.
    const pagamentos = await lerTudo(svc.Payment, CAMPOS_PAGAMENTO);
    const despesas = await lerTudo(svc.Expense);

    const receitas = [];
    const foraDaReceita = { nao_pago: 0, estornado: 0, sem_data: 0 };

    for (const p of pagamentos) {
      const motivo = motivoDeFora(p);
      if (motivo) {
        foraDaReceita[motivo]++;
        continue;
      }
      const venda = diaBrasilia(p.paid_at || p.created_date);
      if (!venda) {
        foraDaReceita.sem_data++;
        continue;
      }
      const canal = canalDoPagamento(p);
      receitas.push({
        id: p.id,
        valor: typeof p.amount === 'number' ? p.amount : 0,
        canal,
        competencia: venda,
        caixa: somarDias(venda, PRAZO_DIAS[canal])
      });
    }

    return Response.json({
      success: true,
      receitas,
      fora_da_receita: foraDaReceita,
      despesas,
      gerado_em: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro em adminListFinanceiro:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
