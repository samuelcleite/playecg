import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const { event, data } = payload;

    if (!data || !data.id) {
      return Response.json({ error: 'No user data' }, { status: 400 });
    }

    // Upgrade user to premium
    await base44.asServiceRole.entities.User.update(data.id, {
      subscription_type: 'premium'
    });

    console.log(`User ${data.email} automatically upgraded to premium`);
    return Response.json({ success: true });
  } catch (error) {
    console.error('Error upgrading user:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});