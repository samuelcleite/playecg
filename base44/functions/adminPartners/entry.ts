import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// adminPartners
// -----------------------------------------------------------------------------
// CRM de parcerias: leitura e escrita administrativa de Partner, PartnerContact
// e PartnerInteraction, via service role atrás de um gate de admin.
//
// Mesmo desenho do adminCoupons: uma function por assunto, com o helper de
// identidade copiado inline (a duplicação é imposta pela plataforma — o
// Base44 não resolve import relativo entre functions). As três entidades
// vivem na mesma function porque andam sempre juntas na tela (um Partner só
// faz sentido com seus contatos e seu histórico ao lado).
// -----------------------------------------------------------------------------

const PARTNER_CAMPOS_PERMITIDOS = [
  'name', 'kind', 'category', 'category_other', 'stage',
  'notes', 'phone', 'email', 'instagram'
];
const CONTACT_CAMPOS_PERMITIDOS = [
  'partner_id', 'name', 'role', 'phone', 'email', 'instagram', 'notes', 'is_primary'
];
// created_by fica de fora de propósito: quem escreve nele é esta function, a
// partir da identidade da sessão — nunca o corpo da requisição.
const INTERACTION_CAMPOS_PERMITIDOS = ['partner_id', 'occurred_at', 'type', 'notes'];

const KINDS = ['institution', 'person'];
const CATEGORIES = ['influencer', 'academic_league', 'prep_course', 'medical_school', 'other'];
const STAGES = ['new_contact', 'talking', 'proposal_sent', 'negotiation', 'won', 'lost'];
const INTERACTION_TYPES = ['call', 'whatsapp', 'email', 'meeting', 'instagram', 'other'];

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

// Só olha os campos PRESENTES no corpo: update parcial (ex: drag-and-drop do
// Kanban manda só `{ stage }`) não pode ser recusado por causa de campo que
// nem tentou mudar.
function somenteCamposPermitidos(entrada, permitidos) {
  const bruto = entrada && typeof entrada === 'object' ? entrada : {};
  const dados = {};
  for (const campo of permitidos) {
    if (Object.prototype.hasOwnProperty.call(bruto, campo)) dados[campo] = bruto[campo];
  }
  return dados;
}

function prepararPartner(entrada, { novo }) {
  const dados = somenteCamposPermitidos(entrada, PARTNER_CAMPOS_PERMITIDOS);

  if (novo) {
    if (typeof dados.name !== 'string' || !dados.name.trim()) {
      return { erro: 'Nome é obrigatório' };
    }
    if (!dados.kind) return { erro: 'Tipo de cadastro (instituição/pessoa) é obrigatório' };
    if (!dados.category) return { erro: 'Categoria é obrigatória' };
    if (!dados.stage) dados.stage = 'new_contact';
  }

  if (Object.prototype.hasOwnProperty.call(dados, 'name')) {
    if (typeof dados.name !== 'string' || !dados.name.trim()) {
      return { erro: 'Nome é obrigatório' };
    }
    dados.name = dados.name.trim();
  }

  if (Object.prototype.hasOwnProperty.call(dados, 'kind') && !KINDS.includes(dados.kind)) {
    return { erro: `Tipo de cadastro inválido: ${dados.kind}` };
  }

  if (Object.prototype.hasOwnProperty.call(dados, 'category') && !CATEGORIES.includes(dados.category)) {
    return { erro: `Categoria inválida: ${dados.category}` };
  }

  // category_other só sobrevive junto de category = 'other'. Sem isto, trocar
  // a categoria de volta para uma da lista deixaria o texto livre da escolha
  // anterior pendurado no registro.
  if (Object.prototype.hasOwnProperty.call(dados, 'category_other')) {
    dados.category_other = dados.category === 'other' && typeof dados.category_other === 'string'
      ? dados.category_other.trim()
      : null;
  } else if (dados.category && dados.category !== 'other') {
    // Categoria mudou para algo diferente de 'other' nesta mesma escrita, sem
    // mandar category_other explicitamente: limpa mesmo assim.
    dados.category_other = null;
  }

  if (Object.prototype.hasOwnProperty.call(dados, 'stage') && !STAGES.includes(dados.stage)) {
    return { erro: `Etapa do funil inválida: ${dados.stage}` };
  }

  return { dados };
}

