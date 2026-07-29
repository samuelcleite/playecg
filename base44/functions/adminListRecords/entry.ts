import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// adminListRecords
// -----------------------------------------------------------------------------
// Leitura administrativa das entidades per-user, via service role atrás de um
// gate de admin.
//
// POR QUE EXISTE: as entidades per-user vão passar a ter RLS negado para todo
// mundo. Isso é possível porque, depois do corte, nenhum usuário lê essas
// tabelas do frontend — tudo passa por function com filtro por identity.email.
// As telas ADMIN eram a última exceção: liam direto, apoiadas na cláusula
// `role: admin` do RLS. Fechado o RLS, elas precisam deste caminho.
//
// UMA função e não quatro: as seis chamadas que ela substitui diferem apenas em
// entidade, filtro, ordenação e limite. Quatro funções quase idênticas seriam
// quatro cópias do helper de identidade para manter em sincronia.
//
// ALLOWLIST EXPLÍCITA de entidades. Sem ela, isto seria um leitor genérico de
// banco atrás de um único `if` — e o dia em que esse `if` regredisse, vazaria
// tudo. Com a lista, o pior caso é vazar o que as telas admin já mostram.
//
// O `filter` vem do cliente e isso é aceitável AQUI: quem passa no gate já pode
// ler a entidade inteira, então um filtro malicioso não concede nada novo. Essa
// lógica NÃO vale para as functions de usuário, onde o dono sempre vem de
// identity.email e nunca do corpo.
// -----------------------------------------------------------------------------

const ENTIDADES_PERMITIDAS = [
  'QuizAttempt',
  'Payment',
  'CouponUsage',
  'PushSubscription',
  'UserProgress',
  'UserAchievement',
  'DailyQuizStats'
];

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

    if (!identity || identity.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { entity, filter, sort, limit } = await req.json();

    if (!ENTIDADES_PERMITIDAS.includes(entity)) {
      return Response.json(
        { error: `Entidade não permitida: ${entity}`, success: false },
        { status: 400 }
      );
    }

    const svc = base44.asServiceRole.entities[entity];
    const ordenacao = sort || '-created_date';
    const temFiltro = filter && Object.keys(filter).length > 0;

    let registros = [];

    if (typeof limit === 'number' && limit > 0) {
      registros = temFiltro
        ? await svc.filter(filter, ordenacao, limit)
        : await svc.list(ordenacao, limit);
    } else {
      // Sem limite: pagina até esgotar. Parar na primeira página truncaria
      // silenciosamente os relatórios — e um relatório truncado que parece
      // completo é pior do que um que falha.
      const batchSize = 500;
      let skip = 0;
      while (true) {
        const lote = temFiltro
          ? await svc.filter(filter, ordenacao, batchSize, skip)
          : await svc.list(ordenacao, batchSize, skip);
        if (!lote || lote.length === 0) break;
        registros = registros.concat(lote);
        if (lote.length < batchSize) break;
        skip += batchSize;
      }
    }

    return Response.json({ success: true, entity, count: registros.length, records: registros });
  } catch (error) {
    console.error('Erro em adminListRecords:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
