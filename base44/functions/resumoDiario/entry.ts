import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// resumoDiario — envia por e-mail o resumo do dia anterior (00h–23h59 de Brasília).
// -----------------------------------------------------------------------------
// Disparado todos os dias às 05:00 (Brasília) pelo workflow "Resumo Diário".
// Também pode ser chamado manualmente (tela de funções / teste) — nesse caso a
// sessão precisa ser de admin. A execução agendada chega SEM sessão: é o
// caminho esperado e autorizado.
//
// ECONOMIA DE LEITURAS: todas as consultas usam filtro de data + limite — nada
// de baixar coleção inteira (mesmo cuidado dos 500 que já corrigimos). O corpo
// aceita { inicio, fim } ISO-8601 opcionais apenas para teste manual com um
// intervalo real; sem eles, vale a janela padrão de 24h até agora.
// -----------------------------------------------------------------------------

const DESTINATARIO = 'ecgdescomplica@gmail.com';
const TZ = 'America/Sao_Paulo';
const LIMITE = 100;      // teto por consulta de cadastro/acesso/pagamento
const LIMITE_TENTATIVAS = 500; // teto da leitura de tentativas do período

function escaparHtml(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatarData(iso) {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Execução agendada (workflow) vem sem sessão: autorizada. Sessão presente
    // precisa ser admin — bloqueia disparo por usuário comum.
    let identity = null;
    try {
      identity = await base44.auth.me();
    } catch (_e) {
      identity = null;
    }
    if (identity && identity.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Janela do resumo: o dia de ONTEM inteiro, das 00:00 às 23:59 de Brasília,
    // salvo intervalo explícito para teste manual. Rodando às 05:00, cobre o
    // dia de calendário que acabou de fechar — não 24h para trás.
    let corpo = {};
    try {
      corpo = await req.json();
    } catch (_e) {
      corpo = {};
    }
    const agora = new Date();
    let inicio;
    let fim;
    if (corpo.inicio && corpo.fim) {
      inicio = new Date(corpo.inicio);
      fim = new Date(corpo.fim);
      if (isNaN(inicio.getTime()) || isNaN(fim.getTime()) || fim <= inicio) {
        return Response.json({ error: 'Intervalo de datas inválido' }, { status: 400 });
      }
    } else {
      const hojeBrt = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(agora);
      const [ano, mes, dia] = hojeBrt.split('-').map(Number);
      const ontem = new Date(Date.UTC(ano, mes - 1, dia) - 24 * 60 * 60 * 1000);
      const diaResumo = ontem.toISOString().slice(0, 10);
      // Brasília é UTC-3 o ano inteiro (sem horário de verão desde 2019).
      inicio = new Date(`${diaResumo}T00:00:00-03:00`);
      fim = new Date(`${diaResumo}T23:59:59-03:00`);
    }
    const inicioIso = inicio.toISOString();
    const fimIso = fim.toISOString();

    const svc = base44.asServiceRole;

    // 1) Novos cadastros (Account criadas na janela)
    const novasContas = (await svc.entities.Account.filter(
      { created_date: { $gte: inicioIso, $lte: fimIso } },
      null,
      LIMITE
    )) || [];
    const nomesNovos = novasContas
      .map((c) => c.full_name || c.email)
      .filter(Boolean);

    // 2) Compras (Payment PAID na janela)
    const pagamentos = (await svc.entities.Payment.filter(
      { status: 'PAID', paid_at: { $gte: inicioIso, $lte: fimIso } },
      null,
      LIMITE
    )) || [];
    const totalPago = pagamentos.reduce((s, p) => s + (p.amount || 0), 0);

    // 3) Logins novos na janela (Account com last_login_at). NÃO é sozinho a
    // métrica de "acessaram": quem já tinha a sessão aberta (JWT guardado no
    // aparelho) responde questões sem gerar um login novo — era o caso do
    // usuário ativo que não aparecia na contagem. O total final une os logins
    // com quem fez questão (calculado depois das tentativas).
    const logins = (await svc.entities.Account.filter(
      { last_login_at: { $gte: inicioIso, $lte: fimIso } },
      null,
      LIMITE
    )) || [];

    // 4) Quem acessou mais (top 5 por QuizAttempt na janela)
    const tentativas = (await svc.entities.QuizAttempt.filter(
      { created_date: { $gte: inicioIso, $lte: fimIso } },
      null,
      LIMITE_TENTATIVAS
    )) || [];
    const contagemPorEmail = {};
    for (const t of tentativas) {
      const email = (t.user_email || '').trim().toLowerCase();
      if (!email) continue;
      if (!contagemPorEmail[email]) {
        contagemPorEmail[email] = { total: 0, quiz: 0, modulos: 0, diario: 0 };
      }
      const c = contagemPorEmail[email];
      c.total++;
      if (t.quiz_type === 'module') c.modulos++;
      else if (t.quiz_type === 'daily') c.diario++;
      else c.quiz++;
    }
    const topEmails = Object.entries(contagemPorEmail)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5);
    const maisAtivos = [];
    for (const [email, cont] of topEmails) {
      const contas = (await svc.entities.Account.filter({ email }, null, 1)) || [];
      const nome = (contas[0] && (contas[0].full_name || contas[0].email)) || email;
      maisAtivos.push({ nome, ...cont });
    }

    // Total de quem acessou: união dos logins novos com quem respondeu questões.
    const emailsQueAcessaram = new Set([
      ...logins.map((a) => (a.email || '').trim().toLowerCase()),
      ...Object.keys(contagemPorEmail)
    ]);
    const totalAcessaram = emailsQueAcessaram.size;

    const resumo = {
      janela: { inicio: inicioIso, fim: fimIso },
      novos_cadastros: novasContas.length,
      nomes_novos_cadastros: nomesNovos,
      compras: pagamentos.length,
      valor_total_pago: totalPago,
      acessaram: totalAcessaram,
      mais_ativos: maisAtivos,
      tentativas_no_periodo: tentativas.length
    };

    // Montagem do e-mail — vai mesmo com tudo zero.
    const listaNomes = nomesNovos.length
      ? `<h3 style="font-size:15px;margin:20px 0 0 0;">🆕 Quem se cadastrou</h3>` +
        `<ul style="margin:6px 0 0 0;padding-left:20px;color:#374151;font-size:14px;">${
          nomesNovos.map((n) => `<li>${escaparHtml(n)}</li>`).join('')
        }</ul>`
      : '';
    const listaAtivos = maisAtivos.length
      ? `<ol style="margin:6px 0 0 0;padding-left:20px;color:#374151;font-size:14px;">${
          maisAtivos
            .map((a) => {
              const onde = [
                a.quiz ? `${a.quiz} no Quiz` : null,
                a.modulos ? `${a.modulos} nos Módulos` : null,
                a.diario ? `${a.diario} no Caso do Dia` : null
              ].filter(Boolean).join(' · ');
              return `<li>${escaparHtml(a.nome)} — ${a.total} questão(ões)${onde ? ` (${onde})` : ''}</li>`;
            })
            .join('')
        }</ol>`
      : '<p style="margin:6px 0 0 0;color:#9CA3AF;font-size:14px;">Nenhuma atividade no período.</p>';

    const valorFormatado = totalPago.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1A1A2E;">
        <h2 style="font-size:20px;margin:0 0 4px 0;">📊 Resumo Diário PlayECG</h2>
        <p style="font-size:13px;color:#6B7280;margin:0 0 20px 0;">
          Período: ${escaparHtml(formatarData(inicioIso))} até ${escaparHtml(formatarData(fimIso))}
        </p>

        <table style="width:100%;border-collapse:collapse;font-size:15px;">
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #E5E7EB;">🆕 Novos cadastros</td>
            <td style="padding:10px 0;border-bottom:1px solid #E5E7EB;text-align:right;font-weight:bold;">${novasContas.length}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #E5E7EB;">💳 Compras</td>
            <td style="padding:10px 0;border-bottom:1px solid #E5E7EB;text-align:right;font-weight:bold;">${pagamentos.length} — ${escaparHtml(valorFormatado)}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #E5E7EB;">👥 Usuários que acessaram</td>
            <td style="padding:10px 0;border-bottom:1px solid #E5E7EB;text-align:right;font-weight:bold;">${totalAcessaram}</td>
          </tr>
        </table>

        ${listaNomes}

        <h3 style="font-size:15px;margin:20px 0 0 0;">🏆 Mais ativos no período</h3>
        ${listaAtivos}
      </div>
    `;

    await svc.integrations.Core.SendEmail({
      to: DESTINATARIO,
      subject: `Resumo Diário PlayECG — ${formatarData(inicioIso).split(',')[0]}`,
      html,
      from_name: 'PlayECG'
    });

    console.log(
      `resumoDiario: cadastros=${resumo.novos_cadastros}, compras=${resumo.compras}, ` +
      `acessos=${resumo.acessaram}, tentativas=${resumo.tentativas_no_periodo}, ` +
      `email enviado para ${DESTINATARIO}`
    );

    return Response.json({ success: true, resumo });
  } catch (error) {
    console.error('Erro em resumoDiario:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});