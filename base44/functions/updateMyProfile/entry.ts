import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// updateMyProfile
// -----------------------------------------------------------------------------
// Substitui os DOIS pontos em que o frontend escreve no registro do usuário
// direto pela sessão Base44, e que não sobrevivem ao JWT (não há sessão para o
// SDK ler):
//   - CompleteProfile.jsx -> User.updateMyUserData(...)
//   - Profile.jsx         -> base44.auth.updateMe(formData)
//
// Escreve na Account, que é o registro único do usuário a partir do corte.
// NÃO é chamada por ninguém ainda: as duas telas passam a usá-la na Fase 3,
// junto com o resto do corte. Até lá, esta função existe e não escreve nada.
//
// SEGURANÇA — o registro alvo vem SEMPRE de identity.email, nunca do corpo.
// A Account é resolvida por lookup de email com service role; o corpo só pode
// influenciar QUAIS campos da lista branca mudam, nunca DE QUEM.
// Isso importa mais do que parece: sob JWT não existe sessão Base44, então o
// RLS (`{{user.email}}`) resolve nulo e deixa de proteger qualquer coisa. O
// filtro explícito por identity.email passa a ser a única barreira.
//
// LISTA BRANCA de campos editáveis pelo próprio usuário:
//   full_name, specialty, country, state, city, profile_completed
//
// Tudo o mais é ignorado em silêncio (e devolvido em `ignorados`, para
// depuração). Em particular:
//   - subscription_type: o CompleteProfile.jsx hoje envia "free" no submit.
//     Ignorar é o comportamento correto — o default do schema da Account já
//     grava 'free' na criação, e honrar esse campo abriria a porta para um
//     POST com subscription_type: 'premium'.
//   - role: nunca editável. Admin é quem entra pela sessão Base44.
//   - email / password_hash / google_id / apple_id / email_verified: lado de
//     credencial, muda só nos fluxos de sign-in.
//   - agregados de quiz e streak: derivados de QuizAttempt, nunca do usuário.
// -----------------------------------------------------------------------------

const CAMPOS_EDITAVEIS = [
  'full_name',
  'specialty',
  'country',
  'state',
  'city',
  'profile_completed'
];

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

// Nunca devolver o lado de credencial da Account para o cliente.
function sanitize(account) {
  const { password_hash: _ph, google_id: _g, apple_id: _a, ...rest } = account;
  return rest;
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

    const updates = {};
    const ignorados = [];

    for (const [campo, valor] of Object.entries(body || {})) {
      if (!CAMPOS_EDITAVEIS.includes(campo)) {
        ignorados.push(campo);
        continue;
      }
      if (campo === 'profile_completed') {
        updates[campo] = valor === true;
      } else {
        updates[campo] = typeof valor === 'string' ? valor.trim() : '';
      }
    }

    if (Object.keys(updates).length === 0) {
      return Response.json(
        { error: 'Nenhum campo editável enviado', success: false, ignorados },
        { status: 400 }
      );
    }

    const email = normalizeEmail(identity.email);
    const accounts = await base44.asServiceRole.entities.Account.filter({ email });
    const account = accounts && accounts.length > 0 ? accounts[0] : null;

    if (!account) {
      // Autenticado, mas sem Account: acontece se o backfill ainda não rodou
      // para este email, ou para um admin que só existe como User.
      return Response.json(
        { error: 'Conta não encontrada para este usuário', code: 'account_not_found', success: false },
        { status: 404 }
      );
    }

    const atualizada = await base44.asServiceRole.entities.Account.update(account.id, updates);

    return Response.json({
      success: true,
      account: sanitize(atualizada || { ...account, ...updates }),
      ignorados
    });
  } catch (error) {
    console.error('Erro em updateMyProfile:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});
