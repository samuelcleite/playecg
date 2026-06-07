import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { case_id, module_id, phase_id, user_answer, correct, quiz_type, case_source, time_spent } = body;

    // Create attempt using user-scoped client (RLS requires user_email to match)
    const attempt = await base44.entities.QuizAttempt.create({
      user_email: user.email,
      case_id: case_id || '',
      module_id: module_id || '',
      phase_id: phase_id || '',
      user_answer: user_answer || '',
      correct: correct === true,
      quiz_type: quiz_type || 'random',
      case_source: case_source || 'current_phase',
      time_spent: time_spent || 0
    });

    return Response.json({ success: true, data: attempt });
  } catch (error) {
    console.error('Error in recordQuizAttempt:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});