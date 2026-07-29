import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// backfillAccountFromUser
// -----------------------------------------------------------------------------
// Prepara a entidade Account para virar o REGISTRO ÚNICO do usuário, copiando do
// User o que é dado de aplicação. Casa User <-> Account por email normalizado
// (trim + lowercase) e faz UPSERT: cria a Account que falta, atualiza a que está
// divergente, deixa intacta a que já está certa. Idempotente — rodar duas vezes
// produz o mesmo resultado.
//
// PARÂMETROS (no corpo do invoke):
//   apply (boolean, default FALSE) -> false = só relatório (dry run);
//                                     true  = grava as mudanças.
//
// Requer admin. (O caminho JWT nunca concede admin, por decisão de arquitetura,
// então esta função só é alcançável pela sessão Base44.)
//
// O QUE COPIA do User: **APENAS ao CRIAR uma Account que não existe**.
//   full_name, subscription_type, subscription_start_date, specialty, country,
//   state, city, profile_completed.
//   Em Account que já existe, esses campos NÃO são tocados: depois do corte o
//   User é registro congelado e a Account é a fonte de verdade. Copiar do User
//   para uma Account viva desfaz compras e edições de perfil — aconteceu.
//
// O QUE **RECALCULA** a partir de QuizAttempt (não copia do User):
//   total_attempts, total_first_attempts, correct_first_attempts,
//   module_first_attempts, module_correct_first_attempts, current_streak,
//   last_practice_date, points, level.
//   Motivo: os agregados no User são incrementais (recordQuizAttempt) e podem ter
//   derivado. A QuizAttempt é a fonte de verdade e é chaveada por user_email, que
//   é idêntico dos dois lados. Recalcular também torna esta função repetível na
//   véspera do corte sem depender de quando ela rodou antes. A lógica é a mesma
//   de getUserStats/computeStatsFromAttempts.
//
// O QUE NUNCA TOCA:
//   - email, password_hash, google_id, apple_id, avatar_url, email_verified,
//     last_login_at — pertencem ao lado de credencial, que é da Account.
//   - role — NUNCA copiado do User. Um User admin não vira Account admin: o JWT
//     não concede admin por decisão de arquitetura, e gravar role:'admin' na
//     Account criaria um caminho de escalação para o dia em que alguém confiar
//     nesse campo. Admin continua sendo quem entra pela sessão Base44.
//     (points e level SÃO recalculados — ver a lista acima. Eles eram campos
//     mortos até a implementação de pontos; rodar esta função é o que dá a
//     pontuação histórica a quem já tinha tentativas antes dela existir.)
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
    return { email: user.email, role: user.role, source: 'base44' };
  }

  return null;
}

// ===== REGRA DE PONTUAÇÃO (espelho de recordQuizAttempt) =====================
// Os dois caminhos — o incremental do recordQuizAttempt e este recálculo —
// precisam produzir o mesmo número. Se divergirem, cada rodada deste recálculo
// muda os pontos de todo mundo sem motivo aparente. Ao mexer nos valores, mexer
// nos três arquivos.
const PONTOS_ACERTO_PRIMEIRA = 10;
const PONTOS_ACERTO_REVISAO = 3;
const PONTOS_POR_NIVEL = 100;

function nivelPara(pontos) {
  return 1 + Math.floor((pontos || 0) / PONTOS_POR_NIVEL);
}
// ==============================================================================

