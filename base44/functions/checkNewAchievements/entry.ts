import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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
//
// Além de { email, role, source }, devolve `record`: o registro do usuário de
// onde ler campos extras (subscription_type, points, full_name, city...).
//   source 'base44' → record = retorno de base44.auth.me() (o User inteiro).
//   source 'jwt'    → record = a Account daquele email (via asServiceRole).
// LER de qualquer um dos dois é seguro durante a transição, porque ninguém
// escreve na Account — ela nunca diverge do User. Toda ESCRITA continua indo
// para o User. role nunca vem do record: é sempre 'user' no caminho JWT.
// JWT válido sem Account correspondente → null (sem fallback para sessão).
async function resolveIdentity(req, base44) {
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const secret = Deno.env.get('JWT_SECRET');
    if (secret) {
      const token = authHeader.slice('Bearer '.length).trim();
      const payload = await verifyJwtHS256(token, secret);
      if (payload && payload.email) {
        const accounts = await base44.asServiceRole.entities.Account.filter({ email: payload.email });
        const record = accounts && accounts.length > 0 ? accounts[0] : null;
        if (!record) return null;
        return { email: payload.email, role: 'user', source: 'jwt', record };
      }
    }
  }

  // base44.auth.me() LANÇA (não retorna null) quando o Authorization traz um
  // Bearer que não é JWT próprio válido nem sessão Base44 — tratamos a exceção
  // como não autenticado: null, o contrato já esperado por quem chama (=> 401).
  let user;
  try {
    user = await base44.auth.me();
  } catch (_e) {
    return null;
  }
  if (user) {
    return { email: user.email, role: user.role, source: 'base44', record: user };
  }

  return null;
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
        if (!modulePhases.every(p => isPhaseCompleted(p.id))) return false;
      }
    }

    return true;
  }

  return false;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);
    if (!identity) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // record: fonte só-leitura dos campos extras (user.points). email: chave dos filtros.
    // UserAchievement.create NÃO é escrita no registro do usuário → permitido converter.
    const user = identity.record;
    const email = identity.email;

    // Buscar dados necessários em paralelo
    const [allAchievements, userProgress, phases, existingUserAchievements] = await Promise.all([
      base44.entities.Achievement.filter({ active: true }),
      base44.entities.UserProgress.filter({ user_email: email }),
      base44.entities.Phase.list(),
      base44.entities.UserAchievement.filter({ user_email: email }),
    ]);

    // IDs de troféus já conquistados
    const alreadyEarnedIds = new Set(existingUserAchievements.map(ua => ua.achievement_id));

    // Calcular streak
    const allAttemptsDates = (await base44.entities.QuizAttempt.filter({ user_email: email }))
      .map(a => new Date(a.created_date).toISOString().split('T')[0]);
    const uniqueDates = [...new Set(allAttemptsDates)].sort().reverse();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    let streakDays = 0;
    if (uniqueDates.length > 0 && (uniqueDates[0] === todayStr || uniqueDates[0] === yesterdayStr)) {
      let cur = new Date(today);
      for (const d of uniqueDates) {
        const diff = Math.floor((cur - new Date(d + 'T00:00:00')) / 86400000);
        if (diff === 0 || diff === 1) { streakDays++; cur = new Date(d + 'T00:00:00'); } else break;
      }
    }

    // Calcular stats
    const allAttempts = await base44.entities.QuizAttempt.filter({ user_email: email });
    const correctCount = allAttempts.filter(a => a.correct).length;

    // Calcular fases completadas (para completedModules) usando UserProgress
    const completedPhasesCount = userProgress.filter(up => up.status === 'completed').length;

    const stats = {
      totalAttempts: allAttempts.length,
      correctAnswers: correctCount,
      accuracy: allAttempts.length > 0 ? Math.round((correctCount / allAttempts.length) * 100) : 0,
      totalPoints: user.points || 0,
      completedModules: completedPhasesCount,
    };

    // Verificar quais troféus ainda não foram conquistados mas agora são elegíveis
    const newlyEarned = [];
    const now = new Date().toISOString();

    for (const achievement of allAchievements) {
      if (alreadyEarnedIds.has(achievement.id)) continue;

      const earned = checkAchievementSync(achievement, user, stats, streakDays, userProgress, phases);
      if (earned) {
        // Re-verificar logo antes de criar para evitar duplicatas por chamadas concorrentes
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
    }

    return Response.json({ success: true, new_achievements: newlyEarned });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});