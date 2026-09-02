import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// promocoes — cortesia automática em troca de uma ação verificável do usuário.
// -----------------------------------------------------------------------------
// A primeira (e por ora única) promoção: ativar as notificações no app iOS vale
// 7 dias de premium.
//
// DUAS AÇÕES, UMA FUNCTION:
//   { acao: 'status'   } → o que a tela precisa saber para oferecer (ou calar)
//   { acao: 'resgatar' } → concede, se o critério estiver mesmo cumprido
//
// Juntas de propósito. Separadas, a regra de elegibilidade viveria em dois
// lugares e divergiria — e o sintoma seria a tela oferecendo o que o backend
// recusa, ou escondendo o que ele daria. Uma regra, dois modos de perguntar.
//
// ─── QUEM VERIFICA O CRITÉRIO ────────────────────────────────────────────────
//
// O SERVIDOR, sempre, perguntando ao OneSignal. Nunca o cliente.
//
// Isto não é zelo abstrato. O `utils/pushNativo.js` diz, com todas as letras,
// que do lado do app "não existe confirmação de nada": o despia() resolve
// incondicionalmente, exista ou não a ponte nativa. O estado que o app conhece é
// palpite — e mesmo que fosse certeza, chegaria aqui como um campo no corpo de
// um POST, que qualquer pessoa com o console aberto reescreve. É o mesmo
// raciocínio da trava do vitalício: se o critério vem do cliente, ele não é
// critério, é sugestão.
//
// O que o servidor confirma: existe, no OneSignal, uma subscription **iOSPush**
// inscrita para o external_id daquela conta — que é o `Account.id`, o mesmo
// identificador que o RevenueCat usa. É por isso que a promoção é iOS-only sem
// precisar confiar no user agent: a plataforma vem do fato, não da afirmação.
//
// FALHA FECHADO. OneSignal fora do ar, chave errada, resposta inesperada → não
// concede. Conceder no escuro é dar premium a quem não cumpriu; não conceder é
// um "tente de novo" para quem cumpriu.
//
// ─── COMO DESLIGAR ───────────────────────────────────────────────────────────
//
// Variável de ambiente `PROMO_PUSH_DIAS` no painel do Base44:
//
//     ausente, 0, ou não-numérica  →  promoção DESLIGADA
//     7                            →  ligada, valendo 7 dias
//
// Uma variável só, e não um par ativa/dias, porque duas podem discordar. Zerar
// desliga na hora, sem deploy e sem republicar function: o `status` passa a
// responder `ativa: false` e a tela some sozinha, porque quem decide se a oferta
// aparece é esta function, não o frontend.
//
// Desligar NÃO revoga quem já resgatou. As cortesias concedidas seguem seu
// prazo e vencem sozinhas, como qualquer outra.
//
// ─── DEPENDÊNCIA EXTERNA QUE PODE NÃO ESTAR DE PÉ ────────────────────────────
//
// Enquanto o binário do Despia não for reconstruído com o SDK do OneSignal
// embutido, NENHUMA conta terá subscription lá — e esta function vai recusar
// todo mundo com `sem_inscricao`. É o mesmo estado que o `sendOneSignalPush`
// documenta ao explicar por que repassa `recipients` verbatim. Ligue a promoção
// só depois de ver uma subscription real no painel do OneSignal
// (Audience → Subscriptions, coluna External ID).
// -----------------------------------------------------------------------------

// O catálogo de promoções. Hoje tem uma entrada; a forma existe para que a
// segunda não vire uma function inteira copiada — só mais uma linha aqui e um
// verificador ao lado.
//
// `verificar` recebe a conta e devolve { ok, code, error }. É a única parte que
// muda de uma promoção para outra: o resto do caminho (elegibilidade, uma vez
// por pessoa, concessão) é comum e vive fora do catálogo.
const PROMOCOES = {
  push_ios: {
    id: 'push_ios',
    envDias: 'PROMO_PUSH_DIAS',
    // Vai para o TrialGrant e é o que responde "esta conta já resgatou".
    origem: 'promo_push_ios',
    motivo: 'Ativou as notificações no app iOS',
    verificar: verificarPushIOS
  }
};

const ONESIGNAL_BASE = 'https://api.onesignal.com';

// Consulta o usuário no OneSignal pelo external_id (= Account.id) e diz se há
// uma subscription de iOS inscrita.
//
// A API "rich" é a mesma família que o sendOneSignalPush usa (Authorization:
// `Key ...`, host api.onesignal.com). Se a chave configurada for legada, aquela
// function responde 401 e esta também — a migração está documentada lá.
async function verificarPushIOS(conta) {
  const appId = Deno.env.get('ONESIGNAL_APP_ID');
  const apiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
  if (!appId || !apiKey) {
    console.error('promocoes: OneSignal não configurado');
    return { ok: false, code: 'indisponivel', error: 'Não foi possível confirmar agora. Tente de novo em alguns minutos.' };
  }

  const url = `${ONESIGNAL_BASE}/apps/${encodeURIComponent(appId)}/users/by/external_id/${encodeURIComponent(String(conta.id))}`;

  let resp;
  try {
    resp = await fetch(url, { headers: { Authorization: `Key ${apiKey}` } });
  } catch (e) {
    console.error('promocoes: rede OneSignal:', e.message);
    return { ok: false, code: 'indisponivel', error: 'Não foi possível confirmar agora. Tente de novo em alguns minutos.' };
  }

  // 404 = o external_id não existe lá. É o caso de quem nunca abriu o app iOS
  // com o binário novo, e também o estado de TODO MUNDO enquanto o rebuild não
  // sai. Não é erro: é "ainda não cumpriu".
  if (resp.status === 404) {
    return { ok: false, code: 'sem_inscricao', error: 'Não encontramos suas notificações ativas neste aparelho.' };
  }

  if (!resp.ok) {
    console.error('promocoes: status inesperado do OneSignal:', resp.status);
    return { ok: false, code: 'indisponivel', error: 'Não foi possível confirmar agora. Tente de novo em alguns minutos.' };
  }

  let corpo;
  try {
    corpo = await resp.json();
  } catch (_e) {
    return { ok: false, code: 'indisponivel', error: 'Não foi possível confirmar agora. Tente de novo em alguns minutos.' };
  }

  const subs = Array.isArray(corpo?.subscriptions) ? corpo.subscriptions : [];

  // iOSPush E inscrita. Os dois campos são checados porque significam coisas
  // diferentes: `enabled` é o device estar apto, `notification_types` positivo é
  // a pessoa não ter desligado. Um device que existe mas está opted-out não
  // cumpre o combinado.
  //
  // Tolerância deliberada a campo AUSENTE (`!== false`, `!(x <= 0)`): a API já
  // mudou de modelo uma vez, e o custo dos dois erros é assimétrico — recusar
  // quem cumpriu é uma promessa quebrada na cara do usuário; aceitar um caso
  // ambíguo custa sete dias.
  const inscrita = subs.some(s =>
    s?.type === 'iOSPush' &&
    s?.enabled !== false &&
    !(typeof s?.notification_types === 'number' && s.notification_types <= 0)
  );

  if (!inscrita) {
    return { ok: false, code: 'sem_inscricao', error: 'Não encontramos suas notificações ativas neste aparelho.' };
  }

  return { ok: true };
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

function avaliarElegibilidade(conta, agora) {
  if (!conta) {
    // Não criamos a conta aqui. Cortesia para quem ainda não se cadastrou não
    // teria onde pousar — a Account nasce no primeiro login, com o google_id ou
    // apple_id que só o fluxo de sign-in conhece.
    return {
      ok: false,
      code: 'account_not_found',
      status: 404,
      error: 'Nenhuma conta com esse e-mail. O usuário precisa ter entrado no app ao menos uma vez.'
    };
  }

  if (conta.lifetime_access === true) {
    return {
      ok: false,
      code: 'lifetime',
      status: 409,
      error: 'Esta conta tem acesso vitalício — cortesia não acrescenta nada.'
    };
  }

  // Cortesia em curso? A data no futuro é o que distingue "premium nosso" de
  // "premium pago". Uma data vencida não conta: quem está premium com trial
  // vencido é alguém que a expiração preguiçosa ainda não alcançou, e o
  // tratamento correto é o mesmo do free.
  const fimAtual = conta.trial_ends_at ? new Date(conta.trial_ends_at) : null;
  const emCortesia = !!(fimAtual && !isNaN(fimAtual.getTime()) && fimAtual > agora);

  // INVARIANTE trial_ends_at
  // Premium SEM trial_ends_at no futuro é premium pago, e pagante não recebe
  // cortesia: o carimbo faria o getMyAccount rebaixá-lo quando a data chegar.
  // Estender o acesso de quem paga não é caso de uso — se um dia for, o caminho
  // é outro campo, não este.
  if (conta.subscription_type === 'premium' && !emCortesia) {
    return {
      ok: false,
      code: 'ja_premium',
      status: 409,
      error: 'Esta conta já é premium por assinatura paga. Conceder cortesia aqui faria o acesso dela vencer.'
    };
  }

  return { ok: true, emCortesia, fimAtual };
}

// A ESCRITA DA CONCESSÃO, EM UM LUGAR SÓ.
//
// Cópia idêntica em `promocoes` — o Base44 não resolve import entre functions
// (ver ARQUITETURA_AUTH.md §2) e as duas precisam escrever exatamente as mesmas
// coisas. `npm run check:invariantes` compara as cópias por hash: mudar aqui sem
// mudar lá quebra o check.
//
// `origem` diz quem originou a concessão ('admin' ou o id de uma promoção). É
// dela que a regra "uma promoção por pessoa" se alimenta.
async function conceder(base44, conta, { dias, reason, identity, agora, emCortesia, fimAtual, origem = 'admin' }) {
  // Extensão soma ao prazo que ainda resta, em vez de reiniciar a partir de
  // hoje: quem tem 3 dias restantes e ganha mais 7 fica com 10, não com 7.
  const base = emCortesia ? fimAtual : agora;
  const fimNovo = new Date(base.getTime() + dias * 24 * 60 * 60 * 1000);

  await base44.asServiceRole.entities.Account.update(conta.id, {
    // subscription_type é o que CONCEDE o acesso; trial_ends_at é só o prazo.
    subscription_type: 'premium',
    trial_ends_at: fimNovo.toISOString(),
    // A extensão preserva o início da cortesia original: o campo marca desde
    // quando esta conta está em cortesia, e é com ele que os caminhos de
    // expiração descobrem se um pagamento veio depois.
    trial_started_at: emCortesia
      ? (conta.trial_started_at || agora.toISOString())
      : agora.toISOString(),
    // INVARIANTE store_expires_at
    // A cortesia não tem prazo de loja, e a elegibilidade já recusa quem é
    // assinante — então o campo aqui é sempre nulo na prática. Escrever o nulo
    // mesmo assim é o que torna isso verdade por construção em vez de por
    // argumento: no dia em que um caminho novo conceder cortesia a quem tem
    // assinatura de loja, o prazo dela não sobra armado contra a cortesia.
    store_expires_at: null
    // subscription_start_date NÃO entra aqui. Ver cabeçalho.
  });

  await base44.asServiceRole.entities.TrialGrant.create({
    user_email: (conta.email || '').trim().toLowerCase(),
    // Da IDENTIDADE, nunca do corpo: o autor de uma concessão é a única coisa
    // que o registro de auditoria não pode aceitar do cliente.
    granted_by: identity.email,
    granted_at: agora.toISOString(),
    expires_at: fimNovo.toISOString(),
    days: dias,
    reason: (reason || '').trim(),
    kind: emCortesia ? 'extension' : 'grant',
    origem
  });

  return fimNovo;
}


// A MESMA consulta do verificarPushIOS, mas devolvendo o que ela viu em vez de
// um sim/não. Só o diagnóstico usa.
//
// Repete a chamada em vez de o verificador devolver detalhe porque as duas têm
// públicos opostos: o verificador responde ao USUÁRIO e não pode vazar estado
// interno nem status HTTP de terceiro; este responde ao ADMIN, e quanto mais
// cru, melhor. Misturar os dois faria a mensagem do usuário carregar coisas que
// só o admin deveria ver.
async function inspecionarOneSignal(conta) {
  const appId = Deno.env.get('ONESIGNAL_APP_ID');
  const apiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');

  if (!appId || !apiKey) {
    return {
      configurado: false,
      erro: 'ONESIGNAL_APP_ID ou ONESIGNAL_REST_API_KEY ausente no ambiente',
      tem_usuario: false,
      inscrita_ios: false
    };
  }

  const url = `${ONESIGNAL_BASE}/apps/${encodeURIComponent(appId)}/users/by/external_id/${encodeURIComponent(String(conta.id))}`;

  let resp;
  try {
    resp = await fetch(url, { headers: { Authorization: `Key ${apiKey}` } });
  } catch (e) {
    return { configurado: true, erro: `rede: ${e.message}`, tem_usuario: false, inscrita_ios: false };
  }

  const bruto = await resp.text();
  let corpo = null;
  try {
    corpo = JSON.parse(bruto);
  } catch (_e) {
    // Resposta não-JSON é o sintoma clássico de chave inválida. Vale mais o
    // texto cru do que um "erro ao processar".
    return {
      configurado: true,
      status_http: resp.status,
      erro: 'resposta não-JSON',
      corpo_cru: bruto.slice(0, 300),
      tem_usuario: false,
      inscrita_ios: false
    };
  }

  if (resp.status === 404) {
    return { configurado: true, status_http: 404, tem_usuario: false, inscrita_ios: false, subscriptions: [] };
  }

  if (!resp.ok) {
    return {
      configurado: true,
      status_http: resp.status,
      erro: corpo?.errors ? JSON.stringify(corpo.errors).slice(0, 300) : 'status inesperado',
      tem_usuario: false,
      inscrita_ios: false
    };
  }

  const subs = Array.isArray(corpo?.subscriptions) ? corpo.subscriptions : [];

  return {
    configurado: true,
    status_http: resp.status,
    tem_usuario: true,
    // O external_id que o OneSignal conhece, para conferir contra o Account.id.
    aliases: corpo?.identity || null,
    // Só o que interessa de cada subscription — token de push não transita.
    subscriptions: subs.map(s => ({
      type: s?.type ?? null,
      enabled: s?.enabled ?? null,
      notification_types: s?.notification_types ?? null,
      device_os: s?.device_os ?? null
    })),
    inscrita_ios: subs.some(s =>
      s?.type === 'iOSPush' &&
      s?.enabled !== false &&
      !(typeof s?.notification_types === 'number' && s.notification_types <= 0)
    )
  };
}

// Dias que a promoção vale agora, lidos do ambiente a cada chamada — é isso que
// faz o desligamento valer na hora, sem republicar function. Qualquer coisa que
// não seja inteiro positivo significa desligada.
function diasDaPromocao(promo) {
  const bruto = Deno.env.get(promo.envDias);
  const n = Number(bruto);
  if (!Number.isInteger(n) || n < 1) return 0;
  return n;
}

// Já resgatou esta promoção alguma vez? A pergunta é sobre HISTÓRICO, não sobre
// estado: quem ganhou, usou e deixou vencer não ganha de novo. Por isso a
// resposta vem do TrialGrant (que guarda tudo) e não da Account (que guarda só
// o agora).
async function jaResgatou(base44, email, origem) {
  const grants = await base44.asServiceRole.entities.TrialGrant.filter({ user_email: email });
  return grants.some(g => g.origem === origem);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);

    // Promoção é para usuário logado comum — este é o único caminho de
    // concessão que NÃO exige admin. Daí todo o cuidado com a verificação: o
    // gate aqui é a identidade, e o critério é confirmado contra o OneSignal.
    if (!identity) {
      return Response.json({ error: 'Não autenticado', success: false }, { status: 401 });
    }

    const { acao, promocao, user_email } = await req.json();

    // hasOwnProperty, e não PROMOCOES[id] direto: com o acesso direto, um id
    // igual a "constructor" ou "toString" acha o membro herdado do
    // Object.prototype e passa como promoção válida. Mesmo furo que o
    // createStripeCheckout já corrigiu no seletor de planos — aqui o estrago
    // seria menor (a leitura da env falharia e cairia em "desligada"), mas o
    // padrão da casa é este.
    const id = promocao || 'push_ios';
    const promo = Object.prototype.hasOwnProperty.call(PROMOCOES, id) ? PROMOCOES[id] : null;

    if (!promo) {
      return Response.json({ error: 'Promoção desconhecida', success: false }, { status: 400 });
    }

    const dias = diasDaPromocao(promo);
    const email = (identity.email || '').trim().toLowerCase();
    const agora = new Date();

    // ── DIAGNÓSTICO (admin) ──────────────────────────────────────────────────
    //
    // Responde, para um e-mail qualquer, POR QUE a promoção deu ou não deu — a
    // cadeia inteira, etapa por etapa, incluindo o que o OneSignal respondeu.
    //
    // Existe porque a primeira falha em produção foi impossível de diagnosticar
    // do lado de fora: a tela simplesmente não mostrava a oferta, e "não
    // apareceu" cobre pelo menos cinco causas diferentes — promoção desligada,
    // conta inelegível, já resgatada, sem inscrição no OneSignal, ou a pessoa já
    // ter a permissão concedida (caso em que o banner some de propósito, porque
    // a promoção não é retroativa).
    //
    // É a única ação que exige admin, e a única que aceita um e-mail do corpo em
    // vez de usar a identidade — as duas coisas andam juntas: um usuário comum
    // não pode consultar a situação de outro.
    if (acao === 'diagnostico') {
      if (identity.role !== 'admin') {
        return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
      }

      const alvo = String(user_email || '').trim().toLowerCase();
      if (!alvo) {
        return Response.json({ error: 'Informe user_email', success: false }, { status: 400 });
      }

      const contasAlvo = await base44.asServiceRole.entities.Account.filter({ email: alvo });
      const contaAlvo = contasAlvo && contasAlvo.length > 0 ? contasAlvo[0] : null;

      if (!contaAlvo) {
        return Response.json({
          success: true,
          user_email: alvo,
          promocao_ativa: dias > 0,
          dias,
          conta_encontrada: false,
          veredito: 'Nenhuma conta com esse e-mail. O usuário precisa ter entrado no app ao menos uma vez.'
        });
      }

      const elegAlvo = avaliarElegibilidade(contaAlvo, agora);
      const emCortesiaAlvo = elegAlvo.ok && elegAlvo.emCortesia;
      const resgatouAlvo = await jaResgatou(base44, alvo, promo.origem);

      // A consulta crua ao OneSignal, com o que ela respondeu de verdade. É o
      // elo que ninguém consegue inspecionar de fora, e o que distingue "a
      // vinculação não funciona" de "a pessoa não autorizou".
      const oneSignal = await inspecionarOneSignal(contaAlvo);

      let veredito;
      if (dias === 0) {
        veredito = 'Promoção DESLIGADA: a variável PROMO_PUSH_DIAS está ausente, 0 ou não-numérica.';
      } else if (resgatouAlvo) {
        veredito = 'Esta conta JÁ resgatou a promoção. Uma vez por pessoa, para sempre.';
      } else if (!elegAlvo.ok) {
        veredito = `Conta inelegível (${elegAlvo.code}): ${elegAlvo.error}`;
      } else if (emCortesiaAlvo) {
        veredito = 'Conta já está em cortesia. A promoção não empilha prazo.';
      } else if (!oneSignal.inscrita_ios) {
        veredito = oneSignal.tem_usuario
          ? 'A conta existe no OneSignal, mas sem subscription iOS inscrita. A pessoa não autorizou, ou desligou depois.'
          : 'A conta NÃO existe no OneSignal para este external_id. A vinculação (AuthContext → pushNativo) não chegou lá.';
      } else {
        veredito = 'TUDO PRONTO: esta conta receberia a cortesia ao resgatar. Se a tela não ofereceu, é porque a permissão já estava concedida quando o app abriu — o banner só aparece para quem ainda vai autorizar (a promoção não é retroativa).';
      }

      return Response.json({
        success: true,
        user_email: alvo,
        promocao_ativa: dias > 0,
        dias,
        conta_encontrada: true,
        account_id: contaAlvo.id,
        subscription_type: contaAlvo.subscription_type || null,
        trial_ends_at: contaAlvo.trial_ends_at || null,
        lifetime_access: contaAlvo.lifetime_access === true,
        elegivel: elegAlvo.ok && !emCortesiaAlvo && !resgatouAlvo,
        ja_resgatou: resgatouAlvo,
        em_cortesia: emCortesiaAlvo,
        onesignal: oneSignal,
        veredito
      });
    }

    // Desligada: responde igual nas duas ações e nem olha a conta. Menos
    // trabalho, e principalmente: nenhum caminho de escrita alcançável enquanto
    // a variável estiver zerada.
    if (dias === 0) {
      return Response.json({ success: true, ativa: false, elegivel: false, motivo: 'desligada' });
    }

    const contas = await base44.asServiceRole.entities.Account.filter({ email });
    const conta = contas && contas.length > 0 ? contas[0] : null;
    if (!conta) {
      return Response.json({ error: 'Conta não encontrada', success: false }, { status: 404 });
    }

    // A MESMA regra da concessão manual, pela mesma função (cópia verificada por
    // hash). Quem já paga não recebe cortesia — aqui isso importa dobrado,
    // porque este caminho é automático e ninguém revisa cada caso.
    const elegibilidade = avaliarElegibilidade(conta, agora);

    // Cortesia em curso também não recebe. A concessão manual ESTENDE nesse
    // caso, e aqui a decisão é oposta de propósito: promoção automática que
    // empilha vira acúmulo silencioso — a pessoa ganha do admin, ganha da
    // promoção, e o prazo que aparece na tela não corresponde a nada que
    // alguém tenha decidido. A promoção é para quem não tem acesso.
    const emCortesia = elegibilidade.ok && elegibilidade.emCortesia;

    const resgatou = await jaResgatou(base44, email, promo.origem);

    const podeTentar = elegibilidade.ok && !emCortesia && !resgatou;

    let motivo = null;
    if (resgatou) motivo = 'ja_resgatou';
    else if (emCortesia) motivo = 'ja_em_cortesia';
    else if (!elegibilidade.ok) motivo = elegibilidade.code;

    // ── RESGATE PELO ADMIN ───────────────────────────────────────────────────
    //
    // Concede a promoção a um e-mail, sem exigir que a permissão tenha acabado
    // de ser dada naquele aparelho. É o único jeito de alcançar quem JÁ tinha as
    // notificações ativas — a tela, de propósito, não oferece resgate a essa
    // pessoa (a promoção não é retroativa), e no iOS não há como fazê-la passar
    // pelo fluxo de novo: uma permissão já decidida não reabre o prompt do
    // sistema, e reativar pelos Ajustes devolve o app ao estado "já concedida".
    //
    // Serve para duas coisas concretas:
    //   - TESTAR a cadeia inteira sem reinstalar o app;
    //   - SUPORTE, quando alguém cumpriu o combinado e ficou sem o prêmio por
    //     causa de um erro nosso.
    //
    // TODAS as outras regras continuam valendo, e a mais importante é a
    // verificação no OneSignal: este caminho NÃO é um "conceder porque eu
    // quero". Se a pessoa não tem inscrição ativa lá, ele recusa igual. Para
    // conceder cortesia por decisão sua, sem critério, o caminho é a tela de
    // concessão — que é honesta sobre ser isso.
    //
    // Também não fura o "uma vez por pessoa": quem já resgatou é recusado.
    if (acao === 'resgatar_admin') {
      if (identity.role !== 'admin') {
        return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
      }

      const alvo = String(user_email || '').trim().toLowerCase();
      if (!alvo) {
        return Response.json({ error: 'Informe user_email', success: false }, { status: 400 });
      }

      if (dias === 0) {
        return Response.json(
          { error: 'Promoção desligada (PROMO_PUSH_DIAS ausente ou 0).', success: false },
          { status: 409 }
        );
      }

      const contasAlvo = await base44.asServiceRole.entities.Account.filter({ email: alvo });
      const contaAlvo = contasAlvo && contasAlvo.length > 0 ? contasAlvo[0] : null;
      if (!contaAlvo) {
        return Response.json({ error: 'Conta não encontrada', success: false }, { status: 404 });
      }

      const elegAlvo = avaliarElegibilidade(contaAlvo, agora);
      if (!elegAlvo.ok) {
        return Response.json({ error: elegAlvo.error, code: elegAlvo.code, success: false }, { status: 409 });
      }
      if (elegAlvo.emCortesia) {
        return Response.json(
          { error: 'Esta conta já está em cortesia.', code: 'ja_em_cortesia', success: false },
          { status: 409 }
        );
      }
      if (await jaResgatou(base44, alvo, promo.origem)) {
        return Response.json(
          { error: 'Esta conta já resgatou esta promoção.', code: 'ja_resgatou', success: false },
          { status: 409 }
        );
      }

      const cumpriuAlvo = await promo.verificar(contaAlvo);
      if (!cumpriuAlvo.ok) {
        return Response.json(
          { error: cumpriuAlvo.error, code: cumpriuAlvo.code, success: false },
          { status: 409 }
        );
      }

      const fimAlvo = await conceder(base44, contaAlvo, {
        dias,
        reason: `${promo.motivo} (liberado por ${identity.email})`,
        // O autor fica registrado como o admin, não como a promoção: quem
        // decidiu liberar foi uma pessoa, e o histórico não deve dizer que a
        // regra rodou sozinha quando não rodou.
        identity: { email: identity.email },
        agora,
        emCortesia: false,
        fimAtual: null,
        origem: promo.origem
      });

      console.log('promocoes: resgate por admin —', alvo, '+', dias, 'dias, por', identity.email);

      return Response.json({
        success: true,
        user_email: alvo,
        dias,
        trial_ends_at: fimAlvo.toISOString()
      });
    }

    if (acao === 'status') {
      // O `status` NÃO consulta o OneSignal. Ele responde "esta conta pode
      // ganhar?", não "esta conta já cumpriu?" — quem cumpriu é conferido no
      // resgate. Assim a tela pode perguntar isto em todo carregamento sem
      // pendurar uma ida a servidor externo no caminho, e a verificação cara
      // acontece uma vez, no clique.
      return Response.json({
        success: true,
        promocao: promo.id,
        ativa: true,
        dias,
        elegivel: podeTentar,
        motivo
      });
    }

    if (acao !== 'resgatar') {
      return Response.json(
        { error: "acao precisa ser 'status', 'resgatar', 'diagnostico' ou 'resgatar_admin'", success: false },
        { status: 400 }
      );
    }

    if (!podeTentar) {
      return Response.json(
        {
          success: false,
          ativa: true,
          elegivel: false,
          motivo,
          error: resgatou
            ? 'Você já resgatou esta promoção.'
            : emCortesia
              ? 'Você já está com acesso de cortesia ativo.'
              : elegibilidade.error
        },
        { status: 409 }
      );
    }

    // A confirmação de verdade, contra o OneSignal. Só aqui, e só depois de a
    // conta ter passado por todo o resto — não faz sentido gastar uma ida à
    // rede para alguém que não poderia receber de qualquer jeito.
    const cumpriu = await promo.verificar(conta);
    if (!cumpriu.ok) {
      return Response.json(
        { success: false, ativa: true, elegivel: true, motivo: cumpriu.code, error: cumpriu.error },
        { status: 409 }
      );
    }

    const fimNovo = await conceder(base44, conta, {
      dias,
      reason: promo.motivo,
      // Não há admin nesta concessão: quem "concedeu" foi a regra. Gravar o
      // e-mail do próprio usuário em granted_by faria o histórico dizer que ele
      // se autoconcedeu premium, que é exatamente a leitura errada.
      identity: { email: `promocao:${promo.id}` },
      agora,
      emCortesia: false,
      fimAtual: null,
      origem: promo.origem
    });

    console.log('promocoes:', promo.id, '->', email, '+', dias, 'dias até', fimNovo.toISOString());

    return Response.json({
      success: true,
      promocao: promo.id,
      dias,
      trial_ends_at: fimNovo.toISOString()
    });
  } catch (error) {
    console.error('Erro em promocoes:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
