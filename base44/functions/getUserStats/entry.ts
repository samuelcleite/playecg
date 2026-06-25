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

// Calcula os campos agregados varrendo TODAS as QuizAttempt (usado no backfill preguiçoso)
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
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let stats;

    // Backfill preguiçoso: usuário antigo ainda sem os campos agregados
    if (user.total_first_attempts === undefined || user.total_first_attempts === null) {
      stats = await computeStatsFromAttempts(base44, user.email);
      await base44.asServiceRole.entities.User.update(user.id, stats);
    } else {
      stats = {
        total_attempts: user.total_attempts || 0,
        total_first_attempts: user.total_first_attempts || 0,
        correct_first_attempts: user.correct_first_attempts || 0,
        module_first_attempts: user.module_first_attempts || 0,
        module_correct_first_attempts: user.module_correct_first_attempts || 0,
        current_streak: user.current_streak || 0,
        last_practice_date: user.last_practice_date || ''
      };
    }

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