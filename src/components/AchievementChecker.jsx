import { base44 } from "@/api/base44Client";

/**
 * Verifica se um usuário desbloqueou uma conquista específica
 * @param {Object} achievement - Conquista da entidade Achievement
 * @param {Object} user - Dados do usuário
 * @param {Object} stats - Estatísticas do usuário (attempts, accuracy, etc)
 * @param {number} streakDays - Dias consecutivos praticando
 * @returns {boolean} - Se a conquista foi desbloqueada
 */
export function checkAchievement(achievement, user, stats, streakDays) {
  if (!achievement.active) return false;

  const reqValue = achievement.requirement_value || 0;

  switch (achievement.requirement_type) {
    case "first_correct":
      return stats.correctAnswers > 0;

    case "streak_days":
      return streakDays >= reqValue;

    case "accuracy":
      return stats.accuracy >= reqValue && stats.totalAttempts >= 10;

    case "level":
      return (user?.level || 1) >= reqValue;

    case "points":
      return (user?.points || 0) >= reqValue;

    case "completed_modules":
      return stats.completedModules >= reqValue;

    case "total_attempts":
      return stats.totalAttempts >= reqValue;

    case "custom":
      // Para requisitos personalizados, verificar badges do usuário
      return (user?.badges || []).includes(achievement.badge_id);

    default:
      return false;
  }
}

/**
 * Carrega todas as conquistas e verifica quais o usuário desbloqueou
 * @param {Object} user - Dados do usuário
 * @param {Object} stats - Estatísticas do usuário
 * @param {number} streakDays - Dias consecutivos praticando
 * @returns {Array} - Array de conquistas com propriedade 'earned'
 */
export async function loadUserAchievements(user, stats, streakDays) {
  const achievements = await base44.entities.Achievement.filter({ active: true }, "order");
  
  return achievements.map(achievement => ({
    ...achievement,
    earned: checkAchievement(achievement, user, stats, streakDays)
  }));
}