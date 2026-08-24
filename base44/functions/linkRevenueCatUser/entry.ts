import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// linkRevenueCatUser
// -----------------------------------------------------------------------------
// Guarda, na Account de quem chama, o App User ID com que o RevenueCat conhece
// AQUELE aparelho.
//
// POR QUE EXISTE — o resgate de offer code do iOS acontece FORA do app.
//
// No Android o SDK é configurado com o Account.id a cada carregamento
// autenticado, então o app_user_id que chega no revenuecatWebhook já é o nosso.
// No iOS não existe equivalente: a ponte do Despia só carrega o external_id
// dentro do comando de compra. Quem resgata um código na App Store nunca passa
// por lá, e a assinatura nasce colada num id anônimo ($RCAnonymousID:...).
//
// O resultado, hoje, é que o resolveAccount() do webhook tenta Account.id e
// User.id, não acha nenhum dos dois, e descarta o evento em silêncio: a pessoa
// paga e continua sem acesso.
//
// Este é o lado do SERVIDOR do conserto. O app descobre o id lendo
// getpurchasehistory:// (campo externalUserId) e manda para cá; o webhook e o
// syncStoreSubscription passam a resolver também por ele. As duas metades vêm
// nas etapas seguintes — sozinha, esta function não muda comportamento nenhum.
//
// O DONO VEM DE identity.email, NUNCA DO CORPO. Regra do projeto e ela importa
// especialmente aqui: se o alvo viesse do body, qualquer autenticado poderia
// apontar o próprio id de aparelho para a conta de outra pessoa e sequestrar a
// assinatura dela na próxima renovação.
// -----------------------------------------------------------------------------

// Teto de sanidade, não especificação: o formato do id é do RevenueCat e não
// está documentado aqui. Existe só para uma string sem fim não entrar no banco.
const TAMANHO_MAXIMO = 256;

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

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}


Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);

    if (!identity) {
      return Response.json({ error: 'Não autenticado', success: false }, { status: 401 });
    }

    let body;
    try {
      body = await req.json();
    } catch (_) {
      return Response.json({ error: 'Corpo inválido', success: false }, { status: 400 });
    }

    const bruto = body?.revenuecat_user_id;
    if (typeof bruto !== 'string' || !bruto.trim()) {
      return Response.json(
        { error: 'revenuecat_user_id é obrigatório', success: false },
        { status: 400 }
      );
    }

    const rcId = bruto.trim();
    if (rcId.length > TAMANHO_MAXIMO) {
      return Response.json(
        { error: 'revenuecat_user_id inválido', success: false },
        { status: 400 }
      );
    }

    const email = normalizeEmail(identity.email);
    const accounts = await base44.asServiceRole.entities.Account.filter({ email });
    const account = accounts && accounts.length > 0 ? accounts[0] : null;

    if (!account) {
      return Response.json(
        { error: 'Conta não encontrada para este usuário', code: 'account_not_found', success: false },
        { status: 404 }
      );
    }

    // Aparelho já identificado como nós: não há mapeamento a guardar. Acontece
    // com quem comprou pelo app antes — o external_id foi enviado na compra e o
    // RevenueCat já conhece a pessoa pelo Account.id.
    if (rcId === account.id) {
      return Response.json({ success: true, changed: false, reason: 'already_identified' });
    }

    // Idempotente. O app vai chamar isto em toda volta do resgate e a cada
    // restore; gravar de novo o mesmo valor seria escrita à toa.
    if (account.revenuecat_user_id === rcId) {
      return Response.json({ success: true, changed: false, reason: 'unchanged' });
    }

    // Troca de valor é normal (reinstalação, aparelho novo) e o último vale: a
    // assinatura segue o aparelho que tem o recibo. Fica no log porque, se um
    // dia uma renovação deixar de ser atribuída, é a primeira coisa a conferir.
    if (account.revenuecat_user_id) {
      console.log(
        `linkRevenueCatUser: ${email} troca ${account.revenuecat_user_id} -> ${rcId}`
      );
    }

    await base44.asServiceRole.entities.Account.update(account.id, {
      revenuecat_user_id: rcId
    });

    return Response.json({ success: true, changed: true });
  } catch (error) {
    console.error('Erro em linkRevenueCatUser:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
