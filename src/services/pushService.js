const webpush = require('web-push');
const { supabase } = require('../config/supabaseClient');

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

async function notifyPartnersOfPnl(ownerId, amount, entryDate) {
  const { data: partners, error: partnerError } = await supabase
    .from('partners')
    .select('user_id')
    .eq('owner_id', ownerId)
    .not('user_id', 'eq', ownerId);

  if (partnerError) throw partnerError;

  const userIds = partners.map(p => p.user_id).filter(Boolean);
  if (userIds.length === 0) return;

  const { data: subscriptions, error: subError } = await supabase
    .from('push_subscriptions')
    .select('*')
    .in('user_id', userIds);

  if (subError) throw subError;

  const type = amount >= 0 ? 'Profit' : 'Loss';
  const payload = JSON.stringify({
    title: `New ${type} Logged`,
    body: `${type} of $${Math.abs(amount).toFixed(2)} on ${entryDate}`,
  });

  for (const sub of subscriptions) {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    };
    try {
      await webpush.sendNotification(pushSubscription, payload);
    } catch (err) {
      console.error('Push failed for subscription', sub.id, err.message);
    }
  }
}

module.exports = { notifyPartnersOfPnl };
