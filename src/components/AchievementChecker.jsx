import { base44 } from "@/api/base44Client";

/**
 * Verifica se uma conquista específica foi desbloqueada pelo usuário
 */
export async function checkAchievement(achievement, user, stats, streakDays) {
  // Conquistas de Intensidade
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
      
      case "custom":
        // Conquistas personalizadas podem ter lógica específica
        return false;
      
      default:
        return false;
    }
  }
  
  // Conquistas de Especialização
  if (achievement.achievement_type === "specialization") {
    if (!achievement.module_id) return false;
    
    // Se tem phase_id específica, verifica se aquela fase foi completada
    if (achievement.phase_id) {
      const phaseProgress = await base44.entities.UserProgress.filter({
        user_email: user.email,
        module_id: achievement.module_id,
        phase_id: achievement.phase_id
      });
      
      return phaseProgress.length > 0 && phaseProgress[0].completed === true;
    }
    
    // Se não tem phase_id, verifica se o módulo inteiro foi completado
    const moduleProgress = await base44.entities.UserProgress.filter({
      user_email: user.email,
      module_id: achievement.module_id
    });
    
    return moduleProgress.length > 0 && moduleProgress[0].completed === true;
  }
  
  return false;
}

/**
 * Carrega todas as conquistas e verifica quais o usuário já desbloqueou
 */
export async function loadUserAchievements(user, stats, streakDays) {
  const allAchievements = await base44.entities.Achievement.filter({ active: true }, "order");
  
  const achievementsWithStatus = await Promise.all(
    allAchievements.map(async (achievement) => {
      const earned = await checkAchievement(achievement, user, stats, streakDays);
      return {
        ...achievement,
        earned
      };
    })
  );
  
  return achievementsWithStatus;
}