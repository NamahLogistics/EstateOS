import crypto from 'crypto';
import webpush from 'web-push';
import { mutate, readStore } from './db.js';

const MAX_NOTIFICATIONS_PER_USER = 80;

let vapidReady = false;

export function ensureVapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:support@heirready.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    vapidReady = true;
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
    };
  }

  const store = readStore();
  if (store.vapidKeys?.publicKey && store.vapidKeys?.privateKey) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:support@heirready.com',
      store.vapidKeys.publicKey,
      store.vapidKeys.privateKey
    );
    vapidReady = true;
    return store.vapidKeys;
  }

  const keys = webpush.generateVAPIDKeys();
  mutate((s) => {
    s.vapidKeys = keys;
  });
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:support@heirready.com',
    keys.publicKey,
    keys.privateKey
  );
  vapidReady = true;
  console.log('[push] Generated VAPID keys (persisted in store)');
  return keys;
}

export function getVapidPublicKey() {
  const keys = ensureVapidKeys();
  return keys.publicKey;
}

export function pushConfigured() {
  try {
    ensureVapidKeys();
    return vapidReady;
  } catch {
    return false;
  }
}

function uuid() {
  return crypto.randomUUID();
}

/**
 * Create in-app notification(s) and optionally fan out Web Push.
 * @param {{ userIds: string[], title: string, body: string, url?: string, type?: string, estateId?: string }} opts
 */
export function notifyUsers(opts) {
  const {
    userIds = [],
    title,
    body,
    url = '/app',
    type = 'general',
    estateId = null,
  } = opts || {};
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length || !title) return [];

  const created = [];
  const now = new Date().toISOString();

  mutate((s) => {
    if (!s.notifications) s.notifications = [];
    for (const userId of unique) {
      const row = {
        id: uuid(),
        userId,
        title: String(title).slice(0, 120),
        body: String(body || '').slice(0, 400),
        url: url || '/app',
        type,
        estateId,
        readAt: null,
        createdAt: now,
      };
      s.notifications.push(row);
      created.push(row);
      // Cap per user
      const mine = s.notifications.filter((n) => n.userId === userId);
      if (mine.length > MAX_NOTIFICATIONS_PER_USER) {
        const drop = mine
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .slice(0, mine.length - MAX_NOTIFICATIONS_PER_USER)
          .map((n) => n.id);
        s.notifications = s.notifications.filter((n) => !drop.includes(n.id));
      }
    }
  });

  // Fire-and-forget push
  deliverPush(created).catch((err) => console.error('push deliver failed', err.message));

  return created;
}

async function deliverPush(notifications) {
  if (!notifications.length) return;
  ensureVapidKeys();
  const store = readStore();
  const subs = store.pushSubscriptions || [];
  if (!subs.length) return;

  for (const n of notifications) {
    const targets = subs.filter((s) => s.userId === n.userId);
    const payload = JSON.stringify({
      title: n.title,
      body: n.body,
      url: n.url,
      tag: n.id,
      unreadHint: true,
    });
    for (const sub of targets) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys,
          },
          payload
        );
      } catch (err) {
        const status = err.statusCode || err.status;
        if (status === 404 || status === 410) {
          mutate((s) => {
            s.pushSubscriptions = (s.pushSubscriptions || []).filter((x) => x.endpoint !== sub.endpoint);
          });
        } else {
          console.error('webpush send failed', status || err.message);
        }
      }
    }
  }
}

export function unreadCountFor(userId) {
  const store = readStore();
  return (store.notifications || []).filter((n) => n.userId === userId && !n.readAt).length;
}

export function listNotifications(userId, { limit = 40 } = {}) {
  const store = readStore();
  return (store.notifications || [])
    .filter((n) => n.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function markNotificationsRead(userId, ids) {
  const idSet = ids?.length ? new Set(ids) : null;
  const now = new Date().toISOString();
  let marked = 0;
  mutate((s) => {
    for (const n of s.notifications || []) {
      if (n.userId !== userId || n.readAt) continue;
      if (idSet && !idSet.has(n.id)) continue;
      n.readAt = now;
      marked++;
    }
  });
  return marked;
}

export function savePushSubscription(userId, subscription) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw Object.assign(new Error('Invalid push subscription'), { status: 400 });
  }
  mutate((s) => {
    if (!s.pushSubscriptions) s.pushSubscriptions = [];
    s.pushSubscriptions = s.pushSubscriptions.filter((x) => x.endpoint !== subscription.endpoint);
    s.pushSubscriptions.push({
      userId,
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      createdAt: new Date().toISOString(),
    });
  });
}

export function removePushSubscription(userId, endpoint) {
  mutate((s) => {
    s.pushSubscriptions = (s.pushSubscriptions || []).filter(
      (x) => !(x.userId === userId && (!endpoint || x.endpoint === endpoint))
    );
  });
}
