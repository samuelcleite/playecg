import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// adminPartnerReport
// -----------------------------------------------------------------------------
// Receita gerada por cada parceiro/influenciador, por mês.
//
// POR QUE UMA FUNCTION E NÃO UMA CONTA NA TELA: o cálculo cruza Payment com
// Coupon, e Payment tem RLS `__service_only__`. Além disso, a soma que o
// AdminCouponStats mostrava como "Receita" era a soma de CouponUsage.final_price
// — o valor da PRIMEIRA cobrança, uma vez, para sempre. Para um programa que
// paga sobre recorrência, esse número é o errado.
//
// A FONTE É O Payment, não o CouponUsage. CouponUsage é um evento de resgate:
// existe uma linha por pessoa que usou o cupom, e ela nunca mais muda. Payment
// é dinheiro que entrou — uma linha por cobrança, incluindo as renovações que
// o invoice.paid passou a registrar.
//
// A ATRIBUIÇÃO VEM DO Payment.coupon_id, que é um retrato do momento do
// pagamento, e não da Account. Se um assinante for reatribuído a outro parceiro
// numa compra futura, o histórico do parceiro antigo continua de pé. Ler a
// atribuição atual da Account reescreveria o passado.
//
// Cupom comum cai fora sozinho: sem partner_name, não há parceiro para agrupar.
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

// Valida e normaliza o que veio do cliente. Devolve { erro } ou { dados }.
//
// Só olha os campos PRESENTES no corpo: o painel manda o formulário inteiro ao
// salvar, mas o botão de ativar/desativar manda só `{ active }`, e um update
// parcial não pode ser recusado por causa de campo que ele nem tentou mudar.
function prepararDados(entrada, { novo }) {
  const bruto = entrada && typeof entrada === 'object' ? entrada : {};
  const dados = {};
  for (const campo of CAMPOS_PERMITIDOS) {
    if (Object.prototype.hasOwnProperty.call(bruto, campo)) dados[campo] = bruto[campo];
  }

  if (novo && !dados.code) return { erro: 'Código do cupom é obrigatório' };
  if (Object.prototype.hasOwnProperty.call(dados, 'code')) {
    if (typeof dados.code !== 'string' || !dados.code.trim()) {
      return { erro: 'Código do cupom é obrigatório' };
    }
    // Normaliza no BACKEND também. O painel já faz uppercase/trim, mas a busca
    // do checkout é por código normalizado — um cupom gravado fora do painel,
    // em minúsculas, simplesmente nunca seria encontrado.
    dados.code = dados.code.trim().toUpperCase();
  }

  if (Object.prototype.hasOwnProperty.call(dados, 'discount_type')
      && !TIPOS_DESCONTO.includes(dados.discount_type)) {
    return { erro: `Tipo de desconto inválido: ${dados.discount_type}` };
  }

  if (Object.prototype.hasOwnProperty.call(dados, 'discount_value')) {
    const valor = Number(dados.discount_value);
    if (!Number.isFinite(valor) || valor <= 0) {
      return { erro: 'Valor do desconto precisa ser maior que zero' };
    }
    if (dados.discount_type === 'percentage' && valor > 100) {
      return { erro: 'Desconto percentual não pode passar de 100' };
    }
    dados.discount_value = valor;
  }

  // PARCERIA. Os dois campos são opcionais e independentes do desconto do
  // Stripe: partner_name diz de quem é o cupom, tier diz qual oferta comprar
  // nas lojas. Vazio nos dois = cupom comum.
  if (Object.prototype.hasOwnProperty.call(dados, 'partner_name')) {
    const nome = typeof dados.partner_name === 'string' ? dados.partner_name.trim() : '';
    // Normaliza para string vazia virar null: o relatório agrupa por valor
    // exato, e "" e null como coisas diferentes criariam um parceiro fantasma.
    dados.partner_name = nome || null;
  }

  if (Object.prototype.hasOwnProperty.call(dados, 'tier')) {
    if (dados.tier === '' || dados.tier === null || dados.tier === undefined) {
      dados.tier = null;
    } else if (!TIERS.includes(dados.tier)) {
      return { erro: `Tier inválido: ${dados.tier}` };
    }
  }

  // DURAÇÃO — mesma regra do createStripeCheckout.
  if (novo && !dados.duration) {
    // Explícito em vez de contar com o default do schema. O default existe e
    // funciona na escrita, mas depender dele deixaria o comportamento preso a
    // um detalhe do Base44 que não está documentado em lugar nenhum.
    dados.duration = 'forever';
  }
  if (Object.prototype.hasOwnProperty.call(dados, 'duration')) {
    if (!DURACOES.includes(dados.duration)) {
      return { erro: `Duração inválida: ${dados.duration}` };
    }
    if (dados.duration === 'repeating') {
      const meses = Number(dados.duration_in_months);
      if (!Number.isInteger(meses) || meses <= 0) {
        return { erro: 'Duração "repeating" exige duration_in_months maior que zero' };
      }
      dados.duration_in_months = meses;
    } else {
      // Nunca deixa sobrar o número de uma configuração anterior: o Stripe
      // RECUSA duration_in_months junto com 'once' ou 'forever'.
      dados.duration_in_months = null;
    }
  }

  return { dados };
}

