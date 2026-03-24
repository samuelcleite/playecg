import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { case_id, case_title, error_description, error_type } = await req.json();

    if (!case_id || !error_description) {
      return Response.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    // Enviar email com o erro reportado
    const emailBody = `
      <h2>Erro Reportado em Caso de ECG</h2>
      <p><strong>Usuário:</strong> ${user.full_name} (${user.email})</p>
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