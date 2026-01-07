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
    const moduleIds = achievement.module_ids || [];
    const phaseIds = achievement.phase_ids || [];
    
    // Se não tem requisitos, não pode ser conquistada
    if (moduleIds.length === 0 && phaseIds.length === 0) {
      return false;
    }
    
    // Buscar todas as tentativas do usuário de módulos
    const attempts = await base44.entities.QuizAttempt.filter({
      user_email: user.email,
      quiz_type: "module"
    });
    
    // Verificar se todas as fases especificadas foram completadas
    if (phaseIds.length > 0) {
      for (const phaseId of phaseIds) {
        const phase = await base44.entities.Phase.list();
        const currentPhase = phase.find(p => p.id === phaseId);
        if (!currentPhase) return false;
        
        const phaseAttempts = attempts.filter(a => a.phase_id === phaseId);
        const attemptsByCase = {};
        
        phaseAttempts.forEach(att => {
          if (!attemptsByCase[att.case_id]) {
            attemptsByCase[att.case_id] = [];
          }
          attemptsByCase[att.case_id].push(att);
        });
        
        let completedCases = 0;
        Object.keys(attemptsByCase).forEach(caseId => {
          const caseAttempts = attemptsByCase[caseId];
          const hasCorrect = caseAttempts.some(a => a.correct);
          const hasThreeAttempts = caseAttempts.length >= 3;
          
          if (hasCorrect || hasThreeAttempts) {
            completedCases++;
          }
        });
        
        if (completedCases < (currentPhase.total_cases || 0)) {
          return false;
        }
      }
    }
    
    // Verificar se todos os módulos especificados foram completados
    if (moduleIds.length > 0) {
      const phases = await base44.entities.Phase.list();
      
      for (const moduleId of moduleIds) {
        const modulePhasesAll = phases.filter(p => p.module_id === moduleId);
        
        for (const phase of modulePhasesAll) {
          const phaseAttempts = attempts.filter(a => a.phase_id === phase.id);
          const attemptsByCase = {};
          
          phaseAttempts.forEach(att => {
            if (!attemptsByCase[att.case_id]) {
              attemptsByCase[att.case_id] = [];
            }
            attemptsByCase[att.case_id].push(att);
          });
          
          let completedCases = 0;
          Object.keys(attemptsByCase).forEach(caseId => {
            const caseAttempts = attemptsByCase[caseId];
            const hasCorrect = caseAttempts.some(a => a.correct);
            const hasThreeAttempts = caseAttempts.length >= 3;
            
            if (hasCorrect || hasThreeAttempts) {
              completedCases++;
            }
          });
          
          if (completedCases < (phase.total_cases || 0)) {
            return false;
          }
        }
      }
    }
    
    // Se chegou aqui, todos os requisitos foram cumpridos
    return true;
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