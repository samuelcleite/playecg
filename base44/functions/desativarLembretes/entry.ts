import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// desativarLembretes — o link "Desativar lembretes" de todo e-mail do
// lembretesDiarios, chamado pela página pública /lembretes.
// -----------------------------------------------------------------------------
// SEM login, de propósito: quem quer parar de receber e-mail não pode precisar
// entrar no app para isso — e boa parte de quem recebe o lembrete nunca voltou
// ao app, que é justamente o motivo do lembrete.
//
// Quem autoriza é o token do link: `<Account.id>.<assinatura>`, HMAC-SHA256 com
// a JWT_SECRET sobre "desativar-lembretes:<id>". A frase fixa é a mesma do
// assinarLink no lembretesDiarios — as duas pontas precisam dela igual — e é o
// que separa este uso do JWT de login: a assinatura de um nunca vale pela do
// outro. A comparação é pelo crypto.subtle.verify, que não vaza tempo.
//
// Só escreve `lembretes_desativados_em` na conta do token. Repetir o clique é
// inofensivo: a data é regravada e o efeito é o mesmo.
// -----------------------------------------------------------------------------

const FRASE_DO_LINK = 'desativar-lembretes:';

function b64urlParaBytes(s) {
  let t = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  return Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
}

async function idDoToken(token, segredo) {
  if (typeof token !== 'string') return null;
  const partes = token.split('.');
  if (partes.length !== 2) return null;
  const [id, assinatura] = partes;
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(id) || !assinatura) return null;
  try {
    const chave = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(segredo),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const valido = await crypto.subtle.verify(
      'HMAC',
      chave,
      b64urlParaBytes(assinatura),
      new TextEncoder().encode(FRASE_DO_LINK + id)
    );
    return valido ? id : null;
  } catch (_e) {
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    let corpo = {};
    try {
      corpo = await req.json();
    } catch (_e) {
      corpo = {};
    }

    const segredo = Deno.env.get('JWT_SECRET');
    if (!segredo) {
      console.error('desativarLembretes: JWT_SECRET ausente');
      return Response.json({ success: false, error: 'Indisponível no momento. Tente de novo mais tarde.' }, { status: 500 });
    }

    const id = await idDoToken(corpo?.t, segredo);
    if (!id) {
      return Response.json({ success: false, error: 'Este link não é válido.' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    try {
      await base44.asServiceRole.entities.Account.update(id, {
        lembretes_desativados_em: new Date().toISOString()
      });
    } catch (e) {
      // Conta excluída depois do e-mail: não há mais nada a desativar, e para
      // quem clicou o resultado é o mesmo.
      if (e?.status === 404 || e?.response?.status === 404 || /not found/i.test(e?.message || '')) {
        return Response.json({ success: true });
      }
      throw e;
    }

    console.log(`desativarLembretes: lembretes desativados para a conta ${id}`);
    return Response.json({ success: true });
  } catch (error) {
    console.error('Erro em desativarLembretes:', error);
    return Response.json({ success: false, error: 'Não foi possível desativar agora. Tente de novo.' }, { status: 500 });
  }
});