// Pagina até esgotar. Parar na primeira página truncaria o relatório em
// silêncio, e relatório truncado que parece completo é pior do que um que falha.
async function lerTudo(svc, ordenacao) {
  const lote = 500;
  let todos = [];
  let skip = 0;
  while (true) {
    const pagina = await svc.list(ordenacao, lote, skip);
    if (!pagina || pagina.length === 0) break;
    todos = todos.concat(pagina);
    if (pagina.length < lote) break;
    skip += lote;
  }
  return todos;
}

// 'YYYY-MM' em horário de Brasília. Sem o timeZone, uma cobrança da noite do
// dia 31 cairia no mês seguinte para quem lê o relatório no Brasil.
function competencia(iso) {
  if (!iso) return 'sem-data';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'sem-data';
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit'
  }).formatToParts(d);
  const ano = partes.find((p) => p.type === 'year')?.value;
  const mes = partes.find((p) => p.type === 'month')?.value;
  return ano && mes ? `${ano}-${mes}` : 'sem-data';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);

    if (!identity || identity.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const cupons = await lerTudo(base44.asServiceRole.entities.Coupon, '-created_date');
    const porId = new Map(cupons.map((c) => [c.id, c]));

    const pagamentos = await lerTudo(base44.asServiceRole.entities.Payment, '-paid_at');

    const parceiros = new Map();

    for (const p of pagamentos) {
      // Estorno vira CANCELED no charge.refunded. Contar dinheiro devolvido
      // como receita de parceiro pagaria comissão sobre venda desfeita.
      if (p.status !== 'PAID') continue;
      if (!p.coupon_id) continue;

      const cupom = porId.get(p.coupon_id);
      if (!cupom || !cupom.partner_name) continue;

      const nome = cupom.partner_name;
      if (!parceiros.has(nome)) {
        parceiros.set(nome, {
          partner_name: nome,
          codigos: new Set(),
          assinantes: new Set(),
          cobrancas: 0,
          receita: 0,
          desconto: 0,
          meses: {}
        });
      }
      const acc = parceiros.get(nome);
      const valor = Number(p.amount) || 0;
      const desc = Number(p.discount_amount) || 0;
      const mes = competencia(p.paid_at || p.created_date);

      acc.codigos.add(cupom.code);
      if (p.user_email) acc.assinantes.add(p.user_email);
      acc.cobrancas += 1;
      acc.receita += valor;
      acc.desconto += desc;

      if (!acc.meses[mes]) acc.meses[mes] = { receita: 0, cobrancas: 0 };
      acc.meses[mes].receita += valor;
      acc.meses[mes].cobrancas += 1;
    }

    const resultado = [...parceiros.values()]
      .map((a) => ({
        partner_name: a.partner_name,
        codigos: [...a.codigos].sort(),
        assinantes: a.assinantes.size,
        cobrancas: a.cobrancas,
        receita: Math.round(a.receita * 100) / 100,
        desconto: Math.round(a.desconto * 100) / 100,
        meses: Object.keys(a.meses).sort().reverse().map((mes) => ({
          mes,
          receita: Math.round(a.meses[mes].receita * 100) / 100,
          cobrancas: a.meses[mes].cobrancas
        }))
      }))
      .sort((x, y) => y.receita - x.receita);

    return Response.json({
      success: true,
      parceiros: resultado,
      pagamentos_lidos: pagamentos.length
    });
  } catch (error) {
    console.error('Erro em adminPartnerReport:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