function prepararContact(entrada, { novo }) {
  const dados = somenteCamposPermitidos(entrada, CONTACT_CAMPOS_PERMITIDOS);

  if (novo) {
    if (!dados.partner_id) return { erro: 'partner_id é obrigatório' };
    if (typeof dados.name !== 'string' || !dados.name.trim()) {
      return { erro: 'Nome do contato é obrigatório' };
    }
  }
  if (Object.prototype.hasOwnProperty.call(dados, 'name')) {
    if (typeof dados.name !== 'string' || !dados.name.trim()) {
      return { erro: 'Nome do contato é obrigatório' };
    }
    dados.name = dados.name.trim();
  }

  return { dados };
}

function prepararInteraction(entrada, { novo }) {
  const dados = somenteCamposPermitidos(entrada, INTERACTION_CAMPOS_PERMITIDOS);

  if (novo) {
    if (!dados.partner_id) return { erro: 'partner_id é obrigatório' };
    if (!dados.occurred_at) return { erro: 'Data da interação é obrigatória' };
    if (!dados.type) return { erro: 'Tipo da interação é obrigatório' };
    if (typeof dados.notes !== 'string' || !dados.notes.trim()) {
      return { erro: 'Anotação é obrigatória' };
    }
  }

  if (Object.prototype.hasOwnProperty.call(dados, 'type') && !INTERACTION_TYPES.includes(dados.type)) {
    return { erro: `Tipo de interação inválido: ${dados.type}` };
  }
  if (Object.prototype.hasOwnProperty.call(dados, 'notes')) {
    if (typeof dados.notes !== 'string' || !dados.notes.trim()) {
      return { erro: 'Anotação é obrigatória' };
    }
    dados.notes = dados.notes.trim();
  }

  return { dados };
}

