import { base44 } from "@/api/base44Client";

/**
 * Carrega conquistas do usuário a partir do banco de dados (UserAchievement).
 * Combina com as definições de Achievement para montar a lista completa.
 */
export async function loadUserAchievements(user) {
  // Busca via backend (service role) para não depender do contexto de RLS do
  // frontend — ex.: modo "agindo como" do dashboard, onde {{user.email}} pode
  // não casar e os troféus apareceriam todos bloqueados.
  const invoke = () => base44.functions.invoke("getUserAchievements", {});
  try {
    const res = await invoke();
    return res?.data?.achievements || [];
  } catch (err) {
    // Um 500 transitório aqui (estouro de leitura, redeploy da função) derrubava
    // a tela inteira: sem catch, o Promise.all do Achievements.jsx rejeitava e o
    // spinner ficava rodando para sempre. Uma única retentativa resolve os casos
    // momentâneos; se falhar de novo, o erro sobe como antes.
    console.error("getUserAchievements (tentativa 1):", err);
    await new Promise((r) => setTimeout(r, 800));
    const res = await invoke();
    return res?.data?.achievements || [];
  }
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