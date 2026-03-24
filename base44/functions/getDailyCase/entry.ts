import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Obter data de hoje (YYYY-MM-DD)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayDate = today.toISOString().split('T')[0];

    // Buscar DailyCase para hoje
    const dailyCases = await base44.entities.DailyCase.filter({
      date: todayDate,
      active: true
    });

    if (dailyCases.length === 0) {
      return Response.json({
        success: false,
        message: 'Nenhum caso do dia disponível para hoje'
      });
    }

    const dailyCase = dailyCases[0];

    // Buscar o ECGCase associado
    const ecgCases = await base44.entities.ECGCase.filter({
      id: dailyCase.ecg_case_id
    });

    if (ecgCases.length === 0) {
      return Response.json({
        success: false,
        message: 'Caso de ECG não encontrado'
      });
    }

    const ecgCase = ecgCases[0];

    // Verificar se o usuário já respondeu esse caso hoje
    const attempts = await base44.entities.QuizAttempt.filter({
      user_email: user.email,
      case_id: dailyCase.ecg_case_id
    });

    // Filtrar tentativas de hoje
    const todayAttempts = attempts.filter(attempt => {
      const attemptDate = new Date(attempt.created_date);
      attemptDate.setHours(0, 0, 0, 0);
      return attemptDate.toISOString().split('T')[0] === todayDate;
    });

    const alreadyAnswered = todayAttempts.length > 0;
    const userAttempt = alreadyAnswered ? todayAttempts[0] : null;

    return Response.json({
      success: true,
      daily_case: dailyCase,
      ecg_case: ecgCase,
      already_answered: alreadyAnswered,
      user_attempt: userAttempt
    });

  } catch (error) {
    console.error('Error in getDailyCase:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});