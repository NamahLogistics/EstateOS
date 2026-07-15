/** Web Push subscribe + app badge helpers */

const ENABLED_KEY = 'heirready_push_enabled';
const SOFT_DISMISS_SESSION = 'heirready_push_soft_dismiss_session';
const DENIED_DISMISS_SESSION = 'heirready_push_denied_dismiss_session';
const SOFT_REASON_KEY = 'heirready_push_soft_reason';

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

/** @returns {'unsupported'|'default'|'granted'|'denied'} */
export function notificationPermission() {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission === 'granted'
    ? 'granted'
    : Notification.permission === 'denied'
      ? 'denied'
      : 'default';
}

export function isPushEnabledLocally() {
  return localStorage.getItem(ENABLED_KEY) === '1';
}

/** Soft “Enable alerts” UI — dismissed for this tab/session only (can reappear next visit). */
export function softPushDismissedThisSession() {
  return sessionStorage.getItem(SOFT_DISMISS_SESSION) === '1';
}

export function dismissSoftPushThisSession() {
  sessionStorage.setItem(SOFT_DISMISS_SESSION, '1');
}

export function deniedHelpDismissedThisSession() {
  return sessionStorage.getItem(DENIED_DISMISS_SESSION) === '1';
}

export function dismissDeniedHelpThisSession() {
  sessionStorage.setItem(DENIED_DISMISS_SESSION, '1');
}

/**
 * Ask our soft banner to show (does NOT call the browser permission dialog).
 * Safe to call often — e.g. after unread alerts, invite, housewarming.
 */
export function requestSoftPushPrompt(reason = 'general') {
  if (typeof window === 'undefined') return;
  if (!pushSupported()) return;
  if (notificationPermission() !== 'default') return;
  if (isPushEnabledLocally()) return;
  sessionStorage.removeItem(SOFT_DISMISS_SESSION);
  sessionStorage.setItem(SOFT_REASON_KEY, String(reason).slice(0, 40));
  window.dispatchEvent(new CustomEvent('heirready:soft-push', { detail: { reason } }));
}

export function consumeSoftPushReason() {
  const reason = sessionStorage.getItem(SOFT_REASON_KEY) || 'general';
  sessionStorage.removeItem(SOFT_REASON_KEY);
  return reason;
}

/** If already granted, refresh subscription without showing the permission dialog. */
export async function ensurePushSubscribed(api) {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  if (Notification.permission !== 'granted') return { ok: false, reason: Notification.permission };

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
  localStorage.setItem(ENABLED_KEY, '1');
  return { ok: true };
}

/** User tapped Enable — this is the one browser dialog chance. */
export async function enableWebPush(api) {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  if (Notification.permission === 'denied') return { ok: false, reason: 'denied' };

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: perm };

  return ensurePushSubscribed(api);
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
  localStorage.removeItem(ENABLED_KEY);
}
