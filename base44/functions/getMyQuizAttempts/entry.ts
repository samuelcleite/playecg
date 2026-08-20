import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// getMyQuizAttempts
// -----------------------------------------------------------------------------
// Devolve as tentativas do usuário autenticado. Substitui as leituras de
// QuizAttempt que o frontend fazia direto.
//
// POR QUE ISTO PRECISOU EXISTIR NO CORTE:
// o RLS da QuizAttempt é `user_email == {{user.email}}`. Sob JWT não existe
// sessão Base44, esse contexto resolve NULO, e o filtro não casa com nada — a
// leitura devolve lista VAZIA em vez de erro. Silenciosamente.
//
// O estrago não seria cosmético. Quiz.jsx usa essa leitura para contar as
// tentativas do dia e aplicar o limite do plano gratuito: lista vazia significa
// usuário free com acesso ilimitado. Achievements, Perfil, ModuleDetail e o
// cálculo de sequência ficariam todos zerados, com cara de dado legítimo.
//
// O dono vem de identity.email, NUNCA do corpo — mesma regra do
// recordQuizAttempt e do updateUserProgress. Com service role, o RLS não protege
// mais nada; o filtro explícito é a barreira.
//
// Filtros aceitos (todos opcionais): module_id, phase_id, quiz_type, correct e
// `since` (ISO 8601, ver o bloco onde ele é lido).
// `sort` e `limit` são repassados como vinham nas chamadas originais.
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);

    if (!identity) {
      return Response.json({ error: 'Unauthorized', success: false }, { status: 401 });
    }

    let body = {};
    try { body = await req.json(); } catch (_) { /* sem corpo = sem filtros */ }

    const query = { user_email: (identity.email || '').trim().toLowerCase() };
    if (body.module_id) query.module_id = body.module_id;
    if (body.phase_id) query.phase_id = body.phase_id;
    if (body.quiz_type) query.quiz_type = body.quiz_type;
    if (typeof body.correct === 'boolean') query.correct = body.correct;

    const sort = body.sort || '-created_date';
    const limit = typeof body.limit === 'number' && body.limit > 0 ? body.limit : null;

    // `since` (ISO 8601): devolve só as tentativas a partir deste instante.
    //
    // Existe para a contagem do limite diário do plano gratuito, que roda a
    // CADA questão respondida. Sem ele, o Quiz baixava o histórico inteiro da
    // pessoa — de 500 em 500, até esgotar — para depois descartar tudo que não
    // fosse de hoje no navegador. Com o app tomando 429 do Base44, a leitura
    // mais frequente do app era também a mais desperdiçada.
    //
    // O corte é aplicado aqui e não como operador no filtro do SDK de
    // propósito: assim não dependemos de a plataforma suportar comparação de
    // data no `filter`, e o comportamento é o mesmo em qualquer versão.
    const desde = typeof body.since === 'string' ? new Date(body.since) : null;
    const corte = desde && !isNaN(desde.getTime()) ? desde : null;

    let attempts = [];
    if (limit) {
      attempts = await base44.asServiceRole.entities.QuizAttempt.filter(query, sort, limit);
    } else {
      // Sem limite explícito: pagina até esgotar. As chamadas originais do
      // frontend não passavam limite e o SDK tem teto por página — parar na
      // primeira página truncaria a contagem de quem tem muitas tentativas, e
      // truncar aqui vira limite de plano aplicado errado.
      const batchSize = 500;
      let skip = 0;

      // A parada antecipada só é válida se a ordem for do mais novo para o mais
      // antigo — é ela que garante que, ao ver o primeiro registro anterior ao
      // corte, todos os seguintes também são. Com qualquer outra ordenação
      // filtramos sem interromper, o que continua correto, só não economiza.
      const podeParar = corte && sort === '-created_date';

      while (true) {
        const batch = await base44.asServiceRole.entities.QuizAttempt.filter(query, sort, batchSize, skip);
        if (!batch || batch.length === 0) break;

        if (corte) {
          const dentro = batch.filter(a => new Date(a.created_date) >= corte);
          attempts = attempts.concat(dentro);
          if (podeParar && dentro.length < batch.length) break;
        } else {
          attempts = attempts.concat(batch);
        }

        if (batch.length < batchSize) break;
        skip += batchSize;
      }
    }

    return Response.json({ success: true, count: attempts.length, attempts });
  } catch (error) {
    console.error('Erro em getMyQuizAttempts:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
