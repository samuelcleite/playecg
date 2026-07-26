import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

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

  const user = await base44.auth.me();
  if (user) {
    return { email: user.email, role: user.role, source: 'base44', record: user };
  }

  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const identity = await resolveIdentity(req, base44);
    if (!identity) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = identity.record;

    const { case_id, case_title, error_description, error_type } = await req.json();

    if (!case_id || !error_description) {
      return Response.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    // Enviar email com o erro reportado
    const emailBody = `
      <h2>Erro Reportado em Caso de ECG</h2>
      <p><strong>Usuário:</strong> ${user.full_name} (${identity.email})</p>
      <p><strong>Caso ID:</strong> ${case_id}</p>
      <p><strong>Título do Caso:</strong> ${case_title || 'N/A'}</p>
      <p><strong>Tipo de Erro:</strong> ${error_type || 'Outro'}</p>
      <p><strong>Descrição do Erro:</strong></p>
      <p>${error_description}</p>
      <hr>
      <p><em>Data: ${new Date().toLocaleString('pt-BR')}</em></p>
    `;

    await base44.integrations.Core.SendEmail({
      from_name: 'ECG Learning - Reportar Erro',
      to: 'ecgdescomplica@gmail.com',
      subject: `[ERRO] Caso: ${case_title || case_id}`,
      body: emailBody
    });

    return Response.json({ 
      success: true, 
      message: 'Erro reportado com sucesso' 
    });
  } catch (error) {
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});