// Pagina até esgotar. Parar na primeira página truncaria a lista em silêncio.
async function listarTudo(svc, ordenacao, filtro) {
  const lote = 200;
  let todos = [];
  let skip = 0;
  while (true) {
    const pagina = filtro
      ? await svc.filter(filtro, ordenacao, lote, skip)
      : await svc.list(ordenacao, lote, skip);
    if (!pagina || pagina.length === 0) break;
    todos = todos.concat(pagina);
    if (pagina.length < lote) break;
    skip += lote;
  }
  return todos;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);

    if (!identity || identity.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { action, id, partner_id, data } = await req.json();
    const partners = base44.asServiceRole.entities.Partner;
    const contacts = base44.asServiceRole.entities.PartnerContact;
    const interactions = base44.asServiceRole.entities.PartnerInteraction;

    switch (action) {
      case 'listPartners': {
        const lista = await listarTudo(partners, '-created_date');
        return Response.json({ success: true, partners: lista });
      }

      case 'createPartner': {
        const { erro, dados } = prepararPartner(data, { novo: true });
        if (erro) return Response.json({ error: erro, success: false }, { status: 400 });
        const criado = await partners.create(dados);
        console.log('adminPartners: parceiro criado', criado.id, 'por', identity.email);
        return Response.json({ success: true, partner: criado });
      }

      case 'updatePartner': {
        if (!id) return Response.json({ error: 'id é obrigatório', success: false }, { status: 400 });
        const { erro, dados } = prepararPartner(data, { novo: false });
        if (erro) return Response.json({ error: erro, success: false }, { status: 400 });
        if (Object.keys(dados).length === 0) {
          return Response.json({ error: 'Nada para atualizar', success: false }, { status: 400 });
        }
        const atualizado = await partners.update(id, dados);
        return Response.json({ success: true, partner: atualizado });
      }

      case 'deletePartner': {
        if (!id) return Response.json({ error: 'id é obrigatório', success: false }, { status: 400 });
        // Apaga também os filhos (contatos e histórico) — sem isto, excluir um
        // parceiro deixaria registros órfãos apontando para um partner_id que
        // não existe mais, invisíveis e impossíveis de limpar pela tela.
        const [contatosDoParceiro, interacoesDoParceiro] = await Promise.all([
          listarTudo(contacts, '-created_date', { partner_id: id }),
          listarTudo(interactions, '-created_date', { partner_id: id })
        ]);
        await Promise.all([
          ...contatosDoParceiro.map((c) => contacts.delete(c.id)),
          ...interacoesDoParceiro.map((i) => interactions.delete(i.id))
        ]);
        await partners.delete(id);
        console.log('adminPartners: parceiro', id, 'excluído por', identity.email);
        return Response.json({ success: true });
      }

      case 'listContacts': {
        if (!partner_id) return Response.json({ error: 'partner_id é obrigatório', success: false }, { status: 400 });
        const lista = await listarTudo(contacts, '-created_date', { partner_id });
        return Response.json({ success: true, contacts: lista });
      }

      case 'createContact': {
        const { erro, dados } = prepararContact(data, { novo: true });
        if (erro) return Response.json({ error: erro, success: false }, { status: 400 });
        const criado = await contacts.create(dados);
        return Response.json({ success: true, contact: criado });
      }

      case 'updateContact': {
        if (!id) return Response.json({ error: 'id é obrigatório', success: false }, { status: 400 });
        const { erro, dados } = prepararContact(data, { novo: false });
        if (erro) return Response.json({ error: erro, success: false }, { status: 400 });
        if (Object.keys(dados).length === 0) {
          return Response.json({ error: 'Nada para atualizar', success: false }, { status: 400 });
        }
        const atualizado = await contacts.update(id, dados);
        return Response.json({ success: true, contact: atualizado });
      }

      case 'deleteContact': {
        if (!id) return Response.json({ error: 'id é obrigatório', success: false }, { status: 400 });
        await contacts.delete(id);
        return Response.json({ success: true });
      }

      case 'listInteractions': {
        if (!partner_id) return Response.json({ error: 'partner_id é obrigatório', success: false }, { status: 400 });
        const lista = await listarTudo(interactions, '-occurred_at', { partner_id });
        return Response.json({ success: true, interactions: lista });
      }

      case 'createInteraction': {
        const { erro, dados } = prepararInteraction(data, { novo: true });
        if (erro) return Response.json({ error: erro, success: false }, { status: 400 });
        // created_by vem SEMPRE da identidade da sessão, nunca do corpo —
        // mesmo cuidado do granted_by em TrialGrant.
        dados.created_by = identity.email;
        const criado = await interactions.create(dados);
        return Response.json({ success: true, interaction: criado });
      }

      case 'updateInteraction': {
        if (!id) return Response.json({ error: 'id é obrigatório', success: false }, { status: 400 });
        const { erro, dados } = prepararInteraction(data, { novo: false });
        if (erro) return Response.json({ error: erro, success: false }, { status: 400 });
        if (Object.keys(dados).length === 0) {
          return Response.json({ error: 'Nada para atualizar', success: false }, { status: 400 });
        }
        const atualizado = await interactions.update(id, dados);
        return Response.json({ success: true, interaction: atualizado });
      }

      case 'deleteInteraction': {
        if (!id) return Response.json({ error: 'id é obrigatório', success: false }, { status: 400 });
        await interactions.delete(id);
        return Response.json({ success: true });
      }

      default:
        return Response.json({ error: `Ação desconhecida: ${action}`, success: false }, { status: 400 });
    }
  } catch (error) {
    console.error('Erro em adminPartners:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
