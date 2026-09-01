import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// sendOneSignalPush
// -----------------------------------------------------------------------------
// Envia push para o app iOS nativo, via REST API do OneSignal.
//
// NÃO substitui o sendTestPush. Os dois transportes têm públicos DISJUNTOS por
// construção: o Web Push (sendTestPush + entidade PushSubscription) atende
// navegador e PWA; este atende o app iOS do Despia, onde o WKWebView nem expõe
// PushManager — nenhum usuário do app nativo jamais teve linha em
// PushSubscription. Não existe destinatário duplo, logo não existe deduplicação
// a fazer nem risco de notificação repetida.
//
// ALVO: o External ID da subscription no OneSignal, que é o Account.id — o
// mesmo valor que src/utils/pushNativo.js manda pela ponte do Despia a cada
// carregamento autenticado, e o mesmo que o RevenueCat usa como external_id.
// A entrada desta função é o e-mail (é o que a tela de admin já tem) e a
// resolução para Account.id acontece aqui dentro.
//
// UM OU MUITOS DESTINATÁRIOS, pelo mesmo caminho: `user_emails` é uma lista e
// `user_email` vira uma lista de um. O `include_aliases` aceita o array inteiro,
// então mandar para vinte pessoas é UMA chamada, não vinte — e o custo de um
// lote é o mesmo de um envio individual.
//
// SEM BROADCAST, de propósito: lista vazia devolve 400. Um broadcast exigiria
// included_segments, cujo nome padrão mudou na migração do OneSignal para o
// modelo de Subscriptions, e um erro de configuração ali acerta a base inteira
// de uma vez. A seleção explícita cobre o caso prático sem esse risco: mirar
// todo mundo é selecionar todo mundo, e aí a tela mostra quem vai receber ANTES
// de enviar.
//
// TETO POR CHAMADA: as fontes da OneSignal discordam (2.000 numa, 20.000 na
// referência atual). Fatiamos em 2.000, o menor dos dois — errar para baixo
// custa uma requisição a mais; errar para cima trunca o envio em silêncio.
//
// FORMATO DA API: "rich key" (o formato atual). Se a chave configurada for uma
// REST API Key legada, a resposta vem 401 e a migração é mecânica:
//   Authorization: `Key ...`            -> `Basic ...`
//   https://api.onesignal.com/notifications -> https://onesignal.com/api/v1/notifications
//   include_aliases + target_channel    -> include_external_user_ids
// Não há flag condicional aqui de propósito: um seletor 'rich'|'legacy' seria
// complexidade morta para uma decisão que se toma uma vez.
//
// Nenhuma entidade nova, nenhum campo novo, nenhuma dependência npm — fetch
// nativo, como o syncStoreSubscription já faz contra a API do RevenueCat.
// -----------------------------------------------------------------------------

const ONESIGNAL_URL = 'https://api.onesignal.com/notifications';

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

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

// Ver o cabeçalho: o menor dos dois tetos que a OneSignal documenta.
const MAX_ALIASES_POR_CHAMADA = 2000;

// Quantas resoluções de conta em paralelo. Mesma razão do pool no
// adminPushStats: serial, uma seleção de cinquenta viraria cinquenta idas ao
// banco em fila.
const SIMULTANEAS = 6;

// Uma lista de e-mails normalizada e SEM REPETIÇÃO. O `Set` não é zelo: a mesma
// pessoa seria mirada duas vezes no array de aliases, e o OneSignal poderia
// entregar duas notificações idênticas para o mesmo aparelho.
function normalizarLista(lista, unico) {
  const bruto = Array.isArray(lista) ? lista : [];
  if (unico) bruto.push(unico);
  return [...new Set(bruto.map(normalizeEmail).filter(Boolean))];
}

function* fatiar(itens, tamanho) {
  for (let i = 0; i < itens.length; i += tamanho) yield itens.slice(i, i + tamanho);
}

// E-mails -> Account.id, guardando quem não existe.
//
// Quem não vira conta é REPORTADO, não ignorado: a tela precisa dizer "mandei
// para 8 dos 10 selecionados" em vez de deixar duas pessoas de fora em silêncio.
async function resolverContas(base44, emails) {
  const ids = [];
  const naoEncontrados = [];
  let proximo = 0;

  async function trabalhador() {
    while (true) {
      const i = proximo++;
      if (i >= emails.length) return;
      const email = emails[i];
      const contas = await base44.asServiceRole.entities.Account.filter({ email });
      if (contas && contas.length > 0) ids.push(String(contas[0].id));
      else naoEncontrados.push(email);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(SIMULTANEAS, emails.length) }, trabalhador)
  );

  return { ids, naoEncontrados };
}

