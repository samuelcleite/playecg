import { base44 } from "@/api/base44Client";

/**
 * Carrega conquistas do usuário a partir do banco de dados (UserAchievement).
 * Combina com as definições de Achievement para montar a lista completa.
 */
export async function loadUserAchievements(user) {
  // Busca via backend (service role) para não depender do contexto de RLS do
  // frontend — ex.: modo "agindo como" do dashboard, onde {{user.email}} pode
  // não casar e os troféus apareceriam todos bloqueados.
  const res = await base44.functions.invoke("getUserAchievements", {});
  return res?.data?.achievements || [];
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