import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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

// Calcula os campos agregados varrendo TODAS as QuizAttempt.
// Não é mais usado no caminho normal — ver nota no handler.
async function computeStatsFromAttempts(base44, email) {
  let allAttempts = [];
  let page = 0;
  const pageSize = 500;
  while (true) {
    const batch = await base44.asServiceRole.entities.QuizAttempt.filter(
      { user_email: email },
      "created_date",
      pageSize,
      page * pageSize
    );
    allAttempts = allAttempts.concat(batch);
    if (batch.length < pageSize) break;
    page++;
  }

  const total_attempts = allAttempts.length;

  const firstAttemptPerCase = new Map();
  for (const attempt of allAttempts) {
    const key = `${attempt.quiz_type ?? 'unknown'}__${attempt.case_id}`;
    if (!firstAttemptPerCase.has(key)) firstAttemptPerCase.set(key, attempt);
  }
  const firstAttempts = [...firstAttemptPerCase.values()];
  const total_first_attempts = firstAttempts.length;
  const correct_first_attempts = firstAttempts.filter(a => a.correct).length;

  const moduleAttempts = allAttempts.filter(a => a.quiz_type === 'module');
  const firstModuleAttemptPerCase = new Map();
  for (const attempt of moduleAttempts) {
    if (!firstModuleAttemptPerCase.has(attempt.case_id)) firstModuleAttemptPerCase.set(attempt.case_id, attempt);
  }
  const firstModuleAttempts = [...firstModuleAttemptPerCase.values()];
  const module_first_attempts = firstModuleAttempts.length;
  const module_correct_first_attempts = firstModuleAttempts.filter(a => a.correct).length;

  // Streak
  const uniqueDates = [...new Set(allAttempts.map(a => getBrasiliaDateStr(new Date(a.created_date))))].sort().reverse();
  let current_streak = 0;
  let last_practice_date = uniqueDates[0] || '';
  if (uniqueDates.length > 0) {
    const now = new Date();
    const todayStr = getBrasiliaDateStr(now);
    const yesterdayStr = getBrasiliaDateStr(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    if (uniqueDates[0] === todayStr || uniqueDates[0] === yesterdayStr) {
      let prev = null;
      for (const dateStr of uniqueDates) {
        if (prev === null) {
          current_streak = 1;
        } else {
          const diffDays = Math.round((new Date(prev + 'T00:00:00') - new Date(dateStr + 'T00:00:00')) / (1000 * 60 * 60 * 24));
          if (diffDays === 1) current_streak++;
          else break;
        }
        prev = dateStr;
      }
    }
  }

  return {
    total_attempts,
    total_first_attempts,
    correct_first_attempts,
    module_first_attempts,
    module_correct_first_attempts,
    current_streak,
    last_practice_date
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);

    if (!identity) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const email = (identity.email || '').trim().toLowerCase();
    const contas = await base44.asServiceRole.entities.Account.filter({ email });
    const account = contas && contas.length > 0 ? contas[0] : null;

    if (!account) {
      return Response.json(
        { error: 'Conta não encontrada', code: 'account_not_found' },
        { status: 404 }
      );
    }

    // O BACKFILL PREGUIÇOSO FOI REMOVIDO, de propósito.
    //
    // A condição era `total_first_attempts === undefined || === null`, e na
    // Account ela NUNCA seria verdadeira: o Base44 materializa os `default` do
    // schema na criação, então toda Account nasce com 0 gravado, não ausente.
    // Mantido, o bloco viraria decoração — e pior, esconderia o problema: um
    // usuário com agregados zerados por engano veria zeros para sempre, com
    // cara de dado legítimo, sem nunca disparar o recálculo.
    //
    // A recuperação agora é explícita: backfillAccountFromUser recalcula tudo a
    // partir da QuizAttempt, que é a fonte de verdade.
    const stats = {
      total_attempts: account.total_attempts || 0,
      total_first_attempts: account.total_first_attempts || 0,
      correct_first_attempts: account.correct_first_attempts || 0,
      module_first_attempts: account.module_first_attempts || 0,
      module_correct_first_attempts: account.module_correct_first_attempts || 0,
      current_streak: account.current_streak || 0,
      last_practice_date: account.last_practice_date || ''
    };

    const accuracy = stats.total_first_attempts > 0
      ? Math.round((stats.correct_first_attempts / stats.total_first_attempts) * 100)
      : 0;
    const moduleAccuracy = stats.module_first_attempts > 0
      ? Math.round((stats.module_correct_first_attempts / stats.module_first_attempts) * 100)
      : 0;

    const now = new Date();
    const todayStr = getBrasiliaDateStr(now);
    const yesterdayStr = getBrasiliaDateStr(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    const streakDays = (stats.last_practice_date === todayStr || stats.last_practice_date === yesterdayStr)
      ? stats.current_streak
      : 0;

    return Response.json({
      total: stats.total_attempts,
      correct: stats.correct_first_attempts,
      accuracy,
      moduleAccuracy,
      streakDays
    });
  } catch (error) {
    console.error('Erro em getUserStats:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});