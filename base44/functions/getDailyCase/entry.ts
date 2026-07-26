import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);

    if (!identity) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Obter data de hoje (YYYY-MM-DD)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayDate = today.toISOString().split('T')[0];

    // Buscar DailyCase para hoje
    const dailyCases = await base44.asServiceRole.entities.DailyCase.filter({
      date: todayDate,
      active: true
    });

    if (dailyCases.length === 0) {
      return Response.json({
        success: false,
        message: 'Nenhum caso do dia disponível para hoje'
      });
    }

    const dailyCase = dailyCases[0];

    // Buscar o ECGCase associado
    const ecgCases = await base44.asServiceRole.entities.ECGCase.filter({
      id: dailyCase.ecg_case_id
    });

    if (ecgCases.length === 0) {
      return Response.json({
        success: false,
        message: 'Caso de ECG não encontrado'
      });
    }

    const ecgCase = ecgCases[0];

    // Verificar se o usuário já respondeu esse caso hoje.
    // asServiceRole ignora RLS: o filtro user_email (de identity.email, NUNCA do
    // body) é obrigatório aqui para não vazar tentativas de outros usuários.
    const attempts = await base44.asServiceRole.entities.QuizAttempt.filter({
      user_email: identity.email,
      case_id: dailyCase.ecg_case_id
    });

    // Filtrar tentativas de hoje
    const todayAttempts = attempts.filter(attempt => {
      const attemptDate = new Date(attempt.created_date);
      attemptDate.setHours(0, 0, 0, 0);
      return attemptDate.toISOString().split('T')[0] === todayDate;
    });

    const alreadyAnswered = todayAttempts.length > 0;
    const userAttempt = alreadyAnswered ? todayAttempts[0] : null;

    return Response.json({
      success: true,
      daily_case: dailyCase,
      ecg_case: ecgCase,
      already_answered: alreadyAnswered,
      user_attempt: userAttempt
    });

  } catch (error) {
    console.error('Error in getDailyCase:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});