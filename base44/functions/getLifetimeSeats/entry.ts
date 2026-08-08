import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// getLifetimeSeats
// -----------------------------------------------------------------------------
// Devolve APENAS quantas vagas do plano vitalício ainda restam.
//
// Deliberadamente não devolve quantas foram vendidas, nem quem comprou, nem o
// limite: a página de venda só precisa saber se ainda dá para comprar e quantas
// sobram. O total vendido é informação comercial e não tem por que sair do
// backend.
//
// Exige sessão pela mesma razão: a oferta é privada, alcançável só por link
// direto, e a página que consome isto já exige login. Sem a exigência aqui,
// este endpoint viraria um contador público de vendas.
//
// A contagem NÃO é atômica e não há como torná-la com o SDK do Base44 (sem
// update condicional, sem unicidade, sem transação). Ver o comentário de vagas
// no createStripeCheckout: a trava vive na criação da session e aceita vender
// além do limite sob concorrência, porque o webhook nunca nega acesso.
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
      return Response.json({ error: 'Não autenticado', success: false }, { status: 401 });
    }

    // Cópia inline de LIFETIME_VAGAS_PADRAO (base44/shared/plans.ts).
    const LIFETIME_VAGAS = Number(Deno.env.get('LIFETIME_VAGAS') ?? 100);

    // O limite é 100 e o teto do filter é 5000: a lista cabe inteira com folga
    // de duas ordens de grandeza. `fields: ['id']` para não trazer a Account
    // completa de cada comprador só para contar linhas.
    const vitalicios = await base44.asServiceRole.entities.Account.filter(
      { lifetime_access: true }, '-created_date', 5000, 0, ['id']
    );

    // Nunca negativo: vender além do limite é possível por desenho (o webhook
    // não nega vaga esgotada), e um "-2 vagas restantes" na tela seria absurdo.
    const restantes = Math.max(0, LIFETIME_VAGAS - vitalicios.length);

    return Response.json({ success: true, restantes });
  } catch (error) {
    console.error('Erro em getLifetimeSeats:', error.message);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
