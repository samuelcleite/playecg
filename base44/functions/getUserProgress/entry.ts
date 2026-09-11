import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { resolveIdentity } from '../../shared/auth.ts';

// getUserProgress — o progresso por fase do usuário autenticado.
// -----------------------------------------------------------------------------
// Usa o resolveIdentity compartilhado (shared/auth.ts), que NÃO lê a Account:
// a cópia local que vivia aqui buscava a Account só para devolvê-la em
// `record`, campo que esta function nunca usou. Era uma leitura de entidade a
// mais por chamada — e esta function roda em toda visita a Dashboard, Módulos e
// a cada abertura de fase, contando na cota de volume de leituras do Base44.
//
// O dono vem de identity.email, nunca do corpo (exceto admin, abaixo).

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);

    if (!identity) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Permitir que admins consultem o progresso de um usuário específico
    // (ex: modo "agindo como"). Usuários comuns só veem o próprio progresso.
    let targetEmail = identity.email;
    try {
      const body = await req.json();
      if (body?.user_email && identity.role === 'admin') {
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
