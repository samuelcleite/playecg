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

    if (!case_id || !user_answer) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const attempt = await base44.asServiceRole.entities.QuizAttempt.create({
      user_email: user.email,
      case_id,
      module_id,
      phase_id,
      user_answer,
      correct,
      quiz_type: quiz_type || 'random',
      case_source,
      time_spent: time_spent || 0
    });

    return Response.json({ success: true, data: attempt });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});