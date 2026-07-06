import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
    if (admins.length === 0) {
      return Response.json({ success: true, message: 'No admins found' });
    }

    const userName = user.full_name || user.email || 'Novo usuário';
    const userEmail = user.email || 'N/A';
    const specialty = user.specialty || 'Não informada';
    const location = [user.city, user.state, user.country].filter(Boolean).join(', ') || 'Não informada';
    const createdAt = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    for (const admin of admins) {
      if (!admin.email) continue;
      await base44.integrations.Core.SendEmail({
        to: admin.email,
        subject: 'Novo usuário cadastrado no PlayECG',
        body: `Um novo usuário se cadastrou na plataforma:\n\nNome: ${userName}\nEmail: ${userEmail}\nEspecialidade: ${specialty}\nLocalização: ${location}\nData: ${createdAt}`
      });
    }

    console.log(`Admin notified of new user: ${userEmail}`);
    return Response.json({ success: true, notified: admins.length });
  } catch (error) {
    console.error('Error notifying admin of new user:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});