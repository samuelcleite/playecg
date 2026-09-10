import { getCurrentUser } from '@/lib/currentUser';

// Data YYYY-MM-DD no fuso de Brasília — o mesmo do recordQuizAttempt, que é quem
// mantém last_practice_date e current_streak na conta. Qualquer fuso diferente
// aqui faria a conta julgar "vencida" uma sequência que o servidor considera
// viva (ou o contrário).
const diaBrasilia = (d) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d);

/**
 * Calcula a sequência de dias consecutivos de prática do usuário.
 *
 * Antes baixava TODO o histórico de tentativas (getMyQuizAttempts sem limite) a
 * cada chamada — para quem pratica muito, centenas de leituras em toda tela que
 * mostra a sequência — só para recalcular o que o recordQuizAttempt já mantém
 * pronto na Account: current_streak e last_practice_date. Era uma das leituras
 * que estouravam o limite de volume do Base44 (os 500 do getMyAccount).
 *
 * A conta vem do cache do carregamento (getCurrentUser): nenhuma ida extra ao
 * banco. `userEmail` é ignorado de propósito — o dono vem da identidade no
 * servidor; manter o parâmetro evita mexer nos chamadores.
 */
export async function calculateStreakDays(userEmail) {
  try {
    const account = await getCurrentUser();
    if (!account?.last_practice_date) return 0;

    const hoje = diaBrasilia(new Date());
    const ontem = diaBrasilia(new Date(Date.now() - 24 * 60 * 60 * 1000));

    // Só é sequência vigente se a última prática foi hoje ou ontem. Depois
    // disso o número guardado pertence a uma sequência quebrada — mostrar 0,
    // exatamente como o cálculo antigo fazia ao não achar hoje/ontem no
    // histórico.
    if (account.last_practice_date === hoje || account.last_practice_date === ontem) {
      return account.current_streak || 0;
    }
    return 0;
  } catch (error) {
    console.error('Error calculating streak:', error);
    return 0;
  }
}

/**
 * Última data de prática do usuário (meia-noite do dia registrado), direto da
 * Account — sem ler tentativas.
 */
export async function getLastPracticeDate(userEmail) {
  try {
    const account = await getCurrentUser();
    if (!account?.last_practice_date) return null;
    return new Date(account.last_practice_date + 'T00:00:00');
  } catch (error) {
    console.error('Error getting last practice date:', error);
    return null;
  }
}