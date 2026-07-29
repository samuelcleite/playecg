import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe@17.5.0';

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

// Lojas de billing nativo: só o próprio usuário cancela, dentro da loja — nunca via servidor.
const STORE_SUBS = ['app_store', 'play_store'];
// Lojas do RevenueCat que NÃO exigem cancelamento na loja: Stripe (cancelável via API,
// aqui tratado à parte) e promotional (cortesia, não cobra). Qualquer outra loja resolvida
// é tratada como billing de loja e bloqueia.
const NON_STORE = ['stripe', 'promotional'];

// Consulta UM app_user_id no RevenueCat. Retorna:
//   { error: true }                    -> incerteza (fail closed)
//   { active: true }                   -> entitlement de loja ativo
//   { active: false, historico: bool } -> sem entitlement ativo; `historico` diz se o
//                                         RevenueCat conhece esse id de alguma forma.
// `historico` é o que distingue "nunca comprou" de "id errado": o GET /v1/subscribers é
// "get-or-create", então um id errado mas bem-formado devolve 200/201 com um subscriber
// VAZIO. Quem decide o que fazer com isso é checkActiveStoreSubscription.
async function checkOneSubscriber(appUserId) {
    const apiKey = Deno.env.get('REVENUECAT_SECRET_KEY');
    if (!apiKey) {
        console.error('deleteUserAccount: REVENUECAT_SECRET_KEY ausente');
        return { error: true };
    }

    let resp;
    try {
        resp = await fetch(
            `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
            { headers: { Authorization: `Bearer ${apiKey}` } }
        );
    } catch (e) {
        console.error('deleteUserAccount: falha de rede ao consultar RevenueCat:', e.message);
        return { error: true };
    }

    // GET é "get-or-create": 200 (existente) ou 201 (criado vazio) são OK. Outro status = incerteza.
    if (resp.status !== 200 && resp.status !== 201) {
        console.error('deleteUserAccount: RevenueCat status inesperado:', resp.status);
        return { error: true };
    }

    let body;
    try {
        body = await resp.json();
    } catch (e) {
        console.error('deleteUserAccount: JSON inválido do RevenueCat:', e.message);
        return { error: true };
    }

    const subscriber = body?.subscriber || {};
    const entitlements = subscriber.entitlements || {};
    const subscriptions = subscriber.subscriptions || {};
    const now = Date.now();

    for (const ent of Object.values(entitlements)) {
        // Ativo: sem expiração (vitalício) OU expiração no futuro.
        const exp = ent?.expires_date;
        const isActive = exp == null || new Date(exp).getTime() > now;
        if (!isActive) continue;

        // Entitlement ATIVO: a loja vem da subscription vinculada pelo product_identifier.
        const sub = subscriptions[ent?.product_identifier];
        const store = sub?.store;

        if (typeof store !== 'string' || store.length === 0) {
            // Ativo mas loja indeterminável → FAIL CLOSED (não liberar exclusão).
            console.error('deleteUserAccount: entitlement ativo sem store resolvível:', ent?.product_identifier);
            return { error: true };
        }
        if (NON_STORE.includes(store)) {
            continue; // Stripe/promotional: não bloqueia por este entitlement.
        }
        if (sub.unsubscribe_detected_at) {
            // Renovação já desligada na loja: sem cobrança futura → a justificativa do
            // bloqueio evapora. Deixa passar (não trava a conta até a expiração).
            continue;
        }
        // app_store, play_store, ou qualquer outra loja nativa resolvida, com renovação
        // ainda ativa → bloquear.
        return { active: true };
    }

    // Nenhum entitlement de loja ativo para este id.
    const historico =
        Object.keys(entitlements).length > 0 ||
        Object.keys(subscriptions).length > 0 ||
        Object.keys(subscriber.non_subscriptions || {}).length > 0;

    return { active: false, historico };
}

// Consulta TODOS os ids sob os quais este usuário pode ter comprado.
//
// Por que mais de um: o app_user_id do RevenueCat foi historicamente o User.id do Base44
// e passa a ser o Account.id depois do corte do AuthContext. Durante a transição as duas
// coisas coexistem — compra feita antes está gravada sob um id, compra feita depois sob o
// outro — e o RevenueCat não oferece alias pelo caminho que o Despia expõe (só
// revenuecat://purchase, launchPaywall e getpurchasehistory://). Então a única saída
// correta é perguntar por todos os ids candidatos.
//
// FAIL CLOSED em três situações:
//   - qualquer consulta incerta (rede, status, JSON, loja indeterminável);
//   - qualquer id com entitlement de loja ativo;
//   - existe compra de App Store nos nossos registros e NENHUM dos ids é conhecido pelo
//     RevenueCat — sinal de que estamos perguntando pelo id errado, não de que não há
//     assinatura. Sem isso, esta função autorizaria excluir conta com assinatura ATIVA.
async function checkActiveStoreSubscription(appUserIds, hadStorePurchase) {
    const apiKey = Deno.env.get('REVENUECAT_SECRET_KEY');
    if (!apiKey) {
        console.error('deleteUserAccount: REVENUECAT_SECRET_KEY ausente');
        return { error: true };
    }

    const ids = [...new Set((appUserIds || []).filter(Boolean))];
    if (ids.length === 0) {
        // Sem nenhum id para consultar não dá para afirmar nada.
        console.error('deleteUserAccount: nenhum app_user_id candidato para consultar');
        return { error: true };
    }

    let algumHistorico = false;
    for (const id of ids) {
        const r = await checkOneSubscriber(id);
        if (r.error) return { error: true };
        if (r.active) return { active: true };
        if (r.historico) algumHistorico = true;
    }

    if (hadStorePurchase && !algumHistorico) {
        console.error(
            'deleteUserAccount: existe Payment de App Store mas o RevenueCat não conhece nenhum dos ids:',
            ids.join(', ')
        );
        return { error: true };
    }

    return { active: false };
}

// Cancela a assinatura Stripe se houver uma viva. Robusto a ponteiros obsoletos:
// sub inexistente (resource_missing) ou em status terminal → sucesso (nada a cobrar).
// Falha real (rede/auth/Stripe ao cancelar uma sub viva) → { ok: false } para abortar.
async function cancelStripeIfActive(base44, userEmail) {
    const payments = await base44.asServiceRole.entities.Payment.filter({
        user_email: userEmail,
        status: 'PAID'
    });

    const stripePayment = payments
        .filter(p => p.stripe_subscription_id)
        .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];

    if (!stripePayment || !stripePayment.stripe_subscription_id) {
        return { ok: true }; // nada de Stripe a cancelar
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
    const subId = stripePayment.stripe_subscription_id;
    const TERMINAL = ['canceled', 'incomplete_expired'];

    let sub;
    try {
        sub = await stripe.subscriptions.retrieve(subId);
    } catch (e) {
        // Sub não existe mais no Stripe (ponteiro obsoleto) → seguir com a exclusão.
        if (e?.code === 'resource_missing' || e?.statusCode === 404) {
            return { ok: true };
        }
        console.error('deleteUserAccount: falha ao consultar Stripe:', e.message);
        return { ok: false };
    }

    if (TERMINAL.includes(sub.status)) {
        return { ok: true }; // já encerrada, nada a cobrar
    }

    try {
        await stripe.subscriptions.cancel(subId); // imediato (reusa o comportamento atual)
    } catch (e) {
        console.error('deleteUserAccount: falha ao cancelar Stripe:', e.message);
        return { ok: false };
    }

    return { ok: true };
}

// Apaga TODAS as linhas que casam com o filtro, drenando em lotes até esgotar.
// Não assume que .filter() devolve todas as linhas de uma vez: re-consulta do topo após
// cada lote (as linhas já apagadas não voltam), até uma consulta retornar zero. Correto
// independentemente de haver ou não limite de paginação default no backend.
// Teto de iterações converte um eventual hang (delete que "sucede" sem apagar) em erro
// diagnosticável em vez de travar a função até o timeout.
async function deleteAll(base44, entityName, filter) {
    const MAX_PASSES = 100;
    for (let pass = 0; pass < MAX_PASSES; pass++) {
        const rows = await base44.asServiceRole.entities[entityName].filter(filter);
        if (!rows || rows.length === 0) return;
        for (const row of rows) {
            await base44.asServiceRole.entities[entityName].delete(row.id);
        }
    }
    throw new Error(`deleteAll(${entityName}): excedeu ${MAX_PASSES} passagens sem esgotar as linhas`);
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const identity = await resolveIdentity(req, base44);

        if (!identity) {
            return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const userEmail = (identity.email || '').trim().toLowerCase();

        // A linha User pode não existir (usuário JWT-nativo, criado depois do corte).
        // Tudo o que depende dela — o User.id como app_user_id histórico no RevenueCat,
        // as PushSubscription antigas chaveadas por user_id, e o delete final — passa a
        // ser condicional. `user` nulo é um estado esperado, não um erro.
        const users = await base44.asServiceRole.entities.User.filter({ email: userEmail });
        const user = users && users.length > 0 ? users[0] : null;

        // 1) Assinatura de loja ativa → BLOQUEAR antes de apagar qualquer coisa.
        // Sinal local de compra na loja: só o revenuecatWebhook cria Payment com este
        // payment_method. Deliberadamente NÃO usamos subscription_type === 'premium' aqui:
        // assinante de Stripe e upgrade manual também são premium e nunca existiram no
        // RevenueCat — bloqueá-los quebraria a exclusão de conta exigida pela Apple.
        const storePayments = await base44.asServiceRole.entities.Payment.filter({
            user_email: userEmail,
            payment_method: 'APP_STORE_SUBSCRIPTION'
        });
        // Ids candidatos no RevenueCat: o User.id (usado por toda compra até hoje) e o
        // Account.id (usado depois do corte do AuthContext). Consultar os dois cobre a
        // transição inteira sem depender de qual fase estamos.
        const contas = await base44.asServiceRole.entities.Account.filter({
            email: (userEmail || '').trim().toLowerCase()
        });
        const accountId = contas && contas.length > 0 ? contas[0].id : null;

        const storeCheck = await checkActiveStoreSubscription(
            [user?.id, accountId],
            storePayments.length > 0
        );
        if (storeCheck.error) {
            // FAIL CLOSED: não conseguimos verificar → não excluir.
            return Response.json({
                success: false,
                code: 'store_check_failed',
                error: 'Não foi possível verificar sua assinatura agora. Nenhum dado foi excluído. Tente novamente em instantes.'
            });
        }
        if (storeCheck.active) {
            return Response.json({
                success: false,
                code: 'store_subscription_active',
                error: 'Cancele sua assinatura na App Store / Google Play antes de excluir a conta.'
            });
        }

        // 2) Cancelar Stripe (se houver) ANTES de apagar Payment.
        const stripeResult = await cancelStripeIfActive(base44, userEmail);
        if (!stripeResult.ok) {
            return Response.json({
                success: false,
                code: 'stripe_cancel_failed',
                error: 'Não foi possível cancelar sua assinatura agora. Nenhum dado foi excluído. Tente novamente em instantes.'
            });
        }

        // 3) A partir daqui, apagar. Filhos primeiro, registro do usuário por último:
        // uma falha parcial deixa apenas dados órfãos benignos e a conta ainda
        // autenticável para retry.
        await deleteAll(base44, 'QuizAttempt', { user_email: userEmail });
        await deleteAll(base44, 'DailyQuizStats', { user_email: userEmail });
        await deleteAll(base44, 'CouponUsage', { user_email: userEmail });
        await deleteAll(base44, 'UserProgress', { user_email: userEmail });
        await deleteAll(base44, 'UserAchievement', { user_email: userEmail });
        await deleteAll(base44, 'PushSubscription', { user_email: userEmail });
        // Payment por último entre os filhos: só depois do cancelamento do Stripe.
        await deleteAll(base44, 'Payment', { user_email: userEmail });

        // CORTE: a Account é o registro do usuário, então é ela que morre — e é ela
        // que carrega as credenciais (google_id/apple_id). Enquanto a Account existir,
        // um novo login com o mesmo Google/Apple reencontraria a conta "excluída".
        //
        // A linha User é apagada TAMBÉM, quando existe: ela é resquício da migração e
        // deixá-la para trás faria um futuro backfillAccountFromUser ressuscitar a
        // Account a partir dela. Ordem: Account primeiro (é o que trava o relogin),
        // User depois — se a segunda falhar, sobrou um registro inerte que nada lê.
        if (accountId) {
            await base44.asServiceRole.entities.Account.delete(accountId);
        }
        if (user) {
            await base44.asServiceRole.entities.User.delete(user.id);
        }

        return Response.json({ success: true });
    } catch (error) {
        console.error('Error deleting account:', error);
        return Response.json({
            success: false,
            error: error.message || 'Erro ao deletar conta'
        }, { status: 500 });
    }
});
