import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// recordQuizAttempt — CORTE: passa a escrever os agregados na Account.
// -----------------------------------------------------------------------------
// Duas mudanças, e a segunda é fácil de passar batido:
//
// 1) Os agregados vão para a Account, que é o registro único do usuário.
//
// 2) A QuizAttempt passa a ser criada com SERVICE ROLE. Antes era criada pelo
//    cliente user-scoped, e o comentário original dizia por quê: o RLS da
//    entidade exige que user_email bata com {{user.email}} da sessão. Sob JWT
//    não existe sessão Base44, {{user.email}} resolve nulo e esse create
//    FALHARIA — o usuário responderia o quiz e a tentativa não seria gravada.
//
//    Com service role, o RLS deixa de nos proteger e a única barreira passa a
//    ser gravar user_email a partir de identity.email, NUNCA do corpo. É o que
//    fazemos aqui, e é a regra que vale para todas as functions per-user daqui
//    em diante.
// -----------------------------------------------------------------------------

// ===== REGRA DE PONTUAÇÃO =====================================================
// Definida aqui e ESPELHADA em backfillAccountFromUser e ensureMyAccount, que
// recalculam pontos a partir do histórico de QuizAttempt.
//
// Os dois caminhos precisam produzir o mesmo número. Se divergirem, cada vez que
// o recálculo rodar os pontos de todo mundo mudam sozinhos — foi exatamente esse
// tipo de divergência (ordenação das tentativas) que inflou as taxas de acerto
// no primeiro dry-run do backfill. Ao mexer nestes valores, mexer nos três.
//
// A escolha: acertar de primeira vale mais do que acertar revisando. Revisão
// ainda pontua, senão a única forma de ganhar ponto seria nunca errar — o que
// pune justamente quem está aprendendo. E erro nunca tira ponto: perder
// progresso por tentar é o desenho errado para um app de estudo.
const PONTOS_ACERTO_PRIMEIRA = 10;
const PONTOS_ACERTO_REVISAO = 3;
const PONTOS_POR_NIVEL = 100;

function nivelPara(pontos) {
  return 1 + Math.floor((pontos || 0) / PONTOS_POR_NIVEL);
}
// ==============================================================================

