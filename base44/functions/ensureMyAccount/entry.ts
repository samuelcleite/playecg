import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ensureMyAccount
// -----------------------------------------------------------------------------
// Garante que o usuário autenticado tenha uma Account, criando-a se faltar.
// Chamada pelo AuthContext SOMENTE quando o getMyAccount devolve 404.
//
// Por que não fazer isso dentro do getMyAccount: criar registro dentro de uma
// função de leitura é efeito colateral escondido — ninguém procura escrita numa
// rota chamada "get". Separado, o caminho que escreve tem nome próprio e roda
// aproximadamente nunca.
//
// Quando isso acontece na prática: alguém se cadastra pelo login hospedado do
// Base44 depois do corte. Ganha linha User, não ganha Account, e sem esta função
// ficaria como usuário legado — sem progresso, sem assinatura, invisível para
// todo o backend novo.
//
// Idempotente: se a Account já existe, devolve e não escreve nada.
//
// Os agregados são RECALCULADOS da QuizAttempt, não copiados do User. Mesma
// razão do backfillAccountFromUser: a QuizAttempt é a fonte de verdade e é
// chaveada por email, idêntico dos dois lados. Para um cadastro novo isso dá 0,
// que é o valor certo; para alguém com histórico, dá o valor real.
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

// Agregados a partir de TODAS as tentativas do email. Paginação com sort
// 'created_date': a eleição da "primeira tentativa por caso" depende da ordem,
// e sem sort explícito as taxas de acerto inflam.
async function computeStatsFromAttempts(base44, email) {
  const batchSize = 500;
  let skip = 0;
  let attempts = [];
  while (true) {
    const batch = await base44.asServiceRole.entities.QuizAttempt.filter(
      { user_email: email }, 'created_date', batchSize, skip
    );
    if (!batch || batch.length === 0) break;
    attempts = attempts.concat(batch);
    if (batch.length < batchSize) break;
    skip += batchSize;
  }

  const firstPerCase = new Map();
  for (const a of attempts) {
    const key = `${a.quiz_type ?? 'unknown'}__${a.case_id}`;
    if (!firstPerCase.has(key)) firstPerCase.set(key, a);
  }
  const first = [...firstPerCase.values()];

  const firstModulePerCase = new Map();
  for (const a of attempts.filter(x => x.quiz_type === 'module')) {
    if (!firstModulePerCase.has(a.case_id)) firstModulePerCase.set(a.case_id, a);
  }
  const firstModule = [...firstModulePerCase.values()];

  const uniqueDates = [...new Set(attempts.map(a => getBrasiliaDateStr(new Date(a.created_date))))].sort().reverse();
  let current_streak = 0;
  if (uniqueDates.length > 0) {
    const now = new Date();
    const todayStr = getBrasiliaDateStr(now);
    const yesterdayStr = getBrasiliaDateStr(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    if (uniqueDates[0] === todayStr || uniqueDates[0] === yesterdayStr) {
      let prev = null;
      for (const d of uniqueDates) {
        if (prev === null) current_streak = 1;
        else {
          const diff = Math.round((new Date(prev + 'T00:00:00') - new Date(d + 'T00:00:00')) / 86400000);
          if (diff === 1) current_streak++; else break;
        }
        prev = d;
      }
    }
  }

  const correct_first_attempts = first.filter(a => a.correct).length;
  const acertos_totais = attempts.filter(a => a.correct).length;
  const points =
    correct_first_attempts * PONTOS_ACERTO_PRIMEIRA +
    (acertos_totais - correct_first_attempts) * PONTOS_ACERTO_REVISAO;

  return {
    total_attempts: attempts.length,
    total_first_attempts: first.length,
    correct_first_attempts,
    module_first_attempts: firstModule.length,
    module_correct_first_attempts: firstModule.filter(a => a.correct).length,
    current_streak,
    last_practice_date: uniqueDates[0] || '',
    points,
    level: nivelPara(points)
  };
}

function sanitize(account, identity) {
  const { password_hash, google_id, apple_id, ...rest } = account;
  return {
    ...rest,
    role: identity.role === 'admin' ? 'admin' : 'user',
    tem_google: !!google_id,
    tem_apple: !!apple_id,
    tem_senha: !!password_hash
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);

    if (!identity) {
      return Response.json({ error: 'Não autenticado', success: false }, { status: 401 });
    }

    const email = (identity.email || '').trim().toLowerCase();
    if (!email) {
      return Response.json({ error: 'Identidade sem email', success: false }, { status: 400 });
    }

    const existentes = await base44.asServiceRole.entities.Account.filter({ email });
    if (existentes.length > 0) {
      return Response.json({
        success: true,
        criada: false,
        account: sanitize(existentes[0], identity)
      });
    }

    // Sem Account. Se houver linha User, herda o perfil dela; senão parte do
    // mínimo. `role` NUNCA é copiado: admin é concedido pela sessão do Base44,
    // e gravar 'admin' na Account abriria escalação.
    const users = await base44.asServiceRole.entities.User.filter({ email });
    const u = users && users.length > 0 ? users[0] : null;

    const novo = {
      email,
      full_name: (u?.full_name || email.split('@')[0] || '').trim(),
      subscription_type: u?.subscription_type === 'premium' ? 'premium' : 'free',
      specialty: u?.specialty || '',
      country: u?.country || '',
      state: u?.state || '',
      city: u?.city || '',
      profile_completed: u?.profile_completed === true,
      ...(await computeStatsFromAttempts(base44, email))
    };
    // Só entra quando tem valor: o campo é `format: date-time` no schema e
    // string vazia pode ser recusada pela validação.
    if (u?.subscription_start_date) {
      novo.subscription_start_date = u.subscription_start_date;
    }

    const account = await base44.asServiceRole.entities.Account.create(novo);
    console.log('ensureMyAccount: Account criada para', email, u ? '(a partir de User)' : '(sem User)');

    return Response.json({
      success: true,
      criada: true,
      account: sanitize(account, identity)
    });
  } catch (error) {
    console.error('Erro em ensureMyAccount:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
