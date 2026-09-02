import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// getMyAccount
// -----------------------------------------------------------------------------
// Devolve a Account do usuário autenticado. É o `auth.me()` do mundo JWT: o
// objeto de sessão que o AuthContext passa a usar no lugar do User do Base44.
//
// Existe porque a Account tem `read: false` no RLS — o frontend não a lê de
// jeito nenhum, nem com sessão válida. Toda leitura passa por aqui.
//
// Funciona pelos dois caminhos de identidade. No caminho `base44` devolve a
// Account correspondente ao email da sessão, e não o User: depois do corte a
// Account é o registro único, e um admin que também use o app deve ver os
// mesmos dados independentemente de por onde entrou.
//
// NUNCA devolve password_hash. google_id/apple_id viram booleanos: a tela pode
// querer mostrar por onde a pessoa entra, mas o valor em si não deve transitar.
//
// TAMBÉM EXPIRA O ACESSO DE CORTESIA. Ver o bloco INVARIANTE trial_ends_at
// abaixo: é aqui, e só aqui, que o vencimento de um trial vira perda de acesso
// no app. Um endpoint de leitura que escreve é incomum e foi escolha
// deliberada — não há cron nesta plataforma, e este é o único ponto por onde
// TODA tela passa antes de decidir se mostra conteúdo pago.
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

// -----------------------------------------------------------------------------
// INVARIANTE trial_ends_at — cópia inline
//
// Este bloco é IDÊNTICO ao do adminExpireTrials. Cópia porque o Base44 não
// resolve import entre functions (mesma razão do resolveIdentity, ver
// ARQUITETURA_AUTH.md §2). Ao mudar a regra aqui, mude lá:
//   grep -rn "INVARIANTE trial_ends_at" base44/
// tem que achar os dois donos da decisão (getMyAccount, adminExpireTrials) além
// dos caminhos de pagamento que só limpam o campo.
//
// A regra: cortesia vencida rebaixa para 'free' — EXCETO quando rebaixar tiraria
// acesso de quem pagou. São dois casos, e os dois já custaram bug neste projeto
// pela versão do lifetime_access:
//
//   1. lifetime_access: comprou acesso permanente. Nunca vira 'free'.
//   2. pagamento posterior: assinou DEPOIS de ganhar a cortesia. A barreira
//      principal contra isso é a limpeza do trial_ends_at nos caminhos de
//      pagamento; esta é a segunda, para o dia em que um caminho novo de
//      promoção esquecer da primeira.
//
// Nos dois casos as marcas de cortesia saem assim mesmo: deixá-las é deixar a
// expiração armada contra a conta errada na próxima leitura.
// -----------------------------------------------------------------------------
function avaliarCortesia(conta, agora) {
  if (!conta.trial_ends_at) return { vencida: false };

  const fim = new Date(conta.trial_ends_at);
  if (isNaN(fim.getTime()) || fim > agora) return { vencida: false };

  if (conta.lifetime_access === true) {
    return { vencida: true, rebaixar: false, motivo: 'lifetime_access' };
  }

  const inicio = conta.trial_started_at ? new Date(conta.trial_started_at) : null;
  const assinou = conta.subscription_start_date ? new Date(conta.subscription_start_date) : null;
  if (
    inicio && assinou &&
    !isNaN(inicio.getTime()) && !isNaN(assinou.getTime()) &&
    assinou > inicio
  ) {
    return { vencida: true, rebaixar: false, motivo: 'pagamento_posterior' };
  }

  return { vencida: true, rebaixar: true };
}

