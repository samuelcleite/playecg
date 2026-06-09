import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Permitir que admins consultem o progresso de um usuário específico
    // (ex: modo "agindo como"). Usuários comuns só veem o próprio progresso.
    let targetEmail = user.email;
    try {
      const body = await req.json();
      if (body?.user_email && user.role === 'admin') {
        targetEmail = body.user_email;
      }
    } catch (_e) {
      // sem body — usar o próprio email
    }

    const userProgress = await base44.asServiceRole.entities.UserProgress.filter(
      { user_email: targetEmail },
      null,
      500
    );

    return Response.json({
      success: true,
      count: userProgress.length,
      data: userProgress
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});