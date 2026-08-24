import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// syncStoreSubscription
// -----------------------------------------------------------------------------
// Pergunta ao RevenueCat se ESTE usuário tem assinatura de loja ativa e, se
// tiver, marca premium na Account na hora.
//
// POR QUE EXISTE: depois de comprar pela App Store, o app ficava até 20s em
// "Processando...", fazendo polling à espera do revenuecatWebhook. Esperar um
// evento externo chegar dentro de uma janela arbitrária é frágil por natureza —
// numa compra real o webhook demorou mais que a janela, e o usuário precisou
// fechar e reabrir o app para ver o premium que já tinha pago.
//
// Mas o RevenueCat sabe da compra no instante em que ela acontece. Não precisamos
// esperar ele nos avisar: podemos perguntar.
//
// NÃO CRIA Payment, de propósito. O revenuecatWebhook continua sendo o sistema de
// registro dos pagamentos; esta função só destrava o acesso. Criar Payment aqui
// duplicaria a linha quando o webhook chegasse depois, e pagamento duplicado no
// relatório é pior do que acesso liberado alguns segundos antes.
//
// Consulta os DOIS ids (Account.id e o User.id legado) pela mesma razão do
// deleteUserAccount: compra feita antes do corte está gravada sob o id antigo.
// -----------------------------------------------------------------------------

const NAO_LOJA = ['stripe', 'promotional'];

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

// Procura entitlement de loja ATIVO para um app_user_id.
// Devolve { ativo: bool, erro: bool }.
async function consultarSubscriber(appUserId, apiKey) {
  let resp;
  try {
    resp = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
  } catch (e) {
    console.error('syncStoreSubscription: rede:', e.message);
    return { ativo: false, erro: true };
  }

  if (resp.status !== 200 && resp.status !== 201) {
    console.error('syncStoreSubscription: status inesperado:', resp.status);
    return { ativo: false, erro: true };
  }

  let body;
  try {
    body = await resp.json();
  } catch (e) {
    return { ativo: false, erro: true };
  }

  const subscriber = body?.subscriber || {};
  const entitlements = subscriber.entitlements || {};
  const subscriptions = subscriber.subscriptions || {};
  const agora = Date.now();

  for (const ent of Object.values(entitlements)) {
    const exp = ent?.expires_date;
    const ativo = exp == null || new Date(exp).getTime() > agora;
    if (!ativo) continue;

    const sub = subscriptions[ent?.product_identifier];
    const store = sub?.store;
    // Stripe e promotional não são compra de loja: o stripeWebhook cuida do
    // primeiro, e cortesia não deve ser concedida por este caminho.
    if (typeof store === 'string' && NAO_LOJA.includes(store)) continue;

    return { ativo: true, erro: false };
  }

  return { ativo: false, erro: false };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);

    if (!identity) {
      return Response.json({ error: 'Unauthorized', success: false }, { status: 401 });
    }

    const email = (identity.email || '').trim().toLowerCase();
    const contas = await base44.asServiceRole.entities.Account.filter({ email });
    const account = contas && contas.length > 0 ? contas[0] : null;

    if (!account) {
      return Response.json({ error: 'Conta não encontrada', success: false }, { status: 404 });
    }

    // Já é premium: nada a fazer. Evita escrita à toa no caminho mais comum.
    if (account.subscription_type === 'premium') {
      return Response.json({ success: true, premium: true, mudou: false });
    }

    const apiKey = Deno.env.get('REVENUECAT_SECRET_KEY');
    if (!apiKey) {
      console.error('syncStoreSubscription: REVENUECAT_SECRET_KEY ausente');
      return Response.json({ success: false, premium: false, error: 'config' }, { status: 500 });
    }

    const users = await base44.asServiceRole.entities.User.filter({ email });
    const idLegado = users && users.length > 0 ? users[0].id : null;
    // revenuecat_user_id entra aqui porque este é o caminho que RECUPERA o
    // resgate de offer code do iOS: o webhook chegou antes de o app descobrir o
    // id do aparelho e foi descartado, e é esta consulta — disparada quando a
    // pessoa volta para a tela — que encontra a assinatura e libera o acesso.
    const ids = [...new Set([account.id, account.revenuecat_user_id, idLegado].filter(Boolean))];

    let ativo = false;
    for (const id of ids) {
      const r = await consultarSubscriber(id, apiKey);
      if (r.ativo) { ativo = true; break; }
    }

    if (!ativo) {
      // INVARIANTE lifetime_access
      // Quem tem lifetime_access NUNCA é escrito como 'free'.
      // subscription_type é o que CONCEDE o acesso — todas as telas do app
      // checam 'premium' e nenhuma sabe o que é vitalício. lifetime_access não
      // concede nada: ele só impede o rebaixamento. É a combinação dos dois que
      // sustenta o vitalício sem tocar em nenhuma tela.
      //
      // ATENÇÃO ao alterar este ramo: hoje ele NÃO escreve 'free' — só relata
      // `premium: false` e sai. Esta função é o terceiro caminho pelo qual o
      // rebaixamento poderia entrar, porque "o RevenueCat não conhece este
      // usuário" é indistinguível de "a assinatura dele acabou", e a tentação
      // de sincronizar o estado aqui é grande. O comprador vitalício NUNCA
      // teve compra de loja: uma consulta ao RevenueCat sobre ele volta vazia
      // por definição, e transformar isso em escrita rebaixaria todos eles de
      // uma vez.
      //
      // O guard é explícito e não decorativo: se a conta é vitalícia, esta
      // função responde premium: true, porque ela É premium — independente do
      // que a loja saiba. Sem isto, um cliente que confie na resposta desta
      // function (o Upgrade.jsx confia, no fluxo de restaurar compras) trataria
      // um vitalício como não-assinante.
      if (account.lifetime_access === true) {
        return Response.json({ success: true, premium: true, mudou: false });
      }
      return Response.json({ success: true, premium: false, mudou: false });
    }

    await base44.asServiceRole.entities.Account.update(account.id, {
      subscription_type: 'premium',
      subscription_start_date: account.subscription_start_date || new Date().toISOString(),
      // INVARIANTE trial_ends_at
      // Quem PAGA deixa de ter cortesia. Aqui a assinatura de loja foi
      // confirmada pelo RevenueCat; manter a marca de cortesia faria a
      // expiração do getMyAccount rebaixar um assinante de verdade.
      //
      // Repare que o subscription_start_date acima preserva a data antiga
      // quando ela existe — então a segunda barreira (pagamento posterior ao
      // início da cortesia) NÃO cobre este caminho. Esta linha é a que cobre.
      trial_ends_at: null,
      trial_started_at: null
    });

    console.log('syncStoreSubscription: premium liberado para', email);

    return Response.json({ success: true, premium: true, mudou: true });
  } catch (error) {
    console.error('Erro em syncStoreSubscription:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
