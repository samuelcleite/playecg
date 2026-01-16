import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userEmail = user.email;

        // Delete all user data
        await base44.asServiceRole.entities.QuizAttempt.delete({ user_email: userEmail });
        await base44.asServiceRole.entities.DailyQuizStats.delete({ user_email: userEmail });
        await base44.asServiceRole.entities.Payment.delete({ user_email: userEmail });
        await base44.asServiceRole.entities.CouponUsage.delete({ user_email: userEmail });

        // Delete the user account itself
        await base44.asServiceRole.entities.User.delete({ email: userEmail });

        return Response.json({ success: true });
    } catch (error) {
        console.error('Error deleting account:', error);
        return Response.json({ 
            success: false, 
            error: error.message || 'Erro ao deletar conta' 
        }, { status: 500 });
    }
});