import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import webpush from 'npm:web-push@3.6.7';
import { resolveIdentity } from '../../shared/auth.ts';

// lembretesDiarios — o resgate de quem se cadastrou e parou.
// -----------------------------------------------------------------------------
// Disparado todo dia às 19:00 (Brasília) pelo workflow "Lembretes Diários": um
// terço dos cadastros acontece entre 18h e 20h (contado em 26/09/2026), é a hora
// em que esse público está no celular. Dois lembretes, cada um NO MÁXIMO UMA VEZ
// por conta:
//
//   primeira_questao  conta criada há 20h a 72h que nunca respondeu uma questão
//                     — "Seu primeiro ECG está te esperando". Em 26/09/2026,
//                     metade de quem completava o perfil nunca respondia.
//   retorno           conta de até 7 dias que praticou ONTEM e ainda não hoje
//                     — "Suas questões de hoje estão liberadas". 1 em cada 3
//                     gratuitos que responderam parou exatamente na 5ª questão,
//                     na cota do Quiz, e não voltou.
//
// A janela de 20h a 72h é maior que um dia de propósito: se a tarefa falhar num
// dia, a do seguinte alcança quem ficou para trás, e a marca na conta
// (lembrete_*_em) impede o repeteco.
//
// CANAIS. E-mail para todos — é o único que alcança quem entrou pelo site, que
// virou a maior parte dos cadastros depois de 11/09/2026 — e push para quem
// autorizou: OneSignal no app do iPhone (external_id = Account.id) e Web Push no
// navegador. Push é complemento: falhar nele nunca impede o e-mail nem a marca.
// A marca é gravada quando ALGUM canal saiu; sem nenhum, a conta fica sem marca
// e é tentada de novo na rodada seguinte, enquanto estiver na janela.
//
// LIGA E DESLIGA PELA ENV `LEMBRETES_DIARIOS`, sem deploy, como a promoção de
// push: `1` envia. Ausente, ou qualquer outro valor, a rodada só CONTA quem
// receberia e registra no log — é o jeito de conferir o que a tarefa faria antes
// de ligá-la.
//
// QUEM PODE CHAMAR. A execução agendada chega sem sessão, como a do
// resumoDiario. Com sessão, só admin (sessão hospedada do Base44), e só admin
// usa os modos manuais:
//   { "simular": true }          devolve quem receberia, sem enviar nada;
//   { "teste_email": "x@y.com" } manda os dois modelos para esse endereço, sem
//                                ler nem marcar conta nenhuma.
// Usuário comum (JWT) leva 403. E como "sem sessão" também é o que um disparo
// anônimo parece, a rodada sem sessão só roda entre 18h e 22h de Brasília.
//
// DESCADASTRO. Todo e-mail leva o link /lembretes?t=<token>, onde a pessoa
// desativa os lembretes sem login (desativarLembretes). O token é a assinatura
// HMAC do Account.id com a JWT_SECRET e uma frase fixa: não serve de login, e
// ninguém forja o de outra pessoa. Sem JWT_SECRET, nenhum e-mail sai — e-mail
// sem saída não é enviado.
//
// E-MAIL DE RELAY DA APPLE (@privaterelay.appleid.com). A Apple só repassa
// e-mail de remetente registrado no Apple Developer (Sign in with Apple → envio
// de e-mail). Enquanto o remetente não estiver registrado, esses endereços
// recebem só o push; a env `APPLE_RELAY_REGISTRADO=1` libera o e-mail para eles.
// O `@apple.local` é marcador interno de quem não compartilhou e-mail com a
// Apple, nunca um endereço: não recebe e-mail nunca.
//
// LEITURAS (README §2). Uma consulta por rodada — contas criadas nos últimos 7
// dias, projetadas por `fields` e com teto —, mais uma pequena por pessoa que
// recebe lembrete, para achar a inscrição de Web Push (1 ou 2 por dia).
// -----------------------------------------------------------------------------

const TZ = 'America/Sao_Paulo';
const APP_URL = 'https://playecg.app';
const LOGO = 'https://media.base44.com/images/public/68e28688c6f4ec5cd17e317d/88192cd50_903B5817-5009-4B34-8478-509B00A9C6B8.png';
const ONESIGNAL_URL = 'https://api.onesignal.com/notifications';

const HORA = 60 * 60 * 1000;
const JANELA_PRIMEIRA_QUESTAO = { min: 20 * HORA, max: 72 * HORA };
const IDADE_MAX_DA_CONTA = 7 * 24 * HORA;
const HORARIO_DA_RODADA = { de: 18, ate: 22 }; // horas de Brasília
const LIMITE_LEITURA = 300;
const MAX_ENVIOS = 50;

// Tem que ser a MESMA frase do desativarLembretes: é ela que separa a
// assinatura deste link da assinatura do JWT de login.
const FRASE_DO_LINK = 'desativar-lembretes:';

const CAMPOS = [
  'id', 'email', 'full_name', 'role', 'created_date', 'subscription_type',
  'total_attempts', 'last_practice_date', 'current_streak', 'plataforma_cadastro',
  'lembrete_primeira_questao_em', 'lembrete_retorno_em', 'lembretes_desativados_em'
];

const CAMPO_DA_MARCA = {
  primeira_questao: 'lembrete_primeira_questao_em',
  retorno: 'lembrete_retorno_em'
};

const MENSAGENS = {
  primeira_questao: (nome, conta) => ({
    assunto: nome ? `${nome}, seu primeiro ECG está te esperando` : 'Seu primeiro ECG está te esperando',
    titulo: 'Seu primeiro ECG está te esperando',
    texto:
      conta.subscription_type === 'premium'
        ? 'Você criou sua conta no PlayECG, mas ainda não resolveu nenhum caso. O primeiro leva 1 minuto, e a trilha inteira está liberada para você.'
        : 'Você criou sua conta no PlayECG, mas ainda não resolveu nenhum caso. O primeiro leva 1 minuto, e o Módulo 1 é todo grátis, com a explicação de cada caso.',
    botao: 'Resolver meu primeiro caso',
    push: { titulo: 'Seu primeiro ECG está te esperando', texto: 'Leva 1 minuto. Comece pelo Módulo 1.' }
  }),
  retorno: (nome, conta) => {
    const dias = Number(conta.current_streak) || 0;
    const premium = conta.subscription_type === 'premium';
    const titulo = premium ? 'Seu treino de hoje está te esperando' : 'Suas questões de hoje estão liberadas';
    return {
      assunto: nome ? `${nome}, ${titulo.charAt(0).toLowerCase()}${titulo.slice(1)}` : titulo,
      titulo,
      texto:
        dias > 0
          ? `Ontem você treinou ECG no PlayECG. Resolva um caso hoje para manter sua ofensiva de ${dias} ${dias === 1 ? 'dia' : 'dias'}.`
          : 'Ontem você treinou ECG no PlayECG. Hoje tem mais casos te esperando.',
      botao: 'Continuar treinando',
      push: { titulo, texto: 'Resolva um caso hoje e mantenha sua ofensiva.' }
    };
  }
};

function diaEmBrasilia(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(d);
}

function horaEmBrasilia(d) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(d));
  return h % 24;
}

