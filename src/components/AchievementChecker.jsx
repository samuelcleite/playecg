import { base44 } from "@/api/base44Client";

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

      return completed >= (phase.total_cases || 0);
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

/**
 * Carrega todas as conquistas e verifica quais o usuário já desbloqueou.
 * Faz apenas 3 chamadas à API independente do número de achievements.
 */
export async function loadUserAchievements(user, stats, streakDays) {
  const [allAchievements, attempts, phases] = await Promise.all([
    base44.entities.Achievement.filter({ active: true }, "order"),
    base44.entities.QuizAttempt.filter({ user_email: user.email, quiz_type: "module" }),
    base44.entities.Phase.list(),
  ]);

  return allAchievements.map(achievement => ({
    ...achievement,
    earned: checkAchievementSync(achievement, user, stats, streakDays, attempts, phases),
  }));
}