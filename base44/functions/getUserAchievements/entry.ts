import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Busca via service role para não depender do contexto de RLS do frontend
        // (ex.: modo "agindo como" do dashboard, onde {{user.email}} pode não casar).
        const [allAchievements, userAchievements] = await Promise.all([
            base44.asServiceRole.entities.Achievement.filter({ active: true }, 'order'),
            base44.asServiceRole.entities.UserAchievement.filter({ user_email: user.email }),
        ]);

        const earnedMap = new Map(
            userAchievements.map((ua) => [ua.achievement_id, ua.earned_at])
        );

        const achievements = allAchievements.map((a) => ({
            ...a,
            earned: earnedMap.has(a.id),
            earned_at: earnedMap.get(a.id) || null,
        }));

        return Response.json({ achievements });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});