// Data YYYY-MM-DD no timezone do Brasil (America/Sao_Paulo)
function getBrasiliaDateStr(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

async function listAll(entities, entityName, sort = null) {
  const batchSize = 500;
  let skip = 0;
  let all = [];
  while (true) {
    const batch = await entities[entityName].list(sort, batchSize, skip);
    if (!batch || batch.length === 0) break;
    all = all.concat(batch);
    if (batch.length < batchSize) break;
    skip += batchSize;
  }
  return all;
}

// Agregados a partir das tentativas de UM usuário. Mesma lógica de
// getUserStats/computeStatsFromAttempts, operando sobre uma lista já em memória.
function computeStatsFromAttempts(attempts) {
  const total_attempts = attempts.length;

  const firstAttemptPerCase = new Map();
  for (const attempt of attempts) {
    const key = `${attempt.quiz_type ?? 'unknown'}__${attempt.case_id}`;
    if (!firstAttemptPerCase.has(key)) firstAttemptPerCase.set(key, attempt);
  }
  const firstAttempts = [...firstAttemptPerCase.values()];
  const total_first_attempts = firstAttempts.length;
  const correct_first_attempts = firstAttempts.filter(a => a.correct).length;

  const moduleAttempts = attempts.filter(a => a.quiz_type === 'module');
  const firstModuleAttemptPerCase = new Map();
  for (const attempt of moduleAttempts) {
    if (!firstModuleAttemptPerCase.has(attempt.case_id)) firstModuleAttemptPerCase.set(attempt.case_id, attempt);
  }
  const firstModuleAttempts = [...firstModuleAttemptPerCase.values()];
  const module_first_attempts = firstModuleAttempts.length;
  const module_correct_first_attempts = firstModuleAttempts.filter(a => a.correct).length;

  // Streak
  const uniqueDates = [...new Set(attempts.map(a => getBrasiliaDateStr(new Date(a.created_date))))].sort().reverse();
  let current_streak = 0;
  const last_practice_date = uniqueDates[0] || '';
  if (uniqueDates.length > 0) {
    const now = new Date();
    const todayStr = getBrasiliaDateStr(now);
    const yesterdayStr = getBrasiliaDateStr(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    if (uniqueDates[0] === todayStr || uniqueDates[0] === yesterdayStr) {
      let prev = null;
      for (const dateStr of uniqueDates) {
        if (prev === null) {
          current_streak = 1;
        } else {
          const diffDays = Math.round((new Date(prev + 'T00:00:00') - new Date(dateStr + 'T00:00:00')) / (1000 * 60 * 60 * 24));
          if (diffDays === 1) current_streak++;
          else break;
        }
        prev = dateStr;
      }
    }
  }

  // Pontos: 10 por acerto na primeira tentativa do caso, 3 por acerto em
  // revisão. Equivalente a somar tentativa a tentativa, mas em forma fechada.
  const acertos_totais = attempts.filter(a => a.correct).length;
  const points =
    correct_first_attempts * PONTOS_ACERTO_PRIMEIRA +
    (acertos_totais - correct_first_attempts) * PONTOS_ACERTO_REVISAO;

  return {
    total_attempts,
    total_first_attempts,
    correct_first_attempts,
    module_first_attempts,
    module_correct_first_attempts,
    current_streak,
    last_practice_date,
    points,
    level: nivelPara(points)
  };
}

// Campos de perfil vindos do User. Normalizados para que a comparação com o que
// já está na Account não acuse diferença entre null, undefined e ''.
function profileFromUser(u) {
  const out = {
    full_name: u.full_name || '',
    // subscription_type pode vir null em registros antigos; o schema só admite
    // 'free' | 'premium'.
    subscription_type: u.subscription_type === 'premium' ? 'premium' : 'free',
    specialty: u.specialty || '',
    country: u.country || '',
    state: u.state || '',
    city: u.city || '',
    profile_completed: u.profile_completed === true
  };

  // subscription_start_date é o ÚNICO campo copiado que tem `format: date-time`
  // no schema da Account. Só entra no payload quando tem valor: mandar '' pode
  // ser rejeitado pela validação de formato, e não há nada a ganhar em zerar o
  // campo. Ausente da chave => não é comparado nem gravado, então uma Account
  // que já tenha data nunca a perde.
  // No dry-run de 2026-07-27 isso valia para 3 usuários premium sem data de
  // início (ecgdescomplica, fellype92, eletrocardiodrama.ecg).
  if (u.subscription_start_date) {
    out.subscription_start_date = u.subscription_start_date;
  }

  return out;
}

function norm(v) {
  if (v === undefined || v === null) return '';
  return v;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);

    if (!identity || identity.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    let apply = false;
    try {
      const body = await req.json();
      apply = body?.apply === true;
    } catch (_) {
      // sem corpo => dry run
    }

    const svc = base44.asServiceRole.entities;

    const users = await listAll(svc, 'User');
    const accounts = await listAll(svc, 'Account');
    // ORDEM IMPORTA: computeStatsFromAttempts elege a "primeira tentativa por
    // caso" pela ordem em que as linhas chegam. Sem sort explícito a ordem é a
    // que o banco quiser devolver, e uma tentativa posterior (provavelmente
    // correta, porque a pessoa insiste até acertar) pode ser eleita como a
    // primeira — inflando correct_first_attempts e module_correct_first_attempts,
    // que são os numeradores das duas taxas de acerto exibidas ao usuário.
    // getUserStats já paginava com sort 'created_date' pelo mesmo motivo.
    const allAttempts = await listAll(svc, 'QuizAttempt', 'created_date');

    // Tentativas agrupadas por email normalizado.
    const attemptsByEmail = new Map();
    for (const a of allAttempts) {
      const key = normalizeEmail(a.user_email);
      if (!key) continue;
      if (!attemptsByEmail.has(key)) attemptsByEmail.set(key, []);
      attemptsByEmail.get(key).push(a);
    }

    const accountsByEmail = new Map();
    for (const a of accounts) {
      const key = normalizeEmail(a.email);
      if (key && !accountsByEmail.has(key)) accountsByEmail.set(key, a);
    }

    const criadas = [];
    const atualizadas = [];
    const inalteradas = [];
    const ignoradas = [];
    const erros = [];
    // Conferência independente: agregado recalculado da QuizAttempt vs. o valor
    // incremental já guardado no User (escrito por recordQuizAttempt, um a um).
    // Não altera nada — serve para validar o recálculo antes de gravá-lo em 32
    // registros. Divergência pequena e esparsa = deriva esperada do contador
    // incremental. Divergência grande e sistemática = o recálculo está errado.
    const conferencia_agregados = [];
    const CAMPOS_AGREGADOS = [
      'total_attempts',
      'total_first_attempts',
      'correct_first_attempts',
      'module_first_attempts',
      'module_correct_first_attempts',
      'current_streak',
      'last_practice_date',
      'points',
      'level'
    ];

    for (const u of users) {
      const key = normalizeEmail(u.email);
      if (!key) {
        ignoradas.push({ email: u.email ?? null, motivo: 'User sem email' });
        continue;
      }

      const stats = computeStatsFromAttempts(attemptsByEmail.get(key) || []);
      const existente = accountsByEmail.get(key) || null;

      // O QUE ESTA FUNÇÃO ESCREVE DEPENDE DE A ACCOUNT JÁ EXISTIR — e essa
      // distinção não é detalhe, é a correção de um estrago real.
      //
      // Antes do corte, o User era a fonte de verdade e copiar perfil e
      // assinatura dele para a Account estava certo. Depois do corte o User
      // virou registro CONGELADO: toda escrita vai para a Account. Rodar a
      // versão antiga desta função em 2026-07-29 sobrescreveu, com o estado
      // velho do User, uma assinatura premium comprada no dia anterior e uma
      // edição de nome feita pelo próprio usuário — dois usuários rebaixados
      // para free por uma função de manutenção.
      //
      // Account já existe  -> SÓ agregados. Perfil e assinatura são da Account
      //                       e ninguém mais tem autoridade para mudá-los aqui.
      // Account não existe -> copia o perfil do User, porque não há nada a
      //                       destruir e é a única fonte disponível.
      const desejado = existente
        ? { ...stats }
        : { ...profileFromUser(u), ...stats };

      const difs = CAMPOS_AGREGADOS
        .filter(campo => norm(u[campo]) !== norm(stats[campo]))
        .map(campo => ({
          campo,
          guardado_no_user: u[campo] ?? null,
          recalculado: stats[campo]
        }));
      if (difs.length > 0) {
        conferencia_agregados.push({ email: key, difs });
      }

      if (!existente) {
        criadas.push({ email: key, valores: desejado });
        if (apply) {
          try {
            // email vai com a grafia normalizada: é a identidade única e é a
            // chave que googleSignIn/appleSignIn usam para casar no 1º login.
            await svc.Account.create({ email: key, ...desejado });
          } catch (e) {
            erros.push({ email: key, operacao: 'create', erro: e.message });
          }
        }
        continue;
      }

      const divergencias = [];
      for (const campo of Object.keys(desejado)) {
        if (norm(existente[campo]) !== norm(desejado[campo])) {
          divergencias.push({
            campo,
            valor_atual_na_account: existente[campo] ?? null,
            valor_novo: desejado[campo]
          });
        }
      }

      if (divergencias.length === 0) {
        inalteradas.push({ email: key });
        continue;
      }

      atualizadas.push({ email: key, divergencias });
      if (apply) {
        try {
          await svc.Account.update(existente.id, desejado);
        } catch (e) {
          erros.push({ email: key, operacao: 'update', erro: e.message });
        }
      }
    }

    // Accounts que não têm User correspondente: não são tocadas (podem ser
    // usuários JWT-nativos, que nunca terão User). Só reportadas.
    const usersByEmail = new Set(users.map(u => normalizeEmail(u.email)).filter(Boolean));
    const accounts_sem_user = accounts
      .map(a => normalizeEmail(a.email))
      .filter(e => e && !usersByEmail.has(e));

    return Response.json({
      success: true,
      dry_run: !apply,
      total_users: users.length,
      total_accounts_antes: accounts.length,
      resumo: {
        a_criar: criadas.length,
        a_atualizar: atualizadas.length,
        ja_corretas: inalteradas.length,
        ignoradas: ignoradas.length,
        erros: erros.length,
        usuarios_com_agregado_divergente: conferencia_agregados.length
      },
      conferencia_agregados,
      criadas,
      atualizadas,
      inalteradas,
      ignoradas,
      accounts_sem_user,
      erros
    });
  } catch (error) {
    console.error('Erro em backfillAccountFromUser:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