// created_date chega sem fuso ("2026-09-26T15:01:39.769000") e é UTC. O
// new Date() leria como hora LOCAL de quem roda; aqui ela vira UTC de propósito.
function lerData(v) {
  if (!v) return null;
  const s = String(v);
  const d = new Date(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
  return isNaN(d.getTime()) ? null : d;
}

function escaparHtml(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Nomes gravados corrompidos pelo googleSignIn até 26/09/2026 ("JoÃ£o"): mesma
// regra de src/lib/nome.js — só troca se os "bytes" formarem UTF-8 válido.
function repararNome(nome) {
  if (typeof nome !== 'string') return '';
  let temByteAlto = false;
  for (let i = 0; i < nome.length; i++) {
    const c = nome.charCodeAt(i);
    if (c > 0xff) return nome;
    if (c >= 0x80) temByteAlto = true;
  }
  if (!temByteAlto) return nome;
  try {
    const bytes = Uint8Array.from(nome, (ch) => ch.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (_e) {
    return nome;
  }
}

function primeiroNome(conta) {
  return repararNome((conta.full_name || '').trim()).split(/\s+/)[0] || '';
}

// Para o log: o suficiente para achar a pessoa na tela de usuários, sem
// deixar o endereço inteiro registrado.
function mascarar(email) {
  const [usuario, dominio] = String(email || '').split('@');
  return `${(usuario || '').slice(0, 2)}***@${dominio || ''}`;
}

function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function assinarLink(contaId, segredo) {
  const chave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(segredo),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const assinatura = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(FRASE_DO_LINK + contaId));
  return `${contaId}.${b64url(assinatura)}`;
}

// Quem recebe o quê nesta rodada. Função pura — só as contas e o relógio —, para
// a regra poder ser conferida sem banco e sem envio.
function escolherAlvos(contas, agora) {
  const ontem = diaEmBrasilia(new Date(agora.getTime() - 24 * HORA));
  const alvos = [];
  for (const c of contas) {
    if (!c?.id || c.role === 'admin' || c.lembretes_desativados_em) continue;
    const criada = lerData(c.created_date);
    if (!criada) continue;
    const idade = agora.getTime() - criada.getTime();
    const respondeu = (Number(c.total_attempts) || 0) > 0 || !!c.last_practice_date;

    if (
      !respondeu &&
      !c.lembrete_primeira_questao_em &&
      idade >= JANELA_PRIMEIRA_QUESTAO.min &&
      idade <= JANELA_PRIMEIRA_QUESTAO.max
    ) {
      alvos.push({ conta: c, tipo: 'primeira_questao' });
    } else if (
      respondeu &&
      !c.lembrete_retorno_em &&
      idade <= IDADE_MAX_DA_CONTA &&
      c.last_practice_date === ontem
    ) {
      // last_practice_date igual a ontem já garante que hoje não praticou.
      alvos.push({ conta: c, tipo: 'retorno' });
    }
  }
  return alvos;
}

function montarEmail(msg, { nome, linkDesativar, doApp }) {
  const saudacao = nome
    ? `<p style="font-size:15px;color:#40505F;margin:18px 0 0;">Olá, ${escaparHtml(nome)}!</p>`
    : '';
  // Sem universal link, o botão abre o site. Quem se cadastrou pelo app entra
  // no site com o mesmo Google/Apple e cai na mesma conta — mas pode preferir
  // abrir o app, e é isso que esta linha lembra.
  const dicaDoApp = doApp
    ? '<p style="font-size:13px;line-height:1.5;color:#6B7785;margin:16px 0 0;">Se preferir, é só abrir o app do PlayECG no seu celular.</p>'
    : '';
  return `
<div style="background:#F4F6F8;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border:1px solid #E6EAEE;border-radius:20px;padding:28px 24px;color:#0D1E30;">
    <img src="${LOGO}" width="56" height="56" alt="PlayECG" style="display:block;border-radius:14px;">
    ${saudacao}
    <h1 style="font-size:22px;line-height:1.25;margin:8px 0 10px;color:#0D1E30;">${escaparHtml(msg.titulo)}</h1>
    <p style="font-size:15px;line-height:1.55;color:#40505F;margin:0 0 22px;">${escaparHtml(msg.texto)}</p>
    <a href="${APP_URL}/Dashboard" style="display:inline-block;background:#39FF6A;color:#0D1E30;font-weight:bold;font-size:15px;text-decoration:none;padding:14px 22px;border-radius:12px;">${escaparHtml(msg.botao)}</a>
    ${dicaDoApp}
  </div>
  <p style="max-width:480px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#9AA6B2;text-align:center;">
    Você recebeu este e-mail porque criou uma conta no PlayECG. Não quer receber lembretes?
    <a href="${escaparHtml(linkDesativar)}" style="color:#6B7785;">Desativar lembretes</a>.
  </p>
</div>`;
}

// Push no app do iPhone. `errors` nulo é o sinal de aceito (ver
// sendOneSignalPush); pessoa sem inscrição volta com `errors` preenchido, e isso
// só quer dizer que o canal não existe para ela.
async function pushNoApp(contaId, msg) {
  const appId = Deno.env.get('ONESIGNAL_APP_ID');
  const apiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
  if (!appId || !apiKey) return false;
  try {
    const resposta = await fetch(ONESIGNAL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${apiKey}` },
      body: JSON.stringify({
        app_id: appId,
        target_channel: 'push',
        include_aliases: { external_id: [contaId] },
        headings: { en: msg.push.titulo },
        contents: { en: msg.push.texto },
        // O Despia lê `path` e abre o app nesta tela (ver sendOneSignalPush).
        data: { path: '/dashboard' }
      })
    });
    const corpo = await resposta.json().catch(() => ({}));
    return resposta.ok && !corpo?.errors;
  } catch (e) {
    console.error('lembretesDiarios: falha no OneSignal:', e?.message || e);
    return false;
  }
}

// Push no navegador, para quem ativou as notificações no site. O service worker
// (public/sw.js) abre `url` ao tocar.
async function pushNoNavegador(svc, email, msg, vapidPronto) {
  if (!vapidPronto) return false;
  let inscricoes = [];
  try {
    inscricoes = (await svc.entities.PushSubscription.filter({ user_email: email }, '-created_date', 5)) || [];
  } catch (e) {
    console.error('lembretesDiarios: falha ao ler PushSubscription:', e?.message || e);
    return false;
  }
  const payload = JSON.stringify({ title: msg.push.titulo, body: msg.push.texto, url: '/Dashboard' });
  let algum = false;
  for (const s of inscricoes) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      algum = true;
    } catch (err) {
      // Inscrição vencida ou revogada: sai da lista, como no sendTestPush.
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await svc.entities.PushSubscription.delete(s.id).catch(() => {});
      }
    }
  }
  return algum;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);
    const admin = identity?.role === 'admin';

    // Usuário comum nunca dispara lembrete, por nenhum caminho.
    if (identity && !admin) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    let corpo = {};
    try {
      corpo = await req.json();
    } catch (_e) {
      corpo = {};
    }
    if ((corpo?.simular || corpo?.teste_email) && !admin) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const svc = base44.asServiceRole;
    const agora = new Date();

    // ── TESTE DE E-MAIL (só admin) ──────────────────────────────────────────
    // É a prova de que o e-mail do Base44 chega a um endereço que não é usuário
    // do Base44 — o caso de todos os nossos usuários desde o corte de julho.
    if (corpo.teste_email) {
      const para = String(corpo.teste_email).trim();
      if (!para.includes('@')) {
        return Response.json({ error: 'teste_email inválido' }, { status: 400 });
      }
      const resultados = [];
      for (const tipo of Object.keys(MENSAGENS)) {
        // Conta de exemplo, só para montar o texto: sem plano, as mensagens
        // saem na versão do plano gratuito. Nada aqui é gravado.
        const msg = MENSAGENS[tipo]('Teste', { current_streak: 1 });
        try {
          await svc.integrations.Core.SendEmail({
            to: para,
            subject: `[teste] ${msg.assunto}`,
            html: montarEmail(msg, { nome: 'Teste', linkDesativar: `${APP_URL}/lembretes?t=exemplo`, doApp: true }),
            from_name: 'PlayECG'
          });
          resultados.push({ tipo, enviado: true });
        } catch (e) {
          resultados.push({ tipo, enviado: false, erro: e?.message || String(e) });
        }
      }
      return Response.json({ success: resultados.every((r) => r.enviado), teste_email: para, resultados });
    }

    // ── TRAVA DE HORÁRIO DA RODADA SEM SESSÃO ───────────────────────────────
    if (!identity) {
      const hora = horaEmBrasilia(agora);
      if (hora < HORARIO_DA_RODADA.de || hora >= HORARIO_DA_RODADA.ate) {
        console.warn(`lembretesDiarios: chamada sem sessão às ${hora}h de Brasília, fora da janela da rodada — ignorada`);
        return Response.json({ success: false, ignorado: 'fora_do_horario' });
      }
    }

    const ligado = Deno.env.get('LEMBRETES_DIARIOS') === '1';
    const simular = !!corpo.simular || !ligado;
    const relayLiberado = Deno.env.get('APPLE_RELAY_REGISTRADO') === '1';
    const segredo = Deno.env.get('JWT_SECRET');

    // ── QUEM RECEBE ─────────────────────────────────────────────────────────
    const desde = new Date(agora.getTime() - IDADE_MAX_DA_CONTA).toISOString();
    const contas = (await svc.entities.Account.filter(
      { created_date: { $gte: desde } },
      '-created_date',
      LIMITE_LEITURA,
      0,
      CAMPOS
    )) || [];
    const alvos = escolherAlvos(contas, agora);

    const resumo = {
      ligado,
      simulacao: simular,
      contas_lidas: contas.length,
      candidatos: alvos.length,
      com_email: 0,
      so_push: 0,
      sem_canal: 0
    };

    if (simular) {
      console.log(
        `lembretesDiarios: ${ligado ? 'simulação' : 'DESLIGADO (LEMBRETES_DIARIOS != 1), só contando'} — ` +
        `${alvos.length} receberiam: ${alvos.map((a) => `${a.tipo}:${mascarar(a.conta.email)}`).join(', ') || 'ninguém'}`
      );
      return Response.json({
        success: true,
        ...resumo,
        alvos: admin
          ? alvos.map((a) => ({ tipo: a.tipo, email: a.conta.email, criada_em: a.conta.created_date }))
          : undefined
      });
    }

    if (!segredo) {
      console.error('lembretesDiarios: JWT_SECRET ausente — sem link de descadastro, nenhum e-mail sai (só push)');
    }

    let vapidPronto = false;
    const vapidPub = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPriv = Deno.env.get('VAPID_PRIVATE_KEY');
    const vapidSubj = Deno.env.get('VAPID_SUBJECT');
    if (vapidPub && vapidPriv && vapidSubj) {
      try {
        webpush.setVapidDetails(vapidSubj, vapidPub, vapidPriv);
        vapidPronto = true;
      } catch (e) {
        console.error('lembretesDiarios: VAPID inválido, Web Push desligado nesta rodada:', e?.message || e);
      }
    }

    // ── ENVIO ───────────────────────────────────────────────────────────────
    const detalhes = [];
    for (const { conta, tipo } of alvos.slice(0, MAX_ENVIOS)) {
      const nome = primeiroNome(conta);
      const msg = MENSAGENS[tipo](nome, conta);
      const email = String(conta.email || '').trim().toLowerCase();
      const recebeEmail =
        !!segredo &&
        email.includes('@') &&
        !email.endsWith('@apple.local') &&
        (relayLiberado || !email.endsWith('@privaterelay.appleid.com'));

      let emailOk = false;
      if (recebeEmail) {
        try {
          const token = await assinarLink(conta.id, segredo);
          await svc.integrations.Core.SendEmail({
            to: email,
            subject: msg.assunto,
            html: montarEmail(msg, {
              nome,
              linkDesativar: `${APP_URL}/lembretes?t=${encodeURIComponent(token)}`,
              doApp: conta.plataforma_cadastro === 'ios_app' || conta.plataforma_cadastro === 'android_app'
            }),
            from_name: 'PlayECG'
          });
          emailOk = true;
        } catch (e) {
          console.error(`lembretesDiarios: e-mail falhou (${tipo}, ${mascarar(email)}): ${e?.message || e}`);
        }
      }

      const [pushApp, pushWeb] = await Promise.all([
        pushNoApp(conta.id, msg),
        pushNoNavegador(svc, email, msg, vapidPronto)
      ]);

      if (emailOk || pushApp || pushWeb) {
        try {
          await svc.entities.Account.update(conta.id, { [CAMPO_DA_MARCA[tipo]]: agora.toISOString() });
        } catch (e) {
          // Saiu e não ficou marcado: amanhã a pessoa receberia de novo. É raro,
          // e por isso precisa gritar no log.
          console.error(`lembretesDiarios: ENVIADO SEM MARCA (${tipo}, conta ${conta.id}): ${e?.message || e}`);
        }
        if (emailOk) resumo.com_email += 1;
        else resumo.so_push += 1;
      } else {
        resumo.sem_canal += 1;
      }
      detalhes.push({ tipo, email: mascarar(email), email_ok: emailOk, push_app: pushApp, push_web: pushWeb });
    }

    console.log(
      `lembretesDiarios: candidatos=${alvos.length}, com e-mail=${resumo.com_email}, só push=${resumo.so_push}, ` +
      `sem canal=${resumo.sem_canal} — ${detalhes.map((d) => `${d.tipo}:${d.email}`).join(', ') || 'ninguém'}`
    );

    return Response.json({ success: true, ...resumo, detalhes });
  } catch (error) {
    console.error('Erro em lembretesDiarios:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
