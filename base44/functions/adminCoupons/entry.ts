import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// adminCoupons
// -----------------------------------------------------------------------------
// Leitura e ESCRITA administrativa da entidade Coupon, via service role atrás de
// um gate de admin.
//
// POR QUE EXISTE: o AdminCoupons.jsx e o AdminCouponStats.jsx eram as últimas
// telas que ainda liam e escreviam uma entidade direto do cliente, apoiadas na
// cláusula `write: {role: admin}` do RLS. Isso obriga o `Coupon` a manter
// `read: {}` — leitura pública de todos os cupons, inclusive os inativos e os
// agendados. Fechado o RLS (etapa seguinte), as telas precisam deste caminho.
//
// É o mesmo desenho do adminListRecords e do adminGrantTrial: uma function por
// assunto, com o helper de identidade copiado inline. A duplicação é imposta
// pela plataforma — o Base44 não resolve import relativo entre functions.
//
// DIFERENÇA para o adminListRecords: aquele só LÊ, e por isso pode aceitar
// filtro livre do cliente. Este ESCREVE, então o corpo da requisição não pode
// virar update cru:
//
//   - ALLOWLIST DE CAMPOS. `used_count` fica de fora de propósito: quem escreve
//     nele é o stripeWebhook, ao registrar um resgate. Deixá-lo passar por aqui
//     permitiria zerar a contagem de usos com um clique errado no painel. Para
//     ajustar à mão existe o navegador de dados do Base44.
//   - VALIDAÇÃO DE DURAÇÃO, a mesma do createStripeCheckout. É a terceira
//     camada (dropdown do painel, aqui, e o checkout), e a única que cobre
//     quem chamar a function direto.
// -----------------------------------------------------------------------------

// Campos que o painel pode gravar. Qualquer outra chave do corpo é ignorada em
// silêncio — o cliente não dita o formato do registro.
const CAMPOS_PERMITIDOS = [
  'code',
  'description',
  'discount_type',
  'discount_value',
  'duration',
  'duration_in_months',
  'partner_name',
  'tier',
  'valid_from',
  'valid_until',
  'usage_limit',
  'one_per_user',
  'active'
];

const DURACOES = ['once', 'repeating', 'forever'];
const TIERS = ['tier-a', 'tier-b'];
const TIPOS_DESCONTO = ['percentage', 'fixed'];

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);

    // Mesmo gate do adminListRecords. Sob JWT o role é sempre 'user', então
    // este caminho só abre para a sessão hospedada do Base44 — que é onde o
    // admin vive, por decisão de arquitetura (ver ARQUITETURA_AUTH.md).
    if (!identity || identity.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { action, id, data } = await req.json();
    const svc = base44.asServiceRole.entities.Coupon;

    if (action === 'list') {
      // Pagina até esgotar. Parar na primeira página truncaria a lista em
      // silêncio, e um painel que esconde cupons é pior do que um que falha.
      const lote = 200;
      let cupons = [];
      let skip = 0;
      while (true) {
        const pagina = await svc.list('-created_date', lote, skip);
        if (!pagina || pagina.length === 0) break;
        cupons = cupons.concat(pagina);
        if (pagina.length < lote) break;
        skip += lote;
      }
      return Response.json({ success: true, count: cupons.length, coupons: cupons });
    }

    if (action === 'create') {
      const { erro, dados } = prepararDados(data, { novo: true });
      if (erro) return Response.json({ error: erro, success: false }, { status: 400 });
      const criado = await svc.create(dados);
      console.log('adminCoupons: cupom criado', dados.code, 'por', identity.email);
      return Response.json({ success: true, coupon: criado });
    }

    if (action === 'update') {
      if (!id) return Response.json({ error: 'id é obrigatório', success: false }, { status: 400 });
      const { erro, dados } = prepararDados(data, { novo: false });
      if (erro) return Response.json({ error: erro, success: false }, { status: 400 });
      if (Object.keys(dados).length === 0) {
        return Response.json({ error: 'Nada para atualizar', success: false }, { status: 400 });
      }
      const atualizado = await svc.update(id, dados);
      console.log('adminCoupons: cupom', id, 'atualizado por', identity.email);
      return Response.json({ success: true, coupon: atualizado });
    }

    if (action === 'delete') {
      if (!id) return Response.json({ error: 'id é obrigatório', success: false }, { status: 400 });
      await svc.delete(id);
      console.log('adminCoupons: cupom', id, 'excluído por', identity.email);
      return Response.json({ success: true });
    }

    return Response.json({ error: `Ação desconhecida: ${action}`, success: false }, { status: 400 });
  } catch (error) {
    console.error('Erro em adminCoupons:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
