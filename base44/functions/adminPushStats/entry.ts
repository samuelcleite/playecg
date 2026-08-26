import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// adminPushStats — quantos iPhones a gente alcança hoje, e quem são.
// -----------------------------------------------------------------------------
// A tela de notificações sabia enviar e não sabia dizer para quantos. O único
// número que ela mostrava era o de Web Push (navegador e PWA) — canal que não é
// o do app iOS, e nem é o que se usa. Esta function responde a pergunta que
// faltava, e ela tem DUAS respostas, de naturezas diferentes:
//
//   { acao: 'resumo'    } → UMA chamada ao OneSignal. Quantas subscriptions
//                           existem e quantas podem receber agora. Barata,
//                           autoritativa, anônima.
//   { acao: 'varredura' } → UMA chamada POR CONTA. Diz QUEM. Cara, e por isso
//                           paginada e disparada só por gesto explícito.
//
// As duas na mesma function pelo mesmo motivo que o `promocoes` reúne as dele:
// o critério de "tem push iOS ativo" é UM só. Separadas, ele viveria em dois
// lugares e divergiria — e o sintoma seria a tela mostrando um total que não
// bate com a lista logo abaixo.
//
// ─── POR QUE O NÚMERO VEM DO ONESIGNAL, E NÃO DE UM CONTADOR NOSSO ───────────
//
// Porque a verdade sobre a permissão mora no aparelho, e o único lugar que a
// conhece é o OneSignal. O app não sabe: o `utils/pushNativo.js` diz com todas
// as letras que do lado do Despia "não existe confirmação de nada" — o despia()
// resolve exista ou não a ponte nativa do outro lado. Um contador alimentado
// pelo cliente contaria intenções, e ficaria mudo justamente quando a pessoa
// revogasse a permissão nos Ajustes sem nunca mais abrir o app.
//
// ─── O QUE O NÚMERO É, E O QUE ELE NÃO É ─────────────────────────────────────
//
//   players             → total de subscriptions já registradas no app
//   messageable_players → as que estão inscritas e alcançáveis AGORA
//
// A diferença entre os dois é quem desinstalou ou desligou. Vale mais que
// qualquer um dos dois isolado, e é por isso que a tela mostra os três.
//
// São SUBSCRIPTIONS, ou seja APARELHOS — não pessoas. Quem tem iPhone e iPad
// conta duas vezes. A tela diz isso em voz alta em vez de deixar o número
// passar por "usuários", que é como ele seria lido se ninguém avisasse.
//
// Como o app do OneSignal só tem iOS configurado (o Despia é o único cliente
// que fala com ele; navegador e PWA vão por Web Push, que é outro transporte e
// outra entidade), este número JÁ É a contagem de iPhones. Não há filtro de
// plataforma a aplicar — e é bom que não haja: filtro por user agent é palpite,
// e aqui a plataforma vem do fato.
//
// ─── A CHAVE ─────────────────────────────────────────────────────────────────
//
// A doc do `GET /apps/{app_id}` diz "App API Key" — a mesma
// ONESIGNAL_REST_API_KEY que o sendOneSignalPush já usa. Mas os exemplos de SDK
// da própria OneSignal usam a Organization API Key no mesmo endpoint, então não
// dá para afirmar qual das duas ele aceita sem tentar. Por isso: tenta a do app
// e, em 401/403, repete com ONESIGNAL_ORG_API_KEY se ela existir. A resposta diz
// qual chave funcionou.
//
// Se as duas falharem, a resposta carrega o status HTTP e o corpo cru em vez de
// um zero. Zero fabricado já custou caro nesta tela: era o que o `recipients`
// fazia, acusando "ninguém inscrito" em envio que chegou no aparelho. Número que
// não foi lido não é zero, é ausência — e a tela pinta os dois de cores
// diferentes.
// -----------------------------------------------------------------------------

const ONESIGNAL_BASE = 'https://api.onesignal.com';

// Quantas contas a varredura verifica por chamada. Cem porque o gargalo não é o
// nosso lado: são cem requisições ao OneSignal, e um lote grande demais estoura
// o tempo da function no meio — sem retomada e sem saber onde parou. Quem
// costura os lotes é a tela, que ainda ganha o progresso de graça.
const TAMANHO_LOTE_PADRAO = 100;
const TAMANHO_LOTE_MAXIMO = 200;

