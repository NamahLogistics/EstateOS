/**
 * Log product activity to our DB (admin Activity page).
 * Fire-and-forget — never blocks UX.
 */
import { whatsappShareUrl } from './whatsapp.js';

const STORAGE_KEY = 'estate_os_session';

function currentPath() {
  try {
    return typeof window !== 'undefined' ? window.location.pathname : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} type
 * @param {object} [meta]
 * @param {(path: string, opts?: object) => Promise<any>} [apiFn] auth.api when available
 */
export function logActivity(type, meta = {}, apiFn) {
  if (!type) return;
  const payload = { type, meta, path: currentPath() };

  const send = async () => {
    if (typeof apiFn === 'function') {
      await apiFn('/api/activity', { method: 'POST', body: payload });
      return;
    }
    let token = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) token = JSON.parse(raw)?.token || null;
    } catch {
      /* ignore */
    }
    if (!token) return;
    const res = await fetch('/api/activity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`activity ${res.status}`);
  };

  send().catch(() => {});
}

/** User tapped a WhatsApp share / invite button (not proof they sent it). */
export function logWhatsAppShare(kind, meta = {}, apiFn) {
  logActivity('whatsapp_share', { kind, ...meta }, apiFn);
}

export function logCopyLink(kind, meta = {}, apiFn) {
  logActivity('copy_link', { kind, ...meta }, apiFn);
}

/**
 * Mint /r/:code, put it in the WA message, open WhatsApp.
 * @param {{
 *   api: Function,
 *   destination: string,
 *   kind: string,
 *   buildText: (trackedUrl: string) => string,
 *   meta?: object,
 *   toast?: (msg: string) => void,
 * }} opts
 */
export async function openTrackedWhatsAppShare({
  api,
  destination,
  kind,
  buildText,
  meta = {},
  toast,
}) {
  if (!api || !destination || !kind || typeof buildText !== 'function') return false;
  try {
    const res = await api('/api/share/tracked-link', {
      method: 'POST',
      body: { destination, kind, ...meta },
    });
    const tracked = res.trackedUrl;
    if (!tracked) throw new Error('No tracked link');
    const text = buildText(tracked);
    logWhatsAppShare(kind, { ...meta, code: res.code }, api);
    window.open(whatsappShareUrl(text), '_blank', 'noopener,noreferrer');
    return true;
  } catch (err) {
    if (toast) toast(err.message || 'Could not open WhatsApp');
    return false;
  }
}
