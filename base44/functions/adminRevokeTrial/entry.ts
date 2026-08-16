import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// adminRevokeTrial — encerra uma cortesia antes do prazo.
// -----------------------------------------------------------------------------
// É o adminGrantTrial ao contrário: rebaixa a Account para 'free', limpa o
// trial_ends_at e carimba revoked_at nos TrialGrants que ainda estavam de pé.
//
// SÓ MEXE EM QUEM ESTÁ EM CORTESIA. Se `trial_ends_at` estiver vazio, o premium
// daquela conta é pago (ou não existe), e esta function recusa em vez de
// rebaixar. Rebaixar assinante é trabalho do adminSetSubscription, onde está
// escrito na tela o que o botão faz.
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

    const { user_email } = await req.json();

    if (!user_email) {
      return Response.json({ error: 'Parâmetro: user_email', success: false }, { status: 400 });
    }

    const email = String(user_email).trim().toLowerCase();
    const contas = await base44.asServiceRole.entities.Account.filter({ email });

    if (contas.length === 0) {
      return Response.json({ error: 'Conta não encontrada', success: false }, { status: 404 });
    }

    const conta = contas[0];

    if (!conta.trial_ends_at) {
      return Response.json(
        {
          error: 'Esta conta não está em cortesia. Se o objetivo é remover um premium pago, use a tela de usuários.',
          code: 'sem_cortesia',
          success: false
        },
        { status: 409 }
      );
    }

    const agora = new Date();

    // INVARIANTE lifetime_access
    // Quem tem lifetime_access NUNCA é escrito como 'free'. subscription_type é
    // o que CONCEDE o acesso — todas as telas do app checam 'premium' e nenhuma
    // sabe o que é vitalício. lifetime_access não concede nada: ele só impede o
    // rebaixamento. É a combinação dos dois que sustenta o vitalício sem tocar
    // em nenhuma tela.
    //
    // Aqui isso importa porque a ordem "ganhou cortesia, depois comprou o
    // vitalício" deixa a conta com as duas marcas se o caminho da compra falhar
    // em limpar o trial. Revogar a cortesia então tiraria o acesso permanente
    // de alguém que pagou por ele.
    const vitalicio = conta.lifetime_access === true;

    // INVARIANTE trial_ends_at
    // Este é o caminho que APAGA a cortesia de propósito — o único em que
    // remover a marca é o objetivo, e não um efeito colateral a lembrar. As duas
    // marcas saem juntas do estado da conta; o que sobra do trial vira história
    // nos TrialGrants logo abaixo.
    await base44.asServiceRole.entities.Account.update(conta.id, {
      ...(vitalicio ? {} : { subscription_type: 'free' }),
      // O trial_ends_at sai NOS DOIS CASOS. Ele é a marca de "este premium
      // vence": deixá-la num vitalício é deixar armada a expiração preguiçosa
      // do getMyAccount contra a conta errada.
      trial_ends_at: null,
      trial_started_at: null
    });

    if (vitalicio) {
      console.log('🔒 INVARIANTE lifetime_access: rebaixamento ignorado para', email);
    }

    // Marca os grants que ainda estavam de pé. São vários quando houve
    // extensão: uma revogação encerra a cortesia inteira, não uma parcela dela.
    const grants = await base44.asServiceRole.entities.TrialGrant.filter({ user_email: email });
    const abertos = grants.filter(g => !g.revoked_at && new Date(g.expires_at) > agora);
    for (const g of abertos) {
      await base44.asServiceRole.entities.TrialGrant.update(g.id, {
        revoked_at: agora.toISOString(),
        revoked_by: identity.email
      });
    }

    console.log('adminRevokeTrial:', email, '- grants encerrados:', abertos.length, 'por', identity.email);

    return Response.json({
      success: true,
      user_email: email,
      rebaixado: !vitalicio,
      grants_revogados: abertos.length
    });
  } catch (error) {
    console.error('Erro em adminRevokeTrial:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