// Uma chamada ao OneSignal para uma fatia de external_ids.
//
// O SINAL CONFIÁVEL É `errors`. NÃO É `recipients`.
//
// A API rich NÃO devolve recipients: ela aceita a mensagem, responde na hora, e
// só depois resolve os aliases e conta os destinatários. Um envio comprovadamente
// entregue no device voltou assim:
//   { id: "31a1aee1-...", recipients: ausente, errors: null }
// Ou seja: `recipients` chega indefinido SEMPRE, e por isso não é repassado como
// 0. Fabricar o 0 fazia a tela de admin acusar "nenhum dispositivo inscrito" em
// envio que funcionou.
//
// Quem separa sucesso de problema é `errors`:
//   errors: null             -> o OneSignal aceitou a mensagem
//   errors: <qualquer coisa> -> ele sinalizou algo, e o conteúdo diz o quê
// Antes do rebuild do binário, um external_id sem subscription voltava
// errors: ["All included players are not subscribed"]. Com lote, o formato que
// interessa é `errors.invalid_aliases.external_id`: os ids que ele não resolveu.
//
// A CONTAGEM REAL DE ENTREGA VIVE NO PAINEL DO ONESIGNAL (Delivery), não nesta
// resposta. Não há como obtê-la aqui de forma síncrona.
//
// O FORMATO DE `errors` NÃO É GARANTIDO — array de strings em erro, null em
// sucesso, objeto no caso de aliases inválidos. O repasse é verbatim e quem
// renderiza trata os formatos defensivamente (ver renderErros na tela).
async function dispararLote(externalIds, { appId, apiKey, title, body, dataExtra }) {
  const payload = {
    app_id: appId,
    target_channel: 'push',
    include_aliases: { external_id: externalIds },
    headings: { en: title.trim() },
    contents: { en: body.trim() }
  };
  if (dataExtra) payload.data = dataExtra;

  const upstream = await fetch(ONESIGNAL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  // Lê como texto antes de tentar JSON: em erro de autenticação o OneSignal pode
  // responder com corpo não-JSON, e um throw aqui viraria um 500 opaco
  // justamente no caso que mais precisa ser diagnosticado.
  const bruto = await upstream.text();
  let resposta;
  try {
    resposta = JSON.parse(bruto);
  } catch (_e) {
    resposta = { raw: bruto };
  }

  return {
    // `ok` reflete a CHAMADA ter dado certo (HTTP 2xx), não a entrega.
    ok: upstream.ok,
    status: upstream.status,
    id: resposta?.id ?? null,
    errors: resposta?.errors ?? null,
    mirados: externalIds.length
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);

    // Só admin dispara envio. Isto é robusto por construção: o resolveIdentity
    // nunca devolve role 'admin' no caminho JWT, então só a sessão hospedada do
    // Base44 passa daqui.
    if (!identity || identity.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { user_email, user_emails, title, body, path } = await req.json();

    if (!title || !title.trim() || !body || !body.trim()) {
      return Response.json({ error: 'Título e mensagem são obrigatórios' }, { status: 400 });
    }

    // Um destinatário ou muitos entram pelo MESMO caminho: `user_email` vira uma
    // lista de um. Sem ramificação, o envio individual e o em lote não podem
    // divergir — e divergir aqui significaria a tela funcionar com uma pessoa e
    // falhar com duas, ou o contrário.
    const alvos = normalizarLista(user_emails, user_email);

    if (alvos.length === 0) {
      return Response.json(
        { error: 'Selecione ao menos um destinatário (envio para toda a base ainda não disponível)' },
        { status: 400 }
      );
    }

    const appId = Deno.env.get('ONESIGNAL_APP_ID');
    const apiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
    if (!appId || !apiKey) {
      return Response.json({ error: 'OneSignal não configurado' }, { status: 500 });
    }

    // E-mail -> Account.id. A tela de admin trabalha com e-mail; o OneSignal
    // trabalha com o Account.id. A tradução vive aqui para que a tela não
    // precise aprender um identificador novo nem exibir ids opacos.
    const { ids, naoEncontrados } = await resolverContas(base44, alvos);

    // Nenhum e-mail virou conta: não há o que mandar, e devolver 200 faria a
    // tela dizer "enviada" para um envio que não existiu.
    if (ids.length === 0) {
      return Response.json(
        { error: 'Nenhuma conta encontrada para os e-mails informados', success: false, nao_encontrados: naoEncontrados },
        { status: 404 }
      );
    }

    // Roteamento: o Despia lê `path` de dentro de `data`, atualiza a URL pela
    // History API e dispara popstate ao tocar na notificação. O router do app
    // (@remix-run/router) relê window.location no handlePop, então NÃO é
    // preciso código de roteamento no frontend.
    // Escotilha, caso um dia o router ignore o popstate: o Despia também expõe
    // window.onNotificationEvent. Não usamos hoje.
    const dataExtra = path && path.trim() ? { path: path.trim() } : null;

    // UMA chamada por fatia, não uma por pessoa: o `include_aliases` aceita o
    // array inteiro. Mandar para vinte custa o mesmo que mandar para um.
    const envios = [];
    for (const fatia of fatiar(ids, MAX_ALIASES_POR_CHAMADA)) {
      envios.push(await dispararLote(fatia, { appId, apiKey, title, body, dataExtra }));
    }

    // Sucesso é TODAS as fatias terem passado. Com uma fatia — o caso real de
    // hoje — isto é idêntico ao comportamento anterior.
    const sucesso = envios.every(e => e.ok);

    return Response.json({
      success: sucesso,
      destinatarios: ids.length,
      nao_encontrados: naoEncontrados,
      envios,
      // Compatibilidade com o formato de um destinatário só: a tela sabe ler os
      // dois, mas manter estes campos evita que um envio individual perca
      // informação de diagnóstico que já existia.
      status: envios[0]?.status ?? null,
      id: envios[0]?.id ?? null,
      errors: envios[0]?.errors ?? null,
      external_id_alvo: ids.length === 1 ? ids[0] : null
    });

  } catch (error) {
    console.error('Erro em sendOneSignalPush:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
