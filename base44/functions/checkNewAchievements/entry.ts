import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { resolveIdentity } from '../../shared/auth.ts';

// checkNewAchievements — avalia e grava troféus recém-conquistados.
// -----------------------------------------------------------------------------
// Roda a CADA resposta de quiz (Quiz e ModuleDetail chamam logo depois do
// recordQuizAttempt), então cada leitura aqui é multiplicada pelo número de
// respostas do dia inteiro. Por isso a function lê em duas rodadas:
//
//   1. Account, Achievement e UserAchievement — o mínimo para saber se sobrou
//      algum troféu por conquistar. Quem já tem todos sai aqui, com 3 leituras.
//   2. UserProgress e Phase, SÓ se algum troféu pendente depende deles: o
//      progresso alimenta `completed_modules` e a especialização; as fases só
//      importam para especialização por módulo, e só as dos módulos citados
//      (antes era Phase.list() — todas as fases do app, a cada resposta).
//
// O resolveIdentity compartilhado não lê a Account; a cópia local que vivia
// aqui lia, e o corpo lia DE NOVO — duas leituras da mesma conta por resposta.

// Data YYYY-MM-DD no timezone do Brasil (America/Sao_Paulo) — o mesmo fuso do
// recordQuizAttempt, que é quem mantém last_practice_date na Account.
function getBrasiliaDateStr(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function checkAchievementSync(achievement, user, stats, streakDays, userProgress, phases) {
  if (achievement.achievement_type === "intensity") {
    switch (achievement.requirement_type) {
      case "first_correct":
        return stats.correctAnswers >= 1;
      case "streak_days":
        return streakDays >= (achievement.requirement_value || 0);
      case "accuracy":
        return stats.accuracy >= (achievement.requirement_value || 0);
      case "level":
        return (user.level || 1) >= (achievement.requirement_value || 0);
      case "points":
        return (user.points || 0) >= (achievement.requirement_value || 0);
      case "completed_modules":
        return stats.completedModules >= (achievement.requirement_value || 0);
      case "total_attempts":
        return stats.totalAttempts >= (achievement.requirement_value || 0);
      default:
        return false;
    }
  }

  if (achievement.achievement_type === "specialization") {
    const moduleIds = achievement.module_ids || [];
    const phaseIds = achievement.phase_ids || [];

    if (moduleIds.length === 0 && phaseIds.length === 0) return false;

    const isPhaseCompleted = (phaseId) => {
      const record = userProgress.find(up => up.phase_id === phaseId);
      return record?.status === 'completed';
    };

    if (phaseIds.length > 0) {
      if (!phaseIds.every(isPhaseCompleted)) return false;
    }

    if (moduleIds.length > 0) {
      for (const moduleId of moduleIds) {
        const modulePhases = phases.filter(p => p.module_id === moduleId);
        // Sem fase conhecida do módulo não há como afirmar que ele foi
        // concluído — `every` sobre lista vazia diria que sim.
        if (modulePhases.length === 0) return false;
        if (!modulePhases.every(p => isPhaseCompleted(p.id))) return false;
      }
    }

    return true;
  }

  return false;
}

// Um troféu pendente precisa do UserProgress se for de especialização ou de
// "módulos concluídos".
function dependeDoProgresso(a) {
  return a.achievement_type === 'specialization' ||
    (a.achievement_type === 'intensity' && a.requirement_type === 'completed_modules');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);
    if (!identity) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const email = (identity.email || '').trim().toLowerCase();

    // --- 1ª rodada: o mínimo para saber se há o que avaliar ---
    //
    // Os pontos, o streak e as contagens vêm da ACCOUNT (agregados mantidos
    // pelo recordQuizAttempt), nunca do histórico de tentativas nem do User
    // hospedado, que está congelado desde o corte para a Account.
    //
    // SERVICE ROLE nas entidades per-user: elas exigem __service_only__ no RLS
    // e o cliente user-scoped devolveria lista VAZIA, sem erro — nenhuma
    // conquista desbloquearia e nada indicaria o porquê. Achievement e Phase
    // são conteúdo, com RLS aberto, e seguem no cliente comum.
    const [contas, allAchievements, existingUserAchievements] = await Promise.all([
      base44.asServiceRole.entities.Account.filter({ email }),
      base44.entities.Achievement.filter({ active: true }),
      base44.asServiceRole.entities.UserAchievement.filter({ user_email: email }),
    ]);
    const user = contas && contas.length > 0 ? contas[0] : {};

    const alreadyEarnedIds = new Set(existingUserAchievements.map(ua => ua.achievement_id));
    const pendentes = allAchievements.filter(a => !alreadyEarnedIds.has(a.id));

    if (pendentes.length === 0) {
      return Response.json({ success: true, new_achievements: [] });
    }

    // --- 2ª rodada: só o que os pendentes exigem ---
    const precisaProgresso = pendentes.some(dependeDoProgresso);
    const modulosCitados = [...new Set(
      pendentes
        .filter(a => a.achievement_type === 'specialization')
        .flatMap(a => Array.isArray(a.module_ids) ? a.module_ids : [])
    )];

    const [userProgress, phases] = await Promise.all([
      precisaProgresso
        ? base44.asServiceRole.entities.UserProgress.filter({ user_email: email })
        : Promise.resolve([]),
      modulosCitados.length > 0
        ? base44.entities.Phase.filter({ module_id: { $in: modulosCitados } })
        : Promise.resolve([]),
    ]);

    const hojeStr = getBrasiliaDateStr(new Date());
    const ontemStr = getBrasiliaDateStr(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const streakDays = (user.last_practice_date === hojeStr || user.last_practice_date === ontemStr)
      ? (user.current_streak || 0)
      : 0;

    const totalAttempts = user.total_attempts || 0;
    const correctCount = user.total_correct_attempts || 0;
    const completedPhasesCount = userProgress.filter(up => up.status === 'completed').length;

    const stats = {
      totalAttempts,
      correctAnswers: correctCount,
      accuracy: totalAttempts > 0 ? Math.round((correctCount / totalAttempts) * 100) : 0,
      totalPoints: user.points || 0,
      completedModules: completedPhasesCount,
    };

    const newlyEarned = [];
    const now = new Date().toISOString();

    for (const achievement of pendentes) {
      const earned = checkAchievementSync(achievement, user, stats, streakDays, userProgress, phases);
      if (!earned) continue;

      // Re-verificar logo antes de criar para evitar duplicatas por chamadas
      // concorrentes. Custa uma leitura, mas só quando um troféu é conquistado.
      const existing = await base44.asServiceRole.entities.UserAchievement.filter({
        user_email: email,
        achievement_id: achievement.id,
      });
      if (existing.length > 0) continue;

      await base44.asServiceRole.entities.UserAchievement.create({
        user_email: email,
        achievement_id: achievement.id,
        earned_at: now,
      });
      newlyEarned.push({ id: achievement.id, name: achievement.name, icon: achievement.icon });
    }

    return Response.json({ success: true, new_achievements: newlyEarned });
  } catch (error) {
    console.error('Erro em checkNewAchievements:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