// -----------------------------------------------------------------------------
// INVARIANTE store_expires_at
//
// A cortesia acima vence por data. O premium de LOJA não tinha nenhuma: até
// aqui, o único caminho do sistema capaz de rebaixar um assinante da App Store
// ou da Play Store era o `EXPIRATION` do revenuecatWebhook — um evento externo,
// entregue uma vez, sem segunda chance. Perdido, atribuído à conta errada ou
// respondido com 500, o acesso pago virava permanente e ninguém percebia. Foi
// exatamente o que aconteceu com uma assinatura mensal cancelada e expirada na
// App Store: a conta seguiu premium depois da data.
//
// O `store_expires_at` fecha isso do mesmo jeito que o `trial_ends_at` fecha a
// cortesia: uma data na nossa Account, conferida no único ponto por onde toda
// tela passa. Não há cron nesta plataforma — ver o cabeçalho.
//
// A DIFERENÇA IMPORTANTE, e é ela que torna isto seguro: a data NÃO decide nada.
// Ela só autoriza a PERGUNTA. Quem responde é o RevenueCat, e só uma resposta
// explícita de "esta assinatura existe e acabou" rebaixa alguém. É a objeção
// registrada no syncStoreSubscription — "o RevenueCat não conhece este usuário"
// é indistinguível de "a assinatura dele acabou" — respondida por construção:
//
//   ativa        -> não rebaixa; empurra a data para a frente. É o que faz um
//                   RENEWAL perdido virar um não-evento em vez de um cliente
//                   pagante rebaixado.
//   expirada     -> rebaixa. A loja mostrou a assinatura e mostrou o fim dela.
//   desconhecido -> NÃO rebaixa. A resposta veio, mas sem assinatura nenhuma:
//                   estamos olhando o app_user_id errado, e o comprador de
//                   vitalício (que nunca teve compra de loja) cai aqui por
//                   definição. Rebaixar por ausência é o erro caro.
//   erro         -> NÃO rebaixa. Rede, 500, JSON quebrado. Tenta de novo na
//                   próxima leitura; até lá o acesso continua.
//
// CUSTO: uma ida ao RevenueCat só quando o prazo já passou — nunca no
// carregamento normal de quem está em dia. Depois dela a data é reescrita ou
// apagada, então o caso não se repete a cada tela.
// -----------------------------------------------------------------------------

// Stripe e promotional não são compra de loja. Mesma lista do
// syncStoreSubscription e do getUserSubscriptionInfo.
const NAO_LOJA = ['stripe', 'promotional'];

function avaliarAssinaturaLoja(conta, agora) {
  if (!conta.store_expires_at) return { agir: false };

  const fim = new Date(conta.store_expires_at);
  // Data ilegível: nenhum caminho nosso grava isso, mas se estiver lá ela nunca
  // vence e nunca sai. Descartar é o único desfecho que não deixa lixo armado.
  if (isNaN(fim.getTime())) return { agir: true, verificar: false, motivo: 'data_invalida' };
  if (fim > agora) return { agir: false };

  // INVARIANTE lifetime_access
  // Quem comprou acesso permanente pode ter tido assinatura de loja antes. O
  // prazo dela vence aqui e não pode custar o acesso dele.
  if (conta.lifetime_access === true) {
    return { agir: true, verificar: false, motivo: 'lifetime_access' };
  }

  // INVARIANTE trial_ends_at
  // Cortesia em curso barra o rebaixamento pelo mesmo motivo e no mesmo
  // cenário. Ela segue com o prazo que tinha e vence sozinha em avaliarCortesia.
  const cortesia = conta.trial_ends_at ? new Date(conta.trial_ends_at) : null;
  if (cortesia && !isNaN(cortesia.getTime()) && cortesia > agora) {
    return { agir: true, verificar: false, motivo: 'cortesia_em_curso' };
  }

  return { agir: true, verificar: true };
}

