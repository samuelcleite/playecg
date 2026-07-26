import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// migrateUserProgress (substituído por versão reconciliadora / upsert)
// -----------------------------------------------------------------------------
// Reconstrói o estado "correto" de UserProgress a partir de QuizAttempt e faz
// UPSERT: cria o que falta, atualiza o que está divergente, deixa intacto o que
// já está certo. Reexecutável quantas vezes quiser (idempotente).
//
// Regra de caso concluído (igual ao resto do app): acertou >= 1 vez OU tentou 3+.
// status = 'completed' quando completion_count >= completion_goal (e goal > 0).
//
// PARÂMETROS (no corpo do invoke):
//   apply         (boolean, default FALSE) -> false = só relatório (dry run);
//                                             true  = grava as mudanças.
//   deleteOrphans (boolean, default FALSE) -> remove registros de UserProgress
//                                             sem tentativas correspondentes e
//                                             duplicatas do mesmo (email|fase).
//
// Requer admin.
// -----------------------------------------------------------------------------

function b64urlToBytes(input) {
  let s = input.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function b64urlToStr(input) {
  let s = input.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return atob(s);
}

// Verifica um JWT HS256 assinado com a mesma JWT_SECRET e os mesmos parâmetros
// (crypto.subtle nativo, sem dependência externa) que googleSignIn/appleSignIn
// usam para assinar. Qualquer falha (base64 inválido, assinatura, exp) => null,
// para cair de volta no fluxo de sessão Base44 em vez de derrubar a função.
async function verifyJwtHS256(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const header = JSON.parse(b64urlToStr(headerB64));
    if (header.alg !== 'HS256') return null;
    const payload = JSON.parse(b64urlToStr(payloadB64));

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlToBytes(sigB64),
      new TextEncoder().encode(`${headerB64}.${payloadB64}`)
    );
    if (!valid) return null;

    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch (_e) {
    return null;
  }
}

// Aceita tanto o JWT próprio (googleSignIn/appleSignIn) quanto a sessão Base44.
// JWT NUNCA concede admin: role é sempre 'user' nesse caminho, por decisão de
// arquitetura — mesmo que o payload assinado carregue um campo role.
async function resolveIdentity(req, base44) {
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const secret = Deno.env.get('JWT_SECRET');
    if (secret) {
      const token = authHeader.slice('Bearer '.length).trim();
      const payload = await verifyJwtHS256(token, secret);
      if (payload && payload.email) {
        return { email: payload.email, role: 'user', source: 'jwt' };
      }
    }
  }

  const user = await base44.auth.me();
  if (user) {
    return { email: user.email, role: user.role, source: 'base44' };
  }

  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);

    if (!identity || identity.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    let apply = false;
    let deleteOrphans = false;
    try {
      const body = await req.json();
      apply = body?.apply === true;
      deleteOrphans = body?.deleteOrphans === true;
    } catch (_) {
      // sem corpo => dry run
    }

    const svc = base44.asServiceRole.entities;
    const keyOf = (email: string, moduleId: string, phaseId: string) =>
      `${email}|${moduleId}|${phaseId}`;

    // -------------------------------------------------------------------------
    // 1. Ler TODAS as tentativas (paginando)
    // -------------------------------------------------------------------------
    let allAttempts: any[] = [];
    let skip = 0;
    const batchSize = 500;
    while (true) {
      const batch = await svc.QuizAttempt.list(null, batchSize, skip);
      if (!batch || batch.length === 0) break;
      allAttempts = allAttempts.concat(batch);
      if (batch.length < batchSize) break;
      skip += batchSize;
    }

    // -------------------------------------------------------------------------
    // 2. Mapa de fases -> completion_goal (total_cases)
    // -------------------------------------------------------------------------
    const allPhases = await svc.Phase.list();
    const phaseMap: Record<string, any> = {};
    for (const phase of allPhases) phaseMap[phase.id] = phase;

    // -------------------------------------------------------------------------
    // 3. Estado DESEJADO a partir das tentativas
    // -------------------------------------------------------------------------
    const groups: Record<string, any> = {};
    for (const a of allAttempts) {
      const { user_email, module_id, phase_id, case_id, correct } = a;
      // Só conta tentativas de quiz de módulo (têm module_id + phase_id).
      if (!user_email || !module_id || !phase_id || !case_id) continue;

      const key = keyOf(user_email, module_id, phase_id);
      if (!groups[key]) {
        groups[key] = { user_email, module_id, phase_id, cases: {} };
      }
      if (!groups[key].cases[case_id]) {
        groups[key].cases[case_id] = { attempts: 0, correct: false };
      }
      groups[key].cases[case_id].attempts += 1;
      if (correct) groups[key].cases[case_id].correct = true;
    }

    const desired: Record<string, any> = {};
    for (const key of Object.keys(groups)) {
      const g = groups[key];
      const completed_case_ids: string[] = [];
      for (const [caseId, stats] of Object.entries<any>(g.cases)) {
        if (stats.correct || stats.attempts >= 3) completed_case_ids.push(caseId);
      }
      completed_case_ids.sort();
      const completion_count = completed_case_ids.length;
      const completion_goal = phaseMap[g.phase_id]?.total_cases || 0;
      const status =
        completion_count >= completion_goal && completion_goal > 0 ? 'completed' : 'incomplete';

      desired[key] = {
        user_email: g.user_email,
        module_id: g.module_id,
        phase_id: g.phase_id,
        completed_case_ids,
        completion_count,
        completion_goal,
        status,
      };
    }

    // -------------------------------------------------------------------------
    // 4. Estado ATUAL em UserProgress (paginando)
    // -------------------------------------------------------------------------
    let existing: any[] = [];
    skip = 0;
    while (true) {
      const batch = await svc.UserProgress.list(null, batchSize, skip);
      if (!batch || batch.length === 0) break;
      existing = existing.concat(batch);
      if (batch.length < batchSize) break;
      skip += batchSize;
    }

    const existingByKey: Record<string, any> = {};
    const duplicates: any[] = []; // registros extras para o mesmo (email|módulo|fase)
    for (const rec of existing) {
      const key = keyOf(rec.user_email, rec.module_id, rec.phase_id);
      if (!existingByKey[key]) existingByKey[key] = rec;
      else duplicates.push(rec); // mantém o primeiro como canônico
    }

    // -------------------------------------------------------------------------
    // 5. Diff
    // -------------------------------------------------------------------------
    const setsEqual = (a: string[] = [], b: string[] = []) => {
      if (a.length !== b.length) return false;
      const sa = new Set(a);
      for (const x of b) if (!sa.has(x)) return false;
      return true;
    };

    const toCreate: any[] = [];
    const toUpdate: { id: string; target: any; before: any; after: any }[] = [];
    let unchanged = 0;

    for (const key of Object.keys(desired)) {
      const want = desired[key];
      const have = existingByKey[key];

      if (!have) {
        toCreate.push({ ...want, last_updated: new Date().toISOString() });
        continue;
      }

      const diff =
        have.completion_count !== want.completion_count ||
        have.completion_goal !== want.completion_goal ||
        have.status !== want.status ||
        !setsEqual(have.completed_case_ids, want.completed_case_ids);

      if (diff) {
        toUpdate.push({
          id: have.id,
          target: want,
          before: {
            completion_count: have.completion_count,
            completion_goal: have.completion_goal,
            status: have.status,
            cases: (have.completed_case_ids || []).length,
          },
          after: {
            user_email: want.user_email,
            phase_id: want.phase_id,
            completion_count: want.completion_count,
            completion_goal: want.completion_goal,
            status: want.status,
            cases: want.completed_case_ids.length,
          },
        });
      } else {
        unchanged++;
      }
    }

    // Órfãos: existem em UserProgress mas não há tentativas correspondentes.
    const orphans = existing.filter(
      (rec) => !desired[keyOf(rec.user_email, rec.module_id, rec.phase_id)],
    );

    // -------------------------------------------------------------------------
    // 6. Aplicar (somente se apply === true)
    // -------------------------------------------------------------------------
    let created = 0;
    let updated = 0;
    let deleted = 0;

    if (apply) {
      // Criar em lotes de 100
      const insertBatchSize = 100;
      for (let i = 0; i < toCreate.length; i += insertBatchSize) {
        const chunk = toCreate.slice(i, i + insertBatchSize);
        await svc.UserProgress.bulkCreate(chunk);
        created += chunk.length;
      }

      // Atualizar um a um
      for (const u of toUpdate) {
        const target = u.target;
        await svc.UserProgress.update(u.id, {
          completed_case_ids: target.completed_case_ids,
          completion_count: target.completion_count,
          completion_goal: target.completion_goal,
          status: target.status,
          last_updated: new Date().toISOString(),
        });
        updated++;
      }

      // Remover órfãos + duplicatas (opcional)
      if (deleteOrphans) {
        for (const rec of [...orphans, ...duplicates]) {
          await svc.UserProgress.delete(rec.id);
          deleted++;
        }
      }
    }

    // -------------------------------------------------------------------------
    // 7. Relatório
    // -------------------------------------------------------------------------
    return Response.json({
      success: true,
      mode: apply ? 'APPLIED' : 'DRY_RUN (nada foi gravado)',
      deleteOrphans,
      totals: {
        attempts_processed: allAttempts.length,
        desired_groups: Object.keys(desired).length,
        existing_records: existing.length,
      },
      diff: {
        to_create: toCreate.length,
        to_update: toUpdate.length,
        unchanged,
        orphans: orphans.length,
        duplicates: duplicates.length,
      },
      applied: apply ? { created, updated, deleted } : null,
      // Amostras para conferência manual (limitadas para não inflar a resposta)
      samples: {
        creates: toCreate.slice(0, 20).map((c) => ({
          user_email: c.user_email,
          phase_id: c.phase_id,
          completion_count: c.completion_count,
          completion_goal: c.completion_goal,
          status: c.status,
        })),
        updates: toUpdate.slice(0, 20),
        orphans: orphans.slice(0, 20).map((o) => ({
          id: o.id,
          user_email: o.user_email,
          phase_id: o.phase_id,
        })),
      },
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});