import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user_email, module_id, phase_id, case_id } = await req.json();

    if (!user_email || !module_id || !phase_id || !case_id) {
      return Response.json({ error: 'Parâmetros obrigatórios: user_email, module_id, phase_id, case_id' }, { status: 400 });
    }

    // Buscar registro existente de UserProgress para este usuário/fase
    const existing = await base44.asServiceRole.entities.UserProgress.filter({
      user_email,
      module_id,
      phase_id
    });

    let progressRecord = existing[0] || null;

    // Se não existe, buscar a fase para obter o completion_goal
    let completion_goal = progressRecord?.completion_goal || 0;

    if (!progressRecord) {
      const phases = await base44.asServiceRole.entities.Phase.filter({ id: phase_id });
      const phase = phases[0];
      completion_goal = phase?.total_cases || 0;
    }

    const now = new Date().toISOString();

    if (!progressRecord) {
      // Criar novo registro
      const completed_case_ids = [case_id];
      const completion_count = 1;
      const status = completion_count >= completion_goal && completion_goal > 0 ? 'completed' : 'incomplete';

      progressRecord = await base44.asServiceRole.entities.UserProgress.create({
        user_email,
        module_id,
        phase_id,
        completed_case_ids,
        completion_count,
        completion_goal,
        status,
        last_updated: now
      });
    } else {
      // Atualizar registro existente
      const currentIds = progressRecord.completed_case_ids || [];

      // Evitar duplicatas
      if (currentIds.includes(case_id)) {
        return Response.json({ progress: progressRecord, updated: false });
      }

      const completed_case_ids = [...currentIds, case_id];
      const completion_count = completed_case_ids.length;
      const status = completion_count >= completion_goal && completion_goal > 0 ? 'completed' : 'incomplete';

      progressRecord = await base44.asServiceRole.entities.UserProgress.update(progressRecord.id, {
        completed_case_ids,
        completion_count,
        status,
        last_updated: now
      });
    }

    return Response.json({ progress: progressRecord, updated: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});