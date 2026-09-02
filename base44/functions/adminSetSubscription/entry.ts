import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// adminSetSubscription
// -----------------------------------------------------------------------------
// Substitui a escrita que o AdminUsers.jsx fazia direto do frontend:
//   base44.entities.User.update(user.id, { subscription_type: 'free' })
//
// Depois do corte isso não funciona mais. A Account tem `update` restrito a
// `__service_only__` no RLS, então nem admin a altera pelo cliente — a escrita
// precisa passar por uma function com service role.
//
// Aceita 'free' e 'premium'. O caminho para 'premium' já existia em
// manuallyUpgradeToPremium; aqui ele fica junto do rebaixamento para que a tela
// admin tenha um único ponto de escrita de assinatura.
//
// NÃO mexe em Payment. Rebaixar alguém aqui não cancela cobrança nenhuma no
// Stripe nem na App Store — é ajuste do nosso registro, e cancelar de verdade
// continua sendo cancelStripeSubscription ou a própria loja. Misturar as duas
// coisas num botão de admin criaria a ilusão de que clicar resolve a cobrança.
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

    if (!identity || identity.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { user_email, subscription_type } = await req.json();

    if (!user_email || !['free', 'premium'].includes(subscription_type)) {
      return Response.json(
        { error: 'Parâmetros: user_email e subscription_type ("free" | "premium")', success: false },
        { status: 400 }
      );
    }

    const email = user_email.trim().toLowerCase();
    const contas = await base44.asServiceRole.entities.Account.filter({ email });

    if (contas.length === 0) {
      return Response.json({ error: 'Conta não encontrada', success: false }, { status: 404 });
    }

    // INVARIANTE trial_ends_at
    // As duas direções limpam a marca de cortesia, por motivos opostos:
    //   - ao PROMOVER, o premium desta tela não tem prazo; deixar a marca faria
    //     o getMyAccount desfazer o clique na data em que o trial venceria;
    //   - ao REBAIXAR, o acesso acabou agora; deixar a marca é deixar armada
    //     uma expiração para uma cortesia que não existe mais.
    // INVARIANTE store_expires_at
    // Some nas duas direções, pelos mesmos motivos opostos: ao PROMOVER, este
    // premium é da mão do admin e não tem prazo de loja; ao REBAIXAR, o acesso
    // já acabou e a data seria uma expiração armada contra uma assinatura que
    // não concede mais nada.
    const updates = {
      subscription_type,
      trial_ends_at: null,
      trial_started_at: null,
      store_expires_at: null
    };
    // Só carimba a data ao PROMOVER. Ao rebaixar, preservamos a data original:
    // ela é histórico de quando a assinatura começou, e zerá-la apagaria a única
    // pista de quanto tempo a pessoa foi premium.
    if (subscription_type === 'premium') {
      updates.subscription_start_date = new Date().toISOString();
    }

    await base44.asServiceRole.entities.Account.update(contas[0].id, updates);

    console.log('adminSetSubscription:', email, '->', subscription_type, 'por', identity.email);

    return Response.json({ success: true, user_email: email, subscription_type });
  } catch (error) {
    console.error('Erro em adminSetSubscription:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