// Requisições simultâneas dentro de um lote. Serial, cem contas levariam a
// function inteira; sem teto nenhum, cem conexões de uma vez é o tipo de coisa
// que a OneSignal responde com 429 — que aqui viraria "não deu para verificar"
// em massa. Seis é conservador de propósito: errar para baixo custa tempo de
// varredura, errar para cima faz a tela mentir.
const SIMULTANEAS = 6;

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

// ─── RESUMO ──────────────────────────────────────────────────────────────────

// null, e não 0, quando o campo não veio. São coisas diferentes: 0 é "ninguém
// inscrito", null é "a API não informou". Confundir os dois foi exatamente o bug
// do `recipients` no sendOneSignalPush.
function numeroOuNull(v) {
  return typeof v === 'number' ? v : null;
}

async function buscarApp(url, chave, qualChave) {
  let resp;
  try {
    resp = await fetch(url, { headers: { Authorization: `Key ${chave}` } });
  } catch (e) {
    return { configurado: true, ok: false, erro: `rede: ${e.message}`, chave_usada: qualChave };
  }

  const bruto = await resp.text();
  let corpo = null;
  try {
    corpo = JSON.parse(bruto);
  } catch (_e) {
    // Resposta não-JSON é o sintoma clássico de chave inválida — vale mais o
    // texto cru do que um "erro ao processar". Mesmo tratamento do
    // inspecionarOneSignal em promocoes.
    return {
      configurado: true,
      ok: false,
      status_http: resp.status,
      erro: 'resposta não-JSON',
      corpo_cru: bruto.slice(0, 300),
      chave_usada: qualChave
    };
  }

  if (!resp.ok) {
    return {
      configurado: true,
      ok: false,
      status_http: resp.status,
      erro: corpo?.errors ? JSON.stringify(corpo.errors).slice(0, 300) : 'status inesperado',
      chave_usada: qualChave
    };
  }

  return {
    configurado: true,
    ok: true,
    status_http: resp.status,
    chave_usada: qualChave,
    nome_app: corpo?.name ?? null,
    inscritos: numeroOuNull(corpo?.messageable_players),
    ja_inscreveram: numeroOuNull(corpo?.players)
  };
}

// Uma chamada, dois números. Ver o cabeçalho para o que cada um significa e por
// que a diferença entre eles é o dado mais útil dos três.
//
// NÃO passar `?view=config`: esse parâmetro faz o oposto do que se quer aqui —
// ele OMITE players e messageable_players para responder mais rápido.
async function lerResumoDoApp() {
  const appId = Deno.env.get('ONESIGNAL_APP_ID');
  const chaveApp = Deno.env.get('ONESIGNAL_REST_API_KEY');
  const chaveOrg = Deno.env.get('ONESIGNAL_ORG_API_KEY');

  if (!appId || !chaveApp) {
    return {
      configurado: false,
      ok: false,
      erro: 'ONESIGNAL_APP_ID ou ONESIGNAL_REST_API_KEY ausente no ambiente'
    };
  }

  const url = `${ONESIGNAL_BASE}/apps/${encodeURIComponent(appId)}`;

  // Tenta a chave do app; 401/403 vira uma segunda tentativa com a da
  // organização, quando ela existir. Ver o cabeçalho: a doc e os exemplos da
  // própria OneSignal discordam sobre qual das duas este endpoint aceita.
  const comApp = await buscarApp(url, chaveApp, 'app');
  if (comApp.ok) return comApp;

  if (comApp.status_http === 401 || comApp.status_http === 403) {
    if (chaveOrg) {
      const comOrg = await buscarApp(url, chaveOrg, 'organizacao');
      // Só troca se a segunda foi melhor. Se as duas falharem, o erro reportado
      // é o da PRIMEIRA: é a chave que se espera que funcione, e é sobre ela que
      // a mensagem de configuração deve falar.
      if (comOrg.ok) return comOrg;
    } else {
      comApp.dica =
        'A chave do app não tem permissão neste endpoint. Configure ONESIGNAL_ORG_API_KEY '
        + '(Organization API Key, no painel do OneSignal em Keys & IDs) e tente de novo.';
    }
  }

  return comApp;
}

// ─── VARREDURA ───────────────────────────────────────────────────────────────

// O MESMO critério do `promocoes`, palavra por palavra: iOSPush E inscrita.
// `enabled` é o aparelho estar apto; `notification_types` positivo é a pessoa
// não ter desligado. Campo AUSENTE não desqualifica (`!== false`, `!(x <= 0)`)
// — a API já mudou de modelo uma vez.
//
// Se este critério divergir do de lá, a tela vai contar gente que a promoção
// recusa, e a diferença não terá explicação nenhuma para quem olhar.
function temPushIOSAtivo(subscriptions) {
  return subscriptions.some(s =>
    s?.type === 'iOSPush' &&
    s?.enabled !== false &&
    !(typeof s?.notification_types === 'number' && s.notification_types <= 0)
  );
}

// Três desfechos, não dois: 'ativo', 'sem' e 'indisponivel'.
//
// O terceiro é o que impede a tela de mentir. Com dois estados, a rede caindo no
// meio da varredura viraria um monte de "não tem push" — e a conclusão seria que
// a base inteira desativou as notificações. Falha não é ausência.
async function verificarConta(conta, appId, apiKey) {
  const url = `${ONESIGNAL_BASE}/apps/${encodeURIComponent(appId)}/users/by/external_id/${encodeURIComponent(String(conta.id))}`;

  let resp;
  try {
    resp = await fetch(url, { headers: { Authorization: `Key ${apiKey}` } });
  } catch (_e) {
    return { estado: 'indisponivel' };
  }

  // 404 = o external_id não existe lá. Não é erro: é quem nunca ativou, ou
  // nunca abriu o app iOS. Mesmo tratamento do promocoes.
  if (resp.status === 404) return { estado: 'sem' };
  if (!resp.ok) return { estado: 'indisponivel' };

  let corpo;
  try {
    corpo = await resp.json();
  } catch (_e) {
    return { estado: 'indisponivel' };
  }

  const subs = Array.isArray(corpo?.subscriptions) ? corpo.subscriptions : [];
  return { estado: temPushIOSAtivo(subs) ? 'ativo' : 'sem' };
}

// Pool de tamanho fixo. Cada trabalhador puxa o próximo índice da fila até
// acabar — mantém SIMULTANEAS requisições no ar sem fatiar a lista em blocos,
// que desperdiçaria o tempo do bloco inteiro esperando o mais lento.
async function verificarEmParalelo(contas, appId, apiKey) {
  const resultados = new Array(contas.length);
  let proximo = 0;

  async function trabalhador() {
    while (true) {
      const i = proximo++;
      if (i >= contas.length) return;
      resultados[i] = await verificarConta(contas[i], appId, apiKey);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(SIMULTANEAS, contas.length) }, trabalhador)
  );

  return resultados;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);

    if (!identity || identity.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const corpo = await req.json().catch(() => ({}));
    const acao = corpo?.acao || 'resumo';

    if (acao === 'resumo') {
      return Response.json({ success: true, resumo: await lerResumoDoApp() });
    }

    if (acao === 'varredura') {
      const appId = Deno.env.get('ONESIGNAL_APP_ID');
      const apiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
      if (!appId || !apiKey) {
        return Response.json({ error: 'OneSignal não configurado', success: false }, { status: 500 });
      }

      const offset = Math.max(0, Number(corpo?.offset) || 0);
      const tamanho = Math.min(
        TAMANHO_LOTE_MAXIMO,
        Math.max(1, Number(corpo?.tamanho) || TAMANHO_LOTE_PADRAO)
      );

      // Sem ordenação explícita, igual ao listAll do adminListAccounts: o que
      // importa é a ordem ser ESTÁVEL entre chamadas, senão um lote repete
      // contas e pula outras.
      const contas = await base44.asServiceRole.entities.Account.list(null, tamanho, offset);
      const lote = Array.isArray(contas) ? contas : [];

      const estados = await verificarEmParalelo(lote, appId, apiKey);

      const ativos = [];
      let sem = 0;
      let indisponiveis = 0;

      lote.forEach((conta, i) => {
        const estado = estados[i]?.estado;
        if (estado === 'ativo') {
          // Só o que a tela usa: e-mail para mirar o envio, nome para
          // reconhecer a pessoa. Nada de id de subscription nem token de push.
          ativos.push({ email: conta.email || null, nome: conta.full_name || null });
        } else if (estado === 'indisponivel') {
          indisponiveis++;
        } else {
          sem++;
        }
      });

      // Lote menor que o pedido = acabaram as contas. Mesmo critério de parada
      // do listAll no adminListAccounts.
      const acabou = lote.length < tamanho;

      return Response.json({
        success: true,
        processadas: lote.length,
        proximo_offset: acabou ? null : offset + lote.length,
        ativos,
        sem,
        indisponiveis
      });
    }

    return Response.json({ error: `Ação desconhecida: ${acao}` }, { status: 400 });
  } catch (error) {
    console.error('Erro em adminPushStats:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