// Estado da assinatura de loja de UM app_user_id.
// { estado: 'ativa'|'expirada'|'desconhecido'|'erro', expiraEm?: string }
async function consultarEstadoDaLoja(appUserId, apiKey) {
  let resp;
  try {
    resp = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
  } catch (e) {
    console.error('getMyAccount: rede RevenueCat:', e.message);
    return { estado: 'erro' };
  }

  if (resp.status !== 200 && resp.status !== 201) {
    console.error('getMyAccount: RevenueCat status inesperado:', resp.status);
    return { estado: 'erro' };
  }

  let body;
  try {
    body = await resp.json();
  } catch (_e) {
    return { estado: 'erro' };
  }

  // `subscriptions`, e não `entitlements`: o entitlement vencido some da
  // resposta em alguns formatos, e é justamente a assinatura vencida que
  // precisamos ENXERGAR para poder rebaixar. Assinatura é histórico; entitlement
  // é o estado de agora.
  const subscriptions = body?.subscriber?.subscriptions || {};
  const agora = Date.now();

  // A que vai mais longe manda: houve troca de produto, vale a de fim mais
  // distante.
  let melhor = null;
  for (const sub of Object.values(subscriptions)) {
    if (typeof sub?.store === 'string' && NAO_LOJA.includes(sub.store)) continue;
    const fim = sub?.expires_date ? new Date(sub.expires_date).getTime() : null;
    if (fim == null || isNaN(fim)) continue;
    if (melhor == null || fim > melhor) melhor = fim;
  }

  if (melhor == null) return { estado: 'desconhecido' };
  return {
    estado: melhor > agora ? 'ativa' : 'expirada',
    expiraEm: new Date(melhor).toISOString()
  };
}

// Consolida os vários app_user_id sob os quais a compra pode estar (Account.id,
// o id anônimo do aparelho, o User.id legado — mesma lista do
// syncStoreSubscription).
//
// A precedência não é a ordem da lista, é a força da resposta: uma 'ativa' em
// qualquer id vence tudo, e um 'erro' em qualquer id impede o rebaixamento
// mesmo que outro id já tenha dito 'expirada' — o id que falhou podia ser o que
// tinha a assinatura viva.
async function estadoDaLojaEntreIds(ids, apiKey) {
  let houveErro = false;
  let expirada = null;

  for (const id of ids) {
    const r = await consultarEstadoDaLoja(id, apiKey);
    if (r.estado === 'ativa') return r;
    if (r.estado === 'erro') houveErro = true;
    if (r.estado === 'expirada' && (!expirada || r.expiraEm > expirada.expiraEm)) expirada = r;
  }

  if (houveErro) return { estado: 'erro' };
  if (expirada) return expirada;
  return { estado: 'desconhecido' };
}

function sanitize(account, identity) {
  const { password_hash, google_id, apple_id, ...rest } = account;
  return {
    ...rest,
    // role vem da IDENTIDADE, não do registro: só a sessão Base44 concede admin.
    // Ler Account.role aqui abriria um caminho de escalação caso alguém um dia
    // gravasse 'admin' nesse campo.
    role: identity.role === 'admin' ? 'admin' : 'user',
    tem_google: !!google_id,
    tem_apple: !!apple_id,
    tem_senha: !!password_hash
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);

    if (!identity) {
      return Response.json({ error: 'Não autenticado', success: false }, { status: 401 });
    }

    const email = (identity.email || '').trim().toLowerCase();
    const accounts = await base44.asServiceRole.entities.Account.filter({ email });
    const account = accounts && accounts.length > 0 ? accounts[0] : null;

    if (!account) {
      // Autenticado sem Account. Acontece com admin que só existe como User e
      // nunca usou o app. O frontend trata como "sem sessão de usuário".
      return Response.json(
        { error: 'Conta não encontrada', code: 'account_not_found', success: false },
        { status: 404 }
      );
    }

    // Cortesia vencida: encerra ANTES de responder. Se a escrita e a resposta
    // discordassem, a tela seguinte mostraria conteúdo pago por mais um
    // carregamento — o currentUser.js guarda esta resposta em cache pelo
    // carregamento inteiro da página.
    const cortesia = avaliarCortesia(account, new Date());
    if (cortesia.vencida) {
      const fim = {
        ...(cortesia.rebaixar ? { subscription_type: 'free' } : {}),
        trial_ends_at: null,
        trial_started_at: null
      };
      await base44.asServiceRole.entities.Account.update(account.id, fim);
      Object.assign(account, fim);

      if (cortesia.rebaixar) {
        console.log('⏳ Cortesia vencida:', account.email, '-> free');
      } else {
        console.log(
          `🔒 INVARIANTE trial_ends_at (${cortesia.motivo}): rebaixamento ignorado para`,
          account.email
        );
      }
    }

    // Ciclo de loja vencido: confere com o RevenueCat antes de responder, pela
    // mesma razão da cortesia acima — o currentUser.js guarda esta resposta pelo
    // carregamento inteiro da página, e discordar dela mostraria conteúdo pago
    // por mais uma tela. Ver o bloco INVARIANTE store_expires_at.
    const loja = avaliarAssinaturaLoja(account, new Date());

    if (loja.agir && !loja.verificar) {
      // Protegido por invariante (ou data ilegível): o prazo sai, o acesso fica.
      const fim = { store_expires_at: null };
      await base44.asServiceRole.entities.Account.update(account.id, fim);
      Object.assign(account, fim);
      console.log(
        `🔒 INVARIANTE store_expires_at (${loja.motivo}): prazo de loja descartado sem rebaixar`,
        account.email
      );
    } else if (loja.agir) {
      const apiKey = Deno.env.get('REVENUECAT_SECRET_KEY');
      if (!apiKey) {
        // Sem chave não há pergunta a fazer, e sem resposta não se rebaixa
        // ninguém. O acesso continua; o log é o que denuncia a configuração.
        console.error('getMyAccount: REVENUECAT_SECRET_KEY ausente — prazo de loja não conferido');
      } else {
        // Os três ids pela mesma razão do syncStoreSubscription: a compra pode
        // estar sob o Account.id, sob o id anônimo do aparelho (offer code do
        // iOS) ou sob o User.id legado, anterior ao corte do AuthContext.
        const users = await base44.asServiceRole.entities.User.filter({ email });
        const idLegado = users && users.length > 0 ? users[0].id : null;
        const ids = [...new Set([account.id, account.revenuecat_user_id, idLegado].filter(Boolean))];

        const estado = await estadoDaLojaEntreIds(ids, apiKey);

        if (estado.estado === 'ativa') {
          // Renovou e o webhook não chegou até nós. Empurrar a data é o que
          // impede este caminho de perguntar de novo a cada tela — e é a prova
          // de que um RENEWAL perdido não custa o acesso de ninguém.
          const fim = { store_expires_at: estado.expiraEm };
          await base44.asServiceRole.entities.Account.update(account.id, fim);
          Object.assign(account, fim);
          console.log('🔄 Prazo de loja reconciliado:', account.email, '->', estado.expiraEm);
        } else if (estado.estado === 'expirada') {
          const fim = {
            subscription_type: 'free',
            store_expires_at: null,
            // INVARIANTE trial_ends_at
            // Não há cortesia em curso aqui — avaliarAssinaturaLoja recusa
            // rebaixar quando há. Limpar mesmo assim é a mesma higiene do
            // adminSetSubscription: marca de cortesia numa conta free é uma
            // expiração armada contra a próxima cortesia que essa pessoa ganhar.
            trial_ends_at: null,
            trial_started_at: null
          };
          await base44.asServiceRole.entities.Account.update(account.id, fim);
          Object.assign(account, fim);
          console.log('🛒 Assinatura de loja expirada:', account.email, '-> free (fim', estado.expiraEm + ')');
        } else {
          // 'desconhecido' e 'erro' não rebaixam ninguém — e é aqui que um
          // premium indevido sobrevive, de propósito. 'desconhecido' merece
          // investigação: quer dizer que a compra existiu (o prazo veio de um
          // webhook nosso) mas não está sob nenhum dos ids que consultamos.
          console.warn(
            `⚠️ Prazo de loja vencido e não confirmado (${estado.estado}) para ${account.email} — ` +
            `acesso mantido. Ids consultados: ${ids.join(', ')}`
          );
        }
      }
    }

    return Response.json({
      success: true,
      account: sanitize(account, identity),
      source: identity.source
    });
  } catch (error) {
    console.error('Erro em getMyAccount:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
