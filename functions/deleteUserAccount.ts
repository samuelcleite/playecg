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
        const quizAttempts = await base44.asServiceRole.entities.QuizAttempt.filter({ user_email: userEmail });
        for (const attempt of quizAttempts) {
            await base44.asServiceRole.entities.QuizAttempt.delete(attempt.id);
        }

        const dailyStats = await base44.asServiceRole.entities.DailyQuizStats.filter({ user_email: userEmail });
        for (const stat of dailyStats) {
            await base44.asServiceRole.entities.DailyQuizStats.delete(stat.id);
        }

        const payments = await base44.asServiceRole.entities.Payment.filter({ user_email: userEmail });
        for (const payment of payments) {
            await base44.asServiceRole.entities.Payment.delete(payment.id);
        }

        const couponUsages = await base44.asServiceRole.entities.CouponUsage.filter({ user_email: userEmail });
        for (const usage of couponUsages) {
            await base44.asServiceRole.entities.CouponUsage.delete(usage.id);
        }

        // Delete the user account itself
        await base44.asServiceRole.entities.User.delete(user.id);

        return Response.json({ success: true });
    } catch (error) {
        console.error('Error deleting account:', error);
        return Response.json({ 
            success: false, 
            error: error.message || 'Erro ao deletar conta' 
        }, { status: 500 });
    }
});