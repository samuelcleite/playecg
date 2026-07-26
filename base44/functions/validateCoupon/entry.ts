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
        
        // Verificar autenticação (aceita JWT próprio ou sessão Base44)
        const identity = await resolveIdentity(req, base44);
        if (!identity) {
            return Response.json({
                error: 'Não autenticado',
                valid: false
            }, { status: 401 });
        }

        // Obter dados da requisição
        const { coupon_code, plan } = await req.json();

        if (!coupon_code || typeof coupon_code !== 'string') {
            return Response.json({ 
                error: 'Código do cupom inválido',
                valid: false 
            }, { status: 400 });
        }

        // Normalizar código (uppercase e trim)
        const normalizedCode = coupon_code.trim().toUpperCase();

        // Buscar cupom (conteúdo global, não per-user; asServiceRole é o padrão
        // do projeto e funciona no caminho JWT, onde não há sessão Base44/RLS).
        const coupons = await base44.asServiceRole.entities.Coupon.filter({
            code: normalizedCode
        });

        if (coupons.length === 0) {
            return Response.json({ 
                error: 'Cupom não encontrado',
                valid: false 
            });
        }

        const coupon = coupons[0];

        // Verificar se está ativo
        if (!coupon.active) {
            return Response.json({ 
                error: 'Cupom desativado',
                valid: false 
            });
        }

        // Verificar data de início
        if (coupon.valid_from) {
            const validFrom = new Date(coupon.valid_from);
            if (new Date() < validFrom) {
                return Response.json({ 
                    error: 'Cupom ainda não está válido',
                    valid: false 
                });
            }
        }

        // Verificar data de expiração
        if (coupon.valid_until) {
            const validUntil = new Date(coupon.valid_until);
            if (new Date() > validUntil) {
                return Response.json({ 
                    error: 'Cupom expirado',
                    valid: false 
                });
            }
        }

        // Verificar limite de uso total
        if (coupon.usage_limit !== null && coupon.usage_limit !== undefined) {
            if (coupon.used_count >= coupon.usage_limit) {
                return Response.json({ 
                    error: 'Cupom atingiu o limite de usos',
                    valid: false 
                });
            }
        }

        // Verificar se o usuário já usou este cupom (se for one_per_user)
        if (coupon.one_per_user) {
            // asServiceRole ignora RLS: filtro user_email obrigatório e vindo de
            // identity.email (NUNCA do body) para não vazar usos de outros usuários.
            const previousUsage = await base44.asServiceRole.entities.CouponUsage.filter({
                coupon_id: coupon.id,
                user_email: identity.email
            });

            if (previousUsage.length > 0) {
                return Response.json({ 
                    error: 'Você já utilizou este cupom',
                    valid: false 
                });
            }
        }

        const originalPrice = plan === 'annual' ? 499.00 : 59.00;
        let discountAmount = 0;
        
        if (coupon.discount_type === 'percentage') {
            discountAmount = (originalPrice * coupon.discount_value) / 100;
        } else if (coupon.discount_type === 'fixed') {
            discountAmount = coupon.discount_value;
        }

        // Garantir que o desconto não seja maior que o preço
        discountAmount = Math.min(discountAmount, originalPrice);
        const finalPrice = Math.max(0.01, originalPrice - discountAmount); // Mínimo R$ 0,01

        return Response.json({
            valid: true,
            coupon: {
                id: coupon.id,
                code: coupon.code,
                discount_type: coupon.discount_type,
                discount_value: coupon.discount_value,
                description: coupon.description
            },
            pricing: {
                original_price: originalPrice,
                discount_amount: discountAmount,
                final_price: finalPrice
            }
        });

    } catch (error) {
        console.error('Erro ao validar cupom:', error);
        return Response.json({ 
            error: 'Erro ao validar cupom: ' + error.message,
            valid: false 
        }, { status: 500 });
    }
});