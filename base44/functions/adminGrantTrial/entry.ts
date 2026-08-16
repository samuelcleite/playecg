import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// adminGrantTrial — concede acesso premium por tempo limitado.
// -----------------------------------------------------------------------------
// Escreve DUAS coisas, sempre juntas:
//   1. Account: subscription_type='premium' + trial_ends_at=<vencimento>.
//      É isto que dá o acesso. Todas as telas checam subscription_type e
//      nenhuma sabe o que é um trial.
//   2. TrialGrant: a linha de histórico. Não concede nada, serve para saber
//      quem deu, por quê, e se a pessoa acabou comprando.
//
// QUEM PODE RECEBER
//
// Só quem está 'free' e sem vitalício. As duas recusas existem pela mesma
// razão, e é a razão mais importante desta feature inteira: `trial_ends_at`
// marca a conta como "este premium vence". Carimbá-lo em quem PAGOU faria a
// expiração preguiçosa do getMyAccount rebaixar um assinante no dia do
// vencimento — o mesmo acidente que o lifetime_access existe para evitar, por
// um caminho novo. Ver INVARIANTE trial_ends_at.
//
// A exceção é quem já está em cortesia: aí o premium também é nosso, e a
// concessão vira extensão do prazo em vez de recusa.
//
// O QUE ELE NÃO TOCA
//
// `subscription_start_date` fica como está. O campo significa "início da
// assinatura premium", e cortesia não é assinatura: carimbá-lo apagaria a data
// real de quem já assinou antes e faria o getUserSubscriptionInfo anunciar uma
// renovação que não existe.
// -----------------------------------------------------------------------------

// Teto de 365 dias. Não é regra de negócio, é limite de dedo escorregado: um
// zero a mais em "30" vira acesso permanente concedido por engano, e não existe
// nenhum caso de uso de cortesia que passe de um ano.
const DIAS_MAX = 365;

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

    const { user_email, days, reason } = await req.json();

    const dias = Number(days);
    if (!user_email || !Number.isInteger(dias) || dias < 1 || dias > DIAS_MAX) {
      return Response.json(
        {
          error: `Parâmetros: user_email e days (inteiro de 1 a ${DIAS_MAX})`,
          success: false
        },
        { status: 400 }
      );
    }

    const email = String(user_email).trim().toLowerCase();
    const contas = await base44.asServiceRole.entities.Account.filter({ email });

    if (contas.length === 0) {
      // Não criamos a conta aqui. Cortesia para quem ainda não se cadastrou não
      // teria onde pousar — a Account nasce no primeiro login, com o google_id
      // ou apple_id que só o fluxo de sign-in conhece.
      return Response.json(
        {
          error: 'Nenhuma conta com esse e-mail. O usuário precisa ter entrado no app ao menos uma vez.',
          code: 'account_not_found',
          success: false
        },
        { status: 404 }
      );
    }

    const conta = contas[0];
    const agora = new Date();

    if (conta.lifetime_access === true) {
      return Response.json(
        {
          error: 'Esta conta tem acesso vitalício — cortesia não acrescenta nada.',
          code: 'lifetime',
          success: false
        },
        { status: 409 }
      );
    }

    // Cortesia em curso? A data no futuro é o que distingue "premium nosso" de
    // "premium pago". Uma data vencida não conta: quem está premium com trial
    // vencido é alguém que a expiração preguiçosa ainda não alcançou, e o
    // tratamento correto é o mesmo do free.
    const fimAtual = conta.trial_ends_at ? new Date(conta.trial_ends_at) : null;
    const emCortesia = !!(fimAtual && !isNaN(fimAtual.getTime()) && fimAtual > agora);

    // INVARIANTE trial_ends_at
    // Premium SEM trial_ends_at no futuro é premium pago, e pagante não recebe
    // cortesia: o carimbo faria o getMyAccount rebaixá-lo quando a data chegar.
    // Estender o acesso de quem paga não é caso de uso — se um dia for, o
    // caminho é outro campo, não este.
    if (conta.subscription_type === 'premium' && !emCortesia) {
      return Response.json(
        {
          error: 'Esta conta já é premium por assinatura paga. Conceder cortesia aqui faria o acesso dela vencer.',
          code: 'ja_premium',
          success: false
        },
        { status: 409 }
      );
    }

    // Extensão soma ao prazo que ainda resta, em vez de reiniciar a partir de
    // hoje: quem tem 3 dias restantes e ganha mais 7 fica com 10, não com 7.
    const base = emCortesia ? fimAtual : agora;
    const fimNovo = new Date(base.getTime() + dias * 24 * 60 * 60 * 1000);

    await base44.asServiceRole.entities.Account.update(conta.id, {
      // subscription_type é o que CONCEDE o acesso; trial_ends_at é só o prazo.
      subscription_type: 'premium',
      trial_ends_at: fimNovo.toISOString(),
      // A extensão preserva o início da cortesia original: o campo marca desde
      // quando esta conta está em cortesia, e é com ele que os caminhos de
      // expiração descobrem se um pagamento veio depois.
      trial_started_at: emCortesia
        ? (conta.trial_started_at || agora.toISOString())
        : agora.toISOString()
      // subscription_start_date NÃO entra aqui. Ver cabeçalho.
    });

    await base44.asServiceRole.entities.TrialGrant.create({
      user_email: email,
      // Da IDENTIDADE, nunca do corpo: o autor de uma concessão é a única coisa
      // que o registro de auditoria não pode aceitar do cliente.
      granted_by: identity.email,
      granted_at: agora.toISOString(),
      expires_at: fimNovo.toISOString(),
      days: dias,
      reason: (reason || '').trim(),
      kind: emCortesia ? 'extension' : 'grant'
    });

    console.log(
      'adminGrantTrial:', email, '+', dias, 'dias ->', fimNovo.toISOString(),
      emCortesia ? '(extensão)' : '(nova)', 'por', identity.email
    );

    return Response.json({
      success: true,
      user_email: email,
      trial_ends_at: fimNovo.toISOString(),
      days: dias,
      extension: emCortesia
    });
  } catch (error) {
    console.error('Erro em adminGrantTrial:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
