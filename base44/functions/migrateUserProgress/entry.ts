import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Função de migração — rodar UMA ÚNICA VEZ para popular UserProgress com dados históricos.
// Requer autenticação de admin.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // 1. Buscar todas as tentativas existentes (paginar de 500 em 500)
    let allAttempts = [];
    let skip = 0;
    const batchSize = 500;

    while (true) {
      const batch = await base44.asServiceRole.entities.QuizAttempt.list(null, batchSize, skip);
      if (!batch || batch.length === 0) break;
      allAttempts = allAttempts.concat(batch);
      if (batch.length < batchSize) break;
      skip += batchSize;
    }

    // 2. Buscar todas as fases para obter completion_goal (total_cases)
    const allPhases = await base44.asServiceRole.entities.Phase.list();
    const phaseMap = {};
    for (const phase of allPhases) {
      phaseMap[phase.id] = phase;
    }

    // 3. Agrupar tentativas por user_email + module_id + phase_id
    // Regra de conclusão de caso: acertou pelo menos 1 vez OU tentou 3+ vezes
    const groups = {}; // key: "email|module_id|phase_id"

    for (const attempt of allAttempts) {
      const { user_email, module_id, phase_id, case_id, correct } = attempt;

      // Ignorar tentativas sem fase/módulo
      if (!user_email || !module_id || !phase_id || !case_id) continue;

      const key = `${user_email}|${module_id}|${phase_id}`;
      if (!groups[key]) {
        groups[key] = {
          user_email,
          module_id,
          phase_id,
          cases: {} // case_id -> { attempts, correct }
        };
      }

      if (!groups[key].cases[case_id]) {
        groups[key].cases[case_id] = { attempts: 0, correct: false };
      }

      groups[key].cases[case_id].attempts += 1;
      if (correct) {
        groups[key].cases[case_id].correct = true;
      }
    }

    // 4. Para cada grupo, determinar casos concluídos
    const progressRecords = [];

    for (const key of Object.keys(groups)) {
      const group = groups[key];
      const { user_email, module_id, phase_id, cases } = group;

      const completed_case_ids = [];
      for (const [caseId, stats] of Object.entries(cases)) {
        // Concluído: acertou pelo menos uma vez OU tentou 3+ vezes
        if (stats.correct || stats.attempts >= 3) {
          completed_case_ids.push(caseId);
        }
      }

      const completion_count = completed_case_ids.length;
      const phase = phaseMap[phase_id];
      const completion_goal = phase?.total_cases || 0;
      const status = completion_count >= completion_goal && completion_goal > 0 ? 'completed' : 'incomplete';

      progressRecords.push({
        user_email,
        module_id,
        phase_id,
        completed_case_ids,
        completion_count,
        completion_goal,
        status,
        last_updated: new Date().toISOString()
      });
    }

    // 5. Verificar se já existem registros para evitar duplicação
    const existingProgress = await base44.asServiceRole.entities.UserProgress.list();
    if (existingProgress && existingProgress.length > 0) {
      return Response.json({
        error: 'Migração abortada: já existem registros em UserProgress. Delete-os antes de rodar novamente.',
        existing_count: existingProgress.length
      }, { status: 409 });
    }

    // 6. Inserir em lotes de 100
    let created = 0;
    const insertBatchSize = 100;

    for (let i = 0; i < progressRecords.length; i += insertBatchSize) {
      const chunk = progressRecords.slice(i, i + insertBatchSize);
      await base44.asServiceRole.entities.UserProgress.bulkCreate(chunk);
      created += chunk.length;
    }

    return Response.json({
      success: true,
      total_attempts_processed: allAttempts.length,
      total_groups: Object.keys(groups).length,
      total_progress_records_created: created
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});