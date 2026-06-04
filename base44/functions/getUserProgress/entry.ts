import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userProgress = await base44.entities.UserProgress.filter(
      { user_email: user.email },
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