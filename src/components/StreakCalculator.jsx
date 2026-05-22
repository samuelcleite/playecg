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
    today.setHours(0, 0, 0, 0);
    const todayStr = toLocalDateStr(today);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = toLocalDateStr(yesterday);

    const lastPracticeDate = uniqueDates[0];

    // Se não praticou hoje nem ontem, streak é 0
    if (lastPracticeDate !== todayStr && lastPracticeDate !== yesterdayStr) {
      return 0;
    }

    // Contar dias consecutivos retrocedendo a partir do dia mais recente praticado
    let streak = 1;
    // Começa pelo dia mais recente (hoje ou ontem)
    let expectedDate = new Date(lastPracticeDate + 'T00:00:00');

    for (let i = 1; i < uniqueDates.length; i++) {
      const prevExpected = new Date(expectedDate);
      prevExpected.setDate(prevExpected.getDate() - 1);
      const prevExpectedStr = toLocalDateStr(prevExpected);

      if (uniqueDates[i] === prevExpectedStr) {
        streak++;
        expectedDate = prevExpected;
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