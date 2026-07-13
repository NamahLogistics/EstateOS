/** Web Push subscribe + app badge helpers */

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export async function syncAppBadge(unread) {
  try {
    if (!('setAppBadge' in navigator)) return;
    if (unread > 0) await navigator.setAppBadge(unread);
    else if ('clearAppBadge' in navigator) await navigator.clearAppBadge();
  } catch {
    /* unsupported / denied */
  }
}

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function enableWebPush(api) {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: perm };

  const reg = await navigator.serviceWorker.ready;
  const vapid = await api('/api/push/vapid-public-key');
  if (!vapid?.publicKey) return { ok: false, reason: 'no_vapid' };

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
    });
  }

  await api('/api/push/subscribe', {
    method: 'POST',
    body: { subscription: sub.toJSON() },
  });
  localStorage.setItem('heirready_push_enabled', '1');
  return { ok: true };
}

export async function disableWebPush(api) {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => {});
    await api('/api/push/unsubscribe', { method: 'POST', body: { endpoint } }).catch(() => {});
  }
  localStorage.removeItem('heirready_push_enabled');
}
