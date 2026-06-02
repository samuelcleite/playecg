import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function checkAchievementSync(achievement, user, stats, streakDays, attempts, phases) {
  if (achievement.achievement_type === "intensity") {
    switch (achievement.requirement_type) {
      case "first_correct":
        return stats.correctAnswers >= 1;
      case "streak_days":
        return streakDays >= (achievement.requirement_value || 0);
      case "accuracy":
        return stats.accuracy >= (achievement.requirement_value || 0);
      case "level":
        return (user.level || 1) >= (achievement.requirement_value || 0);
      case "points":
        return (user.points || 0) >= (achievement.requirement_value || 0);
      case "completed_modules":
        return stats.completedModules >= (achievement.requirement_value || 0);
      case "total_attempts":
        return stats.totalAttempts >= (achievement.requirement_value || 0);
      default:
        return false;
    }
  }

  if (achievement.achievement_type === "specialization") {
    const moduleIds = achievement.module_ids || [];
    const phaseIds = achievement.phase_ids || [];

    if (moduleIds.length === 0 && phaseIds.length === 0) return false;

    const isPhaseCompleted = (phaseId) => {
      const phase = phases.find(p => p.id === phaseId);
      if (!phase) return false;

      const phaseAttempts = attempts.filter(a => a.phase_id === phaseId);
      const byCase = {};
      phaseAttempts.forEach(att => {
        if (!byCase[att.case_id]) byCase[att.case_id] = [];
        byCase[att.case_id].push(att);
      });

      let completed = 0;
      Object.values(byCase).forEach(caseAtts => {
        if (caseAtts.some(a => a.correct) || caseAtts.length >= 3) completed++;
      });

      return completed >= (phase.total_cases || 0) && (phase.total_cases || 0) > 0;
    };

    if (phaseIds.length > 0) {
      if (!phaseIds.every(isPhaseCompleted)) return false;
    }

    if (moduleIds.length > 0) {
      for (const moduleId of moduleIds) {
        const modulePhases = phases.filter(p => p.module_id === moduleId);
        if (!modulePhases.every(p => isPhaseCompleted(p.id))) return false;
      }
    }

    return true;
  }

  return false;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Buscar dados necessários em paralelo
    const [allAchievements, attempts, phases, existingUserAchievements] = await Promise.all([
      base44.entities.Achievement.filter({ active: true }),
      base44.entities.QuizAttempt.filter({ user_email: user.email, quiz_type: "module" }),
      base44.entities.Phase.list(),
      base44.entities.UserAchievement.filter({ user_email: user.email }),
    ]);

    // IDs de troféus já conquistados
    const alreadyEarnedIds = new Set(existingUserAchievements.map(ua => ua.achievement_id));

    // Calcular streak
    const allAttemptsDates = (await base44.entities.QuizAttempt.filter({ user_email: user.email }))
      .map(a => new Date(a.created_date).toISOString().split('T')[0]);
    const uniqueDates = [...new Set(allAttemptsDates)].sort().reverse();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    let streakDays = 0;
    if (uniqueDates.length > 0 && (uniqueDates[0] === todayStr || uniqueDates[0] === yesterdayStr)) {
      let cur = new Date(today);
      for (const d of uniqueDates) {
        const diff = Math.floor((cur - new Date(d + 'T00:00:00')) / 86400000);
        if (diff === 0 || diff === 1) { streakDays++; cur = new Date(d + 'T00:00:00'); } else break;
      }
    }

    // Calcular stats
    const allAttempts = await base44.entities.QuizAttempt.filter({ user_email: user.email });
    const correctCount = allAttempts.filter(a => a.correct).length;

    // Calcular fases completadas (para completedModules)
    const moduleAttempts = allAttempts.filter(a => a.quiz_type === "module");
    let completedPhasesCount = 0;
    for (const phase of phases) {
      const phaseAttempts = moduleAttempts.filter(a => a.phase_id === phase.id);
      const byCase = {};
      phaseAttempts.forEach(att => {
        if (!byCase[att.case_id]) byCase[att.case_id] = [];
        byCase[att.case_id].push(att);
      });
      let completedCases = 0;
      Object.values(byCase).forEach(ca => {
        if (ca.some(a => a.correct) || ca.length >= 3) completedCases++;
      });
      if (completedCases >= (phase.total_cases || 0) && (phase.total_cases || 0) > 0) completedPhasesCount++;
    }

    const stats = {
      totalAttempts: allAttempts.length,
      correctAnswers: correctCount,
      accuracy: allAttempts.length > 0 ? Math.round((correctCount / allAttempts.length) * 100) : 0,
      totalPoints: user.points || 0,
      completedModules: completedPhasesCount,
    };

    // Verificar quais troféus ainda não foram conquistados mas agora são elegíveis
    const newlyEarned = [];
    const now = new Date().toISOString();

    for (const achievement of allAchievements) {
      if (alreadyEarnedIds.has(achievement.id)) continue;

      const earned = checkAchievementSync(achievement, user, stats, streakDays, attempts, phases);
      if (earned) {
        await base44.entities.UserAchievement.create({
          user_email: user.email,
          achievement_id: achievement.id,
          earned_at: now,
        });
        newlyEarned.push({ id: achievement.id, name: achievement.name, icon: achievement.icon });
      }
    }

    return Response.json({ success: true, new_achievements: newlyEarned });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});