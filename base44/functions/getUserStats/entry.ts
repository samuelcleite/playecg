import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Buscar todas as tentativas do usuário ordenadas da mais antiga para a mais nova
    let allAttempts = [];
    let page = 0;
    const pageSize = 500;
    while (true) {
      const batch = await base44.asServiceRole.entities.QuizAttempt.filter(
        { user_email: user.email },
        "created_date", // mais antiga primeiro → Map.set só guarda a primeira tentativa real
        pageSize,
        page * pageSize
      );
      allAttempts = allAttempts.concat(batch);
      if (batch.length < pageSize) break;
      page++;
    }

    const total = allAttempts.length;

    // Acurácia geral: apenas a primeira tentativa por caso (por tipo para não cruzar random/module)
    const firstAttemptPerCase = new Map();
    for (const attempt of allAttempts) {
      const key = `${attempt.quiz_type ?? 'unknown'}__${attempt.case_id}`;
      if (!firstAttemptPerCase.has(key)) {
        firstAttemptPerCase.set(key, attempt);
      }
    }
    const firstAttempts = [...firstAttemptPerCase.values()];
    const correctFirst = firstAttempts.filter(a => a.correct).length;
    const accuracy = firstAttempts.length > 0 ? Math.round((correctFirst / firstAttempts.length) * 100) : 0;

    // Acurácia somente de Módulos: primeira tentativa por caso, apenas quiz_type=module
    const moduleAttempts = allAttempts.filter(a => a.quiz_type === 'module');
    const firstModuleAttemptPerCase = new Map();
    for (const attempt of moduleAttempts) {
      if (!firstModuleAttemptPerCase.has(attempt.case_id)) {
        firstModuleAttemptPerCase.set(attempt.case_id, attempt);
      }
    }
    const firstModuleAttempts = [...firstModuleAttemptPerCase.values()];
    const correctModule = firstModuleAttempts.filter(a => a.correct).length;
    const moduleAccuracy = firstModuleAttempts.length > 0 ? Math.round((correctModule / firstModuleAttempts.length) * 100) : 0;

    // Calcular streak (dias em sequência) considerando timezone do Brasil
    const uniqueDates = [...new Set(
      allAttempts.map(a => {
        const d = new Date(a.created_date);
        return d.toISOString().split('T')[0];
      })
    )].sort().reverse();

    let streakDays = 0;
    if (uniqueDates.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      if (uniqueDates[0] === todayStr || uniqueDates[0] === yesterdayStr) {
        let currentDate = new Date(today);
        for (const dateStr of uniqueDates) {
          const practiceDate = new Date(dateStr + 'T00:00:00');
          const diffDays = Math.floor((currentDate - practiceDate) / (1000 * 60 * 60 * 24));
          if (diffDays === 0 || diffDays === 1) {
            streakDays++;
            currentDate = practiceDate;
          } else {
            break;
          }
        }
      }
    }

    return Response.json({
      total,
      correct: correctFirst,
      accuracy,
      moduleAccuracy,
      streakDays
    });
  } catch (error) {
    console.error('Erro em getUserStats:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});