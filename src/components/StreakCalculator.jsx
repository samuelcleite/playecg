import { base44 } from "@/api/base44Client";

/**
 * Calcula a sequência de dias consecutivos de prática do usuário
 * baseado nas tentativas de quiz (QuizAttempt)
 */
export async function calculateStreakDays(userEmail) {
  try {
    const attempts = await base44.entities.QuizAttempt.filter(
      { user_email: userEmail },
      "-created_date"
    );

    if (attempts.length === 0) {
      return 0;
    }

    // Formata data no fuso local (evita bug UTC vs. fuso local)
    const toLocalDateStr = (date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    // Extrair datas únicas (apenas a parte da data, sem hora, no fuso local)
    const uniqueDates = [...new Set(
      attempts.map(attempt => toLocalDateStr(new Date(attempt.created_date)))
    )].sort().reverse(); // Ordenar do mais recente para o mais antigo

    if (uniqueDates.length === 0) {
      return 0;
    }

    // Verificar se praticou hoje ou ontem
    const today = new Date();
    const todayStr = toLocalDateStr(today);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = toLocalDateStr(yesterday);

    const lastPracticeDate = uniqueDates[0];

    // Se não praticou hoje nem ontem, streak é 0
    if (lastPracticeDate !== todayStr && lastPracticeDate !== yesterdayStr) {
      return 0;
    }

    // Contar dias consecutivos
    let streak = 0;
    let currentDate = new Date(today);
    currentDate.setHours(0, 0, 0, 0);
    
    for (const dateStr of uniqueDates) {
      const practiceDate = new Date(dateStr + 'T00:00:00');
      const diffDays = Math.floor((currentDate - practiceDate) / (1000 * 60 * 60 * 24));

      if (diffDays === 0 || diffDays === 1) {
        streak++;
        currentDate = practiceDate;
      } else {
        break;
      }
    }

    return streak;
  } catch (error) {
    console.error('Error calculating streak:', error);
    return 0;
  }
}

/**
 * Obtém a última data de prática do usuário
 */
export async function getLastPracticeDate(userEmail) {
  try {
    const attempts = await base44.entities.QuizAttempt.filter(
      { user_email: userEmail },
      "-created_date",
      1
    );

    if (attempts.length === 0) {
      return null;
    }

    return new Date(attempts[0].created_date);
  } catch (error) {
    console.error('Error getting last practice date:', error);
    return null;
  }
}