import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import webpush from 'npm:web-push@3.6.7';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { user_id, title, body } = await req.json();

    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    const vapidSubject = Deno.env.get('VAPID_SUBJECT');

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    // Get subscriptions: all or filtered by user_id
    let subscriptions;
    if (user_id) {
      subscriptions = await base44.asServiceRole.entities.PushSubscription.filter({ user_id });
    } else {
      subscriptions = await base44.asServiceRole.entities.PushSubscription.list('-created_date', 1000);
    }

    if (subscriptions.length === 0) {
      return Response.json({ 
        success: false, 
        error: 'Nenhuma inscrição de push encontrada' 
      });
    }

    const payload = JSON.stringify({
      title: title || 'PlayECG - Teste',
      body: body || 'Esta é uma notificação de teste! 🎉',
      icon: 'https://media.base44.com/images/public/68e28688c6f4ec5cd17e317d/88192cd50_903B5817-5009-4B34-8478-509B00A9C6B8.png'
    });

    const results = [];

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        }, payload);
        results.push({ endpoint: sub.endpoint, status: 'sent' });
      } catch (err) {
        // If subscription is expired/invalid, remove it
        if (err.statusCode === 410 || err.statusCode === 404) {
          await base44.asServiceRole.entities.PushSubscription.delete(sub.id);
          results.push({ endpoint: sub.endpoint, status: 'removed (expired)' });
        } else {
          results.push({ endpoint: sub.endpoint, status: 'error', error: err.message });
        }
      }
    }

    return Response.json({ success: true, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});