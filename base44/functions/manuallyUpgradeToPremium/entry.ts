import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

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

        // Verificar se é admin
        const identity = await resolveIdentity(req, base44);
        if (!identity || identity.role !== 'admin') {
            return Response.json({
                error: 'Apenas administradores podem usar esta função',
                success: false
            }, { status: 403 });
        }

        const { user_email } = await req.json();

        if (!user_email) {
            return Response.json({ 
                error: 'Email do usuário é obrigatório',
                success: false 
            }, { status: 400 });
        }

        console.log('👤 Upgrading user to premium manually:', user_email);

        // CORTE: o registro do usuário é a Account.
        const contas = await base44.asServiceRole.entities.Account.filter({
            email: (user_email || '').trim().toLowerCase()
        });

        if (contas.length === 0) {
            return Response.json({
                error: 'Usuário não encontrado',
                success: false
            }, { status: 404 });
        }

        const user = contas[0];

        // Atualizar para premium
        await base44.asServiceRole.entities.Account.update(user.id, {
            subscription_type: 'premium',
            subscription_start_date: new Date().toISOString()
        });

        console.log('✅ User upgraded successfully:', user_email);

        return Response.json({
            success: true,
            message: `Usuário ${user_email} foi atualizado para Premium com sucesso`,
            user: {
                email: user.email,
                full_name: user.full_name,
                subscription_type: 'premium',
                subscription_start_date: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('💥 Error upgrading user:', error.message);
        console.error('💥 Stack trace:', error.stack);
        return Response.json({ 
            error: 'Erro ao atualizar usuário: ' + error.message,
            success: false
        }, { status: 500 });
    }
});