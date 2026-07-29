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
//
// Além de { email, role, source }, devolve `record`: o registro do usuário de
// onde ler campos extras (subscription_type, points, full_name, city...).
//   source 'base44' → record = retorno de base44.auth.me() (o User inteiro).
//   source 'jwt'    → record = a Account daquele email (via asServiceRole).
// LER de qualquer um dos dois é seguro durante a transição, porque ninguém
// escreve na Account — ela nunca diverge do User. Toda ESCRITA continua indo
// para o User. role nunca vem do record: é sempre 'user' no caminho JWT.
// JWT válido sem Account correspondente → null (sem fallback para sessão).
async function resolveIdentity(req, base44) {
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const secret = Deno.env.get('JWT_SECRET');
    if (secret) {
      const token = authHeader.slice('Bearer '.length).trim();
      const payload = await verifyJwtHS256(token, secret);
      if (payload && payload.email) {
        const accounts = await base44.asServiceRole.entities.Account.filter({ email: payload.email });
        const record = accounts && accounts.length > 0 ? accounts[0] : null;
        if (!record) return null;
        return { email: payload.email, role: 'user', source: 'jwt', record };
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
    return { email: user.email, role: user.role, source: 'base44', record: user };
  }

  return null;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Verificar autenticação
        const identity = await resolveIdentity(req, base44);
        if (!identity) {
            return Response.json({
                error: 'Não autenticado',
                success: false
            }, { status: 401 });
        }
    // A ACCOUNT é o registro do usuário, sempre. NÃO usar identity.record: ele é
    // o User quando a sessão é hospedada, e o User está CONGELADO desde o corte.
    // Ler dele faz o resultado depender de por onde a pessoa entrou no app, e
    // devolve estado que ninguém mais atualiza — foi assim que uma execução de
    // manutenção rebaixou dois assinantes para free.
    const contasDoUsuario = await base44.asServiceRole.entities.Account.filter({
        email: (identity.email || '').trim().toLowerCase()
    });
    const user = contasDoUsuario && contasDoUsuario.length > 0 ? contasDoUsuario[0] : {};
        const email = identity.email;

        console.log('🔍 Getting subscription info for user:', email);

        // Buscar pagamentos do usuário usando service role (sem restrições de RLS)
        const allPayments = await base44.asServiceRole.entities.Payment.list('-created_date');
        const userPayments = allPayments.filter(p => p.user_email === email);
        
        console.log('💳 Total payments in database:', allPayments.length);
        console.log('💳 User payments found:', userPayments.length);
        console.log('💳 User payments:', JSON.stringify(userPayments, null, 2));
        
        const paidPayments = userPayments.filter(p => p.status === 'PAID');
        console.log('✅ Paid payments:', paidPayments.length);

        if (paidPayments.length === 0) {
            console.log('⚠️ No PAID payments found');
            
            // Retornar informações básicas se for premium mas sem pagamento
            if (user.subscription_type === 'premium') {
                const startDate = user.subscription_start_date 
                    ? new Date(user.subscription_start_date)
                    : new Date(user.created_date);
                
                const nextRenewal = new Date(startDate);
                nextRenewal.setDate(nextRenewal.getDate() + 30);

                return Response.json({
                    success: true,
                    hasSubscription: true,
                    subscriptionInfo: {
                        amount: 59.00,
                        lastRenewal: startDate.toISOString(),
                        nextRenewal: nextRenewal.toISOString(),
                        paymentMethod: 'Manual',
                        paymentId: null
                    }
                });
            } else {
                return Response.json({
                    success: true,
                    hasSubscription: false
                });
            }
        }

        // Pegar o pagamento mais recente
        const latestPayment = paidPayments.sort((a, b) => 
            new Date(b.created_date) - new Date(a.created_date)
        )[0];

        console.log('📌 Latest payment:', JSON.stringify(latestPayment, null, 2));

        // Calcular próxima renovação
        const lastRenewal = new Date(latestPayment.paid_at || latestPayment.created_date);
        const nextRenewal = new Date(lastRenewal);
        const renewalDays = latestPayment.amount >= 400 ? 365 : 30;
        nextRenewal.setDate(nextRenewal.getDate() + renewalDays);

        // Detectar se é Stripe
        const isStripe = latestPayment.payment_method === 'STRIPE_SUBSCRIPTION' || !!latestPayment.stripe_subscription_id;
        // Assinaturas da App Store (RevenueCat) não têm stripe_subscription_id e
        // precisam ser distinguidas do fallback 'Manual', senão a tela de Perfil
        // manda o assinante falar com o suporte em vez de cancelar na Apple.
        const isAppStore = latestPayment.payment_method === 'APP_STORE_SUBSCRIPTION';
        const paymentId = latestPayment.stripe_subscription_id || null;

        const subscriptionInfo = {
            amount: latestPayment.amount,
            lastRenewal: lastRenewal.toISOString(),
            nextRenewal: nextRenewal.toISOString(),
            paymentMethod: isAppStore ? 'APP_STORE_SUBSCRIPTION' : (isStripe ? 'Stripe' : 'Manual'),
            paymentId: paymentId
        };

        console.log('✅ Returning subscription info:', subscriptionInfo);

        return Response.json({
            success: true,
            hasSubscription: true,
            subscriptionInfo
        });

    } catch (error) {
        console.error('💥 Error getting subscription info:', error.message);
        console.error('Stack:', error.stack);
        return Response.json({ 
            error: error.message,
            success: false 
        }, { status: 500 });
    }
});