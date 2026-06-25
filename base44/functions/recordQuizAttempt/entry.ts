import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Data YYYY-MM-DD no timezone do Brasil (America/Sao_Paulo)
function getBrasiliaDateStr(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { case_id, module_id, phase_id, user_answer, correct, quiz_type, case_source, time_spent } = body;

    const normalizedQuizType = quiz_type || 'random';
    const isCorrect = correct === true;

    // Verificar se já existia tentativa anterior para este caso (antes de criar a nova)
    const previous = await base44.asServiceRole.entities.QuizAttempt.filter(
      { user_email: user.email, quiz_type: normalizedQuizType, case_id: case_id || '' },
      "created_date",
      1
    );
    const isFirstForCase = previous.length === 0;

    // Create attempt using user-scoped client (RLS requires user_email to match)
    const attempt = await base44.entities.QuizAttempt.create({
      user_email: user.email,
      case_id: case_id || '',
      module_id: module_id || '',
      phase_id: phase_id || '',
      user_answer: user_answer || '',
      correct: isCorrect,
      quiz_type: normalizedQuizType,
      case_source: case_source || 'current_phase',
      time_spent: time_spent || 0
    });

    // Atualizar stats pré-agregados no User (update parcial)
    const now = new Date();
    const todayStr = getBrasiliaDateStr(now);
    const yesterdayStr = getBrasiliaDateStr(new Date(now.getTime() - 24 * 60 * 60 * 1000));

    const updates = {
      total_attempts: (user.total_attempts || 0) + 1
    };

    if (isFirstForCase) {
      updates.total_first_attempts = (user.total_first_attempts || 0) + 1;
      if (isCorrect) {
        updates.correct_first_attempts = (user.correct_first_attempts || 0) + 1;
      }
      if (normalizedQuizType === 'module') {
        updates.module_first_attempts = (user.module_first_attempts || 0) + 1;
        if (isCorrect) {
          updates.module_correct_first_attempts = (user.module_correct_first_attempts || 0) + 1;
        }
      }
    }

    // Streak
    if (user.last_practice_date === todayStr) {
      // mantém current_streak
    } else if (user.last_practice_date === yesterdayStr) {
      updates.current_streak = (user.current_streak || 0) + 1;
    } else {
      updates.current_streak = 1;
    }
    updates.last_practice_date = todayStr;

    await base44.asServiceRole.entities.User.update(user.id, updates);

    return Response.json({ success: true, data: attempt });
  } catch (error) {
    console.error('Error in recordQuizAttempt:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});