import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Verificar se é admin
        const currentUser = await base44.auth.me();
        if (!currentUser || currentUser.role !== 'admin') {
            return Response.json({ 
                error: 'Apenas administradores podem usar esta função',
                success: false 
            }, { status: 403 });
        }

        const { user_email } = await req.json();

        if (!user_email) {
            return Response.json({ 
                error: 'Email do usuário é obrigatório',
                success: false 
            }, { status: 400 });
        }

        console.log('👤 Upgrading user to premium manually:', user_email);

        // Buscar usuário
        const users = await base44.asServiceRole.entities.User.filter({
            email: user_email
        });

        if (users.length === 0) {
            return Response.json({ 
                error: 'Usuário não encontrado',
                success: false 
            }, { status: 404 });
        }

        const user = users[0];

        // Atualizar para premium
        await base44.asServiceRole.entities.User.update(user.id, {
            subscription_type: 'premium',
            subscription_start_date: new Date().toISOString()
        });

        console.log('✅ User upgraded successfully:', user_email);

        return Response.json({
            success: true,
            message: `Usuário ${user_email} foi atualizado para Premium com sucesso`,
            user: {
                email: user.email,
                full_name: user.full_name,
                subscription_type: 'premium',
                subscription_start_date: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('💥 Error upgrading user:', error.message);
        console.error('💥 Stack trace:', error.stack);
        return Response.json({ 
            error: 'Erro ao atualizar usuário: ' + error.message,
            success: false
        }, { status: 500 });
    }
});