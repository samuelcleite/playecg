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

    // Atualizar stats pré-agregados na Account (update parcial)
    const now = new Date();
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
    if (isCorrect) {
      const ganho = isFirstForCase ? PONTOS_ACERTO_PRIMEIRA : PONTOS_ACERTO_REVISAO;
      updates.points = (account.points || 0) + ganho;
      updates.level = nivelPara(updates.points);
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

    return Response.json({ success: true, data: attempt });
  } catch (error) {
    console.error('Error in recordQuizAttempt:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
