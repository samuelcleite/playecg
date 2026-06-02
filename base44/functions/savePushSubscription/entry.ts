import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { endpoint, p256dh, auth } = await req.json();

    if (!endpoint || !p256dh || !auth) {
      return Response.json({ error: 'Missing subscription fields' }, { status: 400 });
    }

    // Check if subscription already exists for this user + endpoint
    const existing = await base44.asServiceRole.entities.PushSubscription.filter({
      user_id: user.id,
      endpoint: endpoint
    });

    if (existing.length > 0) {
      // Update existing subscription
      await base44.asServiceRole.entities.PushSubscription.update(existing[0].id, {
        p256dh,
        auth
      });
      return Response.json({ success: true, action: 'updated' });
    }

    // Create new subscription
    await base44.asServiceRole.entities.PushSubscription.create({
      user_id: user.id,
      endpoint,
      p256dh,
      auth
    });

    return Response.json({ success: true, action: 'created' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});