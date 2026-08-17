import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// auditTrialInvariants — procura contas em estado que não deveria existir.
// -----------------------------------------------------------------------------
// É SÓ LEITURA. Não faz create/update/delete em nenhuma entidade, sob nenhuma
// condição — mesma postura do auditUserAccountSync, e pela mesma razão: uma
// ferramenta de auditoria que escreve vira ferramenta de estrago no dia em que a
// premissa dela envelhecer (ver ARQUITETURA_AUTH.md §5.6).
//
// POR QUE ELA EXISTE
//
// As barreiras que protegem o assinante pagante são disciplina de código:
// cinco caminhos que precisam lembrar de limpar `trial_ends_at`, mais dois que
// precisam concordar sobre quando rebaixar. Disciplina de código falha em
// silêncio — o caminho novo que ninguém lembrou de ajustar não acusa erro, ele
// só produz um estado errado que ninguém olha.
//
// Esta function olha. Ela não previne nada: ela transforma "um assinante vai ser
// rebaixado daqui a 20 dias e ninguém sabe" em uma linha vermelha na tela de
// cortesias, hoje.
//
// CADA ACHADO É UM ESTADO IMPOSSÍVEL, não um alerta de rotina. Lista vazia é o
// resultado esperado, sempre.
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

async function listAll(entities, entityName) {
  const batchSize = 500;
  let skip = 0;
  let all = [];
  while (true) {
    const batch = await entities[entityName].list(null, batchSize, skip);
    if (!batch || batch.length === 0) break;
    all = all.concat(batch);
    if (batch.length < batchSize) break;
    skip += batchSize;
  }
  return all;
}

function data(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const identity = await resolveIdentity(req, base44);

    if (!identity || identity.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const agora = new Date();
    const contas = await listAll(base44.asServiceRole.entities, 'Account');
    const grants = await listAll(base44.asServiceRole.entities, 'TrialGrant');
    const pagamentos = await listAll(base44.asServiceRole.entities, 'Payment');

    const pagosPorEmail = new Map();
    for (const p of pagamentos) {
      if (p.status !== 'PAID') continue;
      const chave = (p.user_email || '').trim().toLowerCase();
      if (!chave) continue;
      const quando = data(p.paid_at) || data(p.created_date);
      if (!quando) continue;
      const atual = pagosPorEmail.get(chave);
      if (!atual || quando > atual) pagosPorEmail.set(chave, quando);
    }

    const comGrant = new Set(
      grants.map(g => (g.user_email || '').trim().toLowerCase()).filter(Boolean)
    );

    const achados = [];
    const registrar = (severidade, tipo, conta, detalhe) => {
      achados.push({
        severidade,
        tipo,
        user_email: conta.email || null,
        subscription_type: conta.subscription_type || null,
        trial_ends_at: conta.trial_ends_at || null,
        detalhe
      });
    };

    for (const conta of contas) {
      const email = (conta.email || '').trim().toLowerCase();
      const fim = data(conta.trial_ends_at);
      const inicio = data(conta.trial_started_at);
      const temMarca = !!conta.trial_ends_at;

      // ── CRÍTICO: alguém pagou e está com marca de cortesia ────────────────
      // Este é O estado perigoso. Significa que a barreira primária falhou: um
      // caminho de promoção por pagamento não limpou trial_ends_at, e no dia do
      // vencimento a expiração vai rebaixar quem paga. A segunda barreira
      // (subscription_start_date posterior ao trial_started_at) pode salvar,
      // mas ela não cobre o syncStoreSubscription — ver o comentário lá.
      if (temMarca && pagosPorEmail.has(email)) {
        const pagouEm = pagosPorEmail.get(email);
        if (!inicio || pagouEm > inicio) {
          registrar(
            'critico',
            'pagamento_com_marca_de_cortesia',
            conta,
            `Há Payment PAID em ${pagouEm.toISOString().slice(0, 10)} e a conta ainda tem trial_ends_at. ` +
            `Se a marca não sair, o vencimento rebaixa um pagante. Limpar com a tela de usuários (Ativar Premium) resolve.`
          );
        }
      }

      // ── CRÍTICO: cortesia armada contra vitalício ─────────────────────────
      if (temMarca && conta.lifetime_access === true) {
        registrar(
          'critico',
          'cortesia_em_vitalicio',
          conta,
          'Conta vitalícia com trial_ends_at preenchido. A concessão recusa vitalício e a compra limpa a marca — este estado não deveria existir.'
        );
      }

      // ── CRÍTICO: viola o invariante 8 (herdado, mesma varredura) ──────────
      if (conta.lifetime_access === true && conta.subscription_type === 'free') {
        registrar(
          'critico',
          'vitalicio_rebaixado',
          conta,
          'lifetime_access true com subscription_type free: alguém pagou pelo acesso permanente e não tem acesso. Ver INVARIANTE lifetime_access.'
        );
      }

      // ── ATENÇÃO: marca órfã em conta sem acesso ───────────────────────────
      // Não tira acesso de ninguém, mas mente na listagem e fica armada caso a
      // conta volte a premium por outro caminho.
      if (temMarca && conta.subscription_type === 'free') {
        registrar(
          'atencao',
          'marca_orfa',
          conta,
          'trial_ends_at preenchido numa conta free. Rodar "Encerrar vencidos" limpa.'
        );
      }

      // ── ATENÇÃO: cortesia sem registro de concessão ───────────────────────
      // A marca só deveria nascer no adminGrantTrial, que sempre cria o
      // TrialGrant junto. Sem grant, alguém escreveu na Account por fora.
      if (temMarca && !comGrant.has(email)) {
        registrar(
          'atencao',
          'cortesia_sem_grant',
          conta,
          'Conta com trial_ends_at e nenhum TrialGrant. A marca foi escrita fora do adminGrantTrial.'
        );
      }

      // ── INFO: expiração pendente ──────────────────────────────────────────
      // Benigno e esperado: quem venceu e não voltou ao app. Não custa acesso a
      // ninguém, só desatualiza relatório.
      if (fim && fim <= agora) {
        registrar(
          'info',
          'expiracao_pendente',
          conta,
          'Cortesia vencida ainda marcada. O acesso já acabou (getMyAccount encerra no próximo login); é só o registro.'
        );
      }
    }

    // ── ATENÇÃO: grant ativo sem acesso do outro lado ────────────────────────
    // Cortesia em vigor no histórico, mas a conta não está premium: alguém
    // rebaixou por fora (tela de usuários, webhook de expiração antigo).
    const contasPorEmail = new Map();
    for (const c of contas) {
      const chave = (c.email || '').trim().toLowerCase();
      if (chave) contasPorEmail.set(chave, c);
    }
    for (const g of grants) {
      const email = (g.user_email || '').trim().toLowerCase();
      const expira = data(g.expires_at);
      if (!email || !expira || g.revoked_at || expira <= agora) continue;
      const conta = contasPorEmail.get(email);
      if (!conta) continue;
      if (conta.subscription_type !== 'premium') {
        registrar(
          'atencao',
          'grant_ativo_sem_acesso',
          conta,
          `TrialGrant válido até ${expira.toISOString().slice(0, 10)}, mas a conta não está premium. Alguém rebaixou por fora.`
        );
      }
    }

    const criticos = achados.filter(a => a.severidade === 'critico').length;

    console.log(
      'auditTrialInvariants:', achados.length, 'achado(s),',
      criticos, 'crítico(s), por', identity.email
    );

    return Response.json({
      success: true,
      verificado_em: agora.toISOString(),
      contas_analisadas: contas.length,
      resumo: {
        criticos,
        atencao: achados.filter(a => a.severidade === 'atencao').length,
        info: achados.filter(a => a.severidade === 'info').length
      },
      achados
    });
  } catch (error) {
    console.error('Erro em auditTrialInvariants:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
