import { base44 } from "@/api/base44Client";

/**
 * Carrega conquistas do usuário a partir do banco de dados (UserAchievement).
 * Combina com as definições de Achievement para montar a lista completa.
 */
export async function loadUserAchievements(user) {
  const [allAchievements, userAchievements] = await Promise.all([
    base44.entities.Achievement.filter({ active: true }, "order"),
    base44.entities.UserAchievement.filter({ user_email: user.email }),
  ]);

  const earnedIds = new Set(userAchievements.map(ua => ua.achievement_id));

  return allAchievements.map(achievement => ({
    ...achievement,
    earned: earnedIds.has(achievement.id),
    earned_at: userAchievements.find(ua => ua.achievement_id === achievement.id)?.earned_at || null,
  }));
}

/**
 * Dispara a verificação de novos troféus no backend.
 * Deve ser chamado após o usuário finalizar uma questão.
 * Retorna a lista de novos troféus conquistados (pode ser vazia).
 */
export async function triggerAchievementCheck() {
  try {
    const res = await base44.functions.invoke("checkNewAchievements", {});
    return res?.data?.new_achievements || [];
  } catch (_) {
    return [];
  }
}