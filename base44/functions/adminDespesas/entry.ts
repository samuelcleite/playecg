import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// adminDespesas — escrita das despesas (Expense) da tela Financeiro.
// -----------------------------------------------------------------------------
// Só escreve: criar, editar, excluir. A leitura é do adminListFinanceiro, que
// tem retentativa em 429 pelo nome; escrita não repete (README §2), por isso
// as duas ficam separadas. Mesmo desenho do adminPartners: service role atrás
// de um gate de admin, campos permitidos por lista, helper de identidade
// copiado inline (o Base44 não resolve import relativo entre functions).
// -----------------------------------------------------------------------------

// created_by fica de fora de propósito: quem escreve nele é esta function, a
// partir da identidade da sessão — nunca o corpo da requisição.
const CAMPOS_PERMITIDOS = ['name', 'category', 'amount', 'competence_date', 'payment_date', 'notes'];

const CATEGORIAS = ['infraestrutura', 'software', 'impostos', 'taxas', 'marketing', 'pessoal', 'servicos', 'outros'];

const DIA = /^\d{4}-\d{2}-\d{2}$/;

function diaValido(v) {
  if (typeof v !== 'string' || !DIA.test(v)) return false;
  const [a, m, d] = v.split('-').map(Number);
  const data = new Date(Date.UTC(a, m - 1, d));
  // 2026-02-31 vira 03/03 no Date; a volta pela string pega isso.
  return data.toISOString().slice(0, 10) === v;
}

const tem = (obj, campo) => Object.prototype.hasOwnProperty.call(obj, campo);

// Só olha os campos PRESENTES no corpo: edição parcial não pode ser recusada
// por campo que nem tentou mudar.
function prepararDespesa(entrada, { novo }) {
  const bruto = entrada && typeof entrada === 'object' ? entrada : {};
  const dados = {};
  for (const campo of CAMPOS_PERMITIDOS) {
    if (tem(bruto, campo)) dados[campo] = bruto[campo];
  }

  if (novo) {
    for (const campo of ['name', 'category', 'amount', 'competence_date']) {
      if (!tem(dados, campo)) {
        const rotulo = { name: 'Nome', category: 'Tipo', amount: 'Valor', competence_date: 'Data de competência' }[campo];
        return { erro: `${rotulo} é obrigatório` };
      }
    }
  }

  if (tem(dados, 'name')) {
    if (typeof dados.name !== 'string' || !dados.name.trim()) return { erro: 'Nome é obrigatório' };
    dados.name = dados.name.trim();
  }

  if (tem(dados, 'category') && !CATEGORIAS.includes(dados.category)) {
    return { erro: `Tipo inválido: ${dados.category}` };
  }

  if (tem(dados, 'amount')) {
    const valor = typeof dados.amount === 'string' ? Number(dados.amount) : dados.amount;
    if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) {
      return { erro: 'Valor precisa ser maior que zero' };
    }
    // Centavos exatos: 0.1 + 0.2 da tela não pode virar 0.30000000000000004 no banco.
    dados.amount = Math.round(valor * 100) / 100;
  }

  if (tem(dados, 'competence_date') && !diaValido(dados.competence_date)) {
    return { erro: 'Data de competência inválida' };
  }

  // Vazio = ainda não paga. null explícito para a edição conseguir "despagar".
  if (tem(dados, 'payment_date')) {
    if (dados.payment_date === '' || dados.payment_date == null) {
      dados.payment_date = null;
    } else if (!diaValido(dados.payment_date)) {
      return { erro: 'Data de pagamento inválida' };
    }
  }

  if (tem(dados, 'notes')) {
    dados.notes = typeof dados.notes === 'string' && dados.notes.trim() ? dados.notes.trim() : null;
  }

  return { dados };
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

    const { action, id, data } = await req.json();
    const despesas = base44.asServiceRole.entities.Expense;

    switch (action) {
      case 'create': {
        const { erro, dados } = prepararDespesa(data, { novo: true });
        if (erro) return Response.json({ error: erro, success: false }, { status: 400 });
        dados.created_by = identity.email;
        const criada = await despesas.create(dados);
        console.log('adminDespesas: despesa criada', criada.id, 'por', identity.email);
        return Response.json({ success: true, despesa: criada });
      }

      case 'update': {
        if (!id) return Response.json({ error: 'id é obrigatório', success: false }, { status: 400 });
        const { erro, dados } = prepararDespesa(data, { novo: false });
        if (erro) return Response.json({ error: erro, success: false }, { status: 400 });
        if (Object.keys(dados).length === 0) {
          return Response.json({ error: 'Nada para atualizar', success: false }, { status: 400 });
        }
        const atualizada = await despesas.update(id, dados);
        return Response.json({ success: true, despesa: atualizada });
      }

      case 'delete': {
        if (!id) return Response.json({ error: 'id é obrigatório', success: false }, { status: 400 });
        await despesas.delete(id);
        console.log('adminDespesas: despesa', id, 'excluída por', identity.email);
        return Response.json({ success: true });
      }

      default:
        return Response.json({ error: `Ação desconhecida: ${action}`, success: false }, { status: 400 });
    }
  } catch (error) {
    console.error('Erro em adminDespesas:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