// Data YYYY-MM-DD no timezone do Brasil (America/Sao_Paulo)
function getBrasiliaDateStr(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

// ===== LIMITE DIÁRIO DO PLANO GRATUITO ========================================
//
// POR QUE A REGRA PASSOU A VIVER AQUI
//
// Ela existia só no Quiz.jsx: o app contava as questões do dia, decidia se
// ainda havia cota e, se não houvesse, não deixava responder. O servidor
// gravava o que chegasse, sem perguntar nada. Quem alterasse a resposta do
// getMyAccount no navegador — trocar 'free' por 'premium' basta — tinha acesso
// ilimitado, e nada do lado de cá notava.
//
// Agora o servidor decide. A tela continua contando para MOSTRAR o número, mas
// quem recusa é esta function, com os dados na mão.
//
// A REGRA, IGUAL À DA TELA (checkFreeLimit, em Quiz.jsx)
//
//   - conta CASOS DISTINTOS tentados hoje, não tentativas: errar três vezes o
//     mesmo caso consome uma cota, não três;
//   - 5 por dia; depois disso, libera 1 a cada hora cheia contada a partir do
//     momento em que o 5º caso foi feito;
//   - o dia é o de BRASÍLIA, o mesmo que a sequência (streak) já usa nesta
//     function. A tela foi alinhada a este fuso — antes ela cortava à
//     meia-noite LOCAL, o que daria dias diferentes de quem está fora do
//     Brasil e faria a tela prometer cota que o servidor recusaria.
//
// O QUE ELA NÃO BLOQUEIA
//
// Só o quiz aleatório (`quiz_type: 'random'`), que é exatamente onde a tela
// bloqueia hoje. O caso do dia ('daily') e os módulos ('module') continuam
// passando: módulo já é conteúdo premium por outra porta, e bloquear o caso do
// dia seria regra nova, não a mesma regra movida de lugar.
//
// A CONTAGEM, essa sim, olha todos os tipos — de novo porque é o que a tela
// faz: ela conta o dia inteiro do usuário, venha de onde vier.
const FREE_DAILY_LIMIT = 5;
const HORA_MS = 60 * 60 * 1000;

function avaliarLimiteDiario(tentativas, agora) {
  // Primeira tentativa de cada caso. A ordem importa: é a hora do 5º CASO que
  // inicia a contagem horária, não a da 5ª tentativa.
  const primeiraPorCaso = new Map();
  for (const t of tentativas) {
    const caso = t.case_id || '';
    // Tentativa sem caso não consome cota: cota é por caso. A tela conta esse
    // registro (ela usa o campo cru como chave), então neste ponto o servidor é
    // o mais permissivo dos dois — a direção segura, já que quem erra para o
    // lado de cá bloqueia quem tinha direito.
    if (!caso) continue;
    const quando = new Date(t.created_date);
    if (isNaN(quando.getTime())) continue;
    const atual = primeiraPorCaso.get(caso);
    if (!atual || quando < atual) primeiraPorCaso.set(caso, quando);
  }

  const casos = [...primeiraPorCaso.values()].sort((a, b) => a - b);
  const feitos = casos.length;
  const base = { feitos, limite: FREE_DAILY_LIMIT, quinta_em: null, proxima_em: null };

  if (feitos < FREE_DAILY_LIMIT) return { ...base, bloqueado: false };

  const quinta = casos[FREE_DAILY_LIMIT - 1];
  const horasCheias = Math.floor((agora.getTime() - quinta.getTime()) / HORA_MS);
  const extrasUsados = feitos - FREE_DAILY_LIMIT;

  if (extrasUsados < horasCheias) {
    return { ...base, bloqueado: false, quinta_em: quinta.toISOString() };
  }

  return {
    ...base,
    bloqueado: true,
    quinta_em: quinta.toISOString(),
    proxima_em: new Date(quinta.getTime() + (extrasUsados + 1) * HORA_MS).toISOString()
  };
}

// As tentativas de hoje (fuso de Brasília), sem baixar o histórico inteiro.
//
// Pagina em ordem decrescente e para no PISO — nenhum "hoje de Brasília"
// começa mais de 48h atrás, então passar disso é garantia de ter saído do dia.
// O piso só serve para parar de paginar; quem decide o que é hoje é a
// comparação de data no mesmo fuso, logo abaixo.
async function tentativasDoDia(base44, userEmail, agora) {
  const hoje = getBrasiliaDateStr(agora);
  const piso = new Date(agora.getTime() - 48 * HORA_MS);
  const porPagina = 100;
  const TETO = 1000;

  const doDia = [];
  let skip = 0;

  while (skip < TETO) {
    const pagina = await base44.asServiceRole.entities.QuizAttempt.filter(
      { user_email: userEmail },
      '-created_date',
      porPagina,
      skip
    );
    if (!pagina || pagina.length === 0) break;

    let saiuDoDia = false;
    for (const t of pagina) {
      const quando = new Date(t.created_date);
      if (isNaN(quando.getTime())) continue;
      if (quando < piso) { saiuDoDia = true; break; }
      if (getBrasiliaDateStr(quando) === hoje) doDia.push(t);
    }

    if (saiuDoDia || pagina.length < porPagina) break;
    skip += porPagina;
  }

  return doDia;
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

    if (!identity) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userEmail = (identity.email || '').trim().toLowerCase();

    const contas = await base44.asServiceRole.entities.Account.filter({ email: userEmail });
    const account = contas && contas.length > 0 ? contas[0] : null;
    if (!account) {
      return Response.json(
        { error: 'Conta não encontrada', code: 'account_not_found' },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { case_id, module_id, phase_id, user_answer, correct, quiz_type, case_source, time_spent } = body;

    const normalizedQuizType = quiz_type || 'random';
    const isCorrect = correct === true;
    const agora = new Date();

    // ── LIMITE DIÁRIO DO GRATUITO ────────────────────────────────────────────
    // Ver o bloco de regra acima. A leitura só acontece para quem é gratuito:
    // o premium sai daqui sem nenhuma ida a mais ao banco, porque a Account que
    // responde "é premium?" já foi carregada acima.
    let doDia = null;
    let limiteDiario = null;

    if (account.subscription_type !== 'premium') {
      doDia = await tentativasDoDia(base44, userEmail, agora);
      const limiteAntes = avaliarLimiteDiario(doDia, agora);

      // Repetir um caso que JÁ contou hoje não consome cota nova — a contagem é
      // por caso distinto. Recusar a repetição seria mais rígido que a tela, e
      // deixaria alguém preso no meio de um caso que ele já tinha direito de
      // responder.
      const jaContouHoje = doDia.some(t => (t.case_id || '') === (case_id || ''));

      if (normalizedQuizType === 'random' && limiteAntes.bloqueado && !jaContouHoje) {
        console.log('🚫 Limite diário do gratuito:', userEmail, `(${limiteAntes.feitos} casos hoje)`);
        return Response.json(
          {
            success: false,
            code: 'limite_diario',
            error: 'Limite diário do plano gratuito atingido.',
            limite_diario: limiteAntes
          },
          { status: 403 }
        );
      }
    }

    // Verificar se já existia tentativa anterior para este caso (antes de criar a nova)
    const previous = await base44.asServiceRole.entities.QuizAttempt.filter(
      { user_email: userEmail, quiz_type: normalizedQuizType, case_id: case_id || '' },
      "created_date",
      1
    );
    const isFirstForCase = previous.length === 0;

    // Service role: ver nota no topo. user_email vem de identity, nunca do corpo.
    const attempt = await base44.asServiceRole.entities.QuizAttempt.create({
      user_email: userEmail,
      case_id: case_id || '',
      module_id: module_id || '',
      phase_id: phase_id || '',
      user_answer: user_answer || '',
      correct: isCorrect,
      quiz_type: normalizedQuizType,
      case_source: case_source || 'current_phase',
      time_spent: time_spent || 0
    });

    // O estado do limite DEPOIS desta tentativa, para a tela não precisar de
    // uma segunda ida ao servidor só para recontar. A conta é feita sobre a
    // lista que já está em memória, somada à tentativa recém-criada — nenhuma
    // leitura nova.
    if (doDia) {
      limiteDiario = avaliarLimiteDiario(
        [...doDia, { case_id: case_id || '', created_date: agora.toISOString() }],
        agora
      );
    }

    // Atualizar stats pré-agregados na Account (update parcial)
    const now = agora;
    const todayStr = getBrasiliaDateStr(now);
    const yesterdayStr = getBrasiliaDateStr(new Date(now.getTime() - 24 * 60 * 60 * 1000));

    const updates = {
      total_attempts: (account.total_attempts || 0) + 1
    };

    if (isFirstForCase) {
      updates.total_first_attempts = (account.total_first_attempts || 0) + 1;
      if (isCorrect) {
        updates.correct_first_attempts = (account.correct_first_attempts || 0) + 1;
      }
      if (normalizedQuizType === 'module') {
        updates.module_first_attempts = (account.module_first_attempts || 0) + 1;
        if (isCorrect) {
          updates.module_correct_first_attempts = (account.module_correct_first_attempts || 0) + 1;
        }
      }
    }

    // Pontos. Só acerto pontua; o nível é sempre derivado, nunca somado à parte,
    // para não existir estado em que pontos e nível discordem.
    let pontosGanhos = 0;
    if (isCorrect) {
      pontosGanhos = isFirstForCase ? PONTOS_ACERTO_PRIMEIRA : PONTOS_ACERTO_REVISAO;
      updates.points = (account.points || 0) + pontosGanhos;
      updates.level = nivelPara(updates.points);
    }

    // Casos já tentados — espelho da QuizAttempt para o Quiz aleatório.
    //
    // A tela de Quiz precisava saber quais casos a pessoa já tinha tentado para
    // não repeti-los, e descobria isso baixando o histórico INTEIRO de
    // tentativas a cada carregamento — para quem pratica muito, a leitura mais
    // cara do app, e uma das que estouravam o limite de volume (os 500 do
    // getMyAccount). A lista mantém a mesma semântica de antes: um caso entra
    // quando uma tentativa DELE é gravada (acertou ou esgotou as 3), de
    // qualquer quiz_type — e só na primeira vez.
    const jaTentados = Array.isArray(account.attempted_case_ids) ? account.attempted_case_ids : [];
    if (case_id && !jaTentados.includes(case_id)) {
      updates.attempted_case_ids = [...jaTentados, case_id];
    }

    // Streak
    if (account.last_practice_date === todayStr) {
      // mantém current_streak
    } else if (account.last_practice_date === yesterdayStr) {
      updates.current_streak = (account.current_streak || 0) + 1;
    } else {
      updates.current_streak = 1;
    }
    updates.last_practice_date = todayStr;

    await base44.asServiceRole.entities.Account.update(account.id, updates);

    // `limite_diario` é null para quem é premium — a tela já não pergunta nada
    // nesse caso. Para o gratuito ele substitui a chamada extra ao
    // getMyQuizAttempts que a tela fazia a cada resposta só para recontar.
    //
    // `pontos_ganhos` e `sequencia` alimentam a tela de resultado (XP ganho e
    // dias de ofensiva). Saem daqui porque é aqui que os dois são decididos: a
    // tela não tem como saber se esta foi a primeira tentativa no caso, que é o
    // que separa 10 pontos de 3. `sequencia` é o mesmo current_streak que o
    // getUserStats devolve como streakDays, então o número bate com o Dashboard.
    return Response.json({
      success: true,
      data: attempt,
      limite_diario: limiteDiario,
      pontos_ganhos: pontosGanhos,
      sequencia: updates.current_streak ?? account.current_streak ?? 0
    });
  } catch (error) {
    console.error('Error in recordQuizAttempt:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});