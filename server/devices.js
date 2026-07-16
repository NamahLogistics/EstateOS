/**
 * Trusted-device login checks (unusual device → email confirm).
 */
import crypto from 'crypto';

const MAX_TRUSTED = 20;

export function hashDeviceId(deviceId) {
  const raw = String(deviceId || '').trim();
  if (!raw || raw.length < 8) return null;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function deviceLabelFromUa(ua) {
  const s = String(ua || '').slice(0, 240);
  if (!s) return 'Unknown device';
  let browser = 'Browser';
  if (/Edg\//i.test(s)) browser = 'Edge';
  else if (/Chrome\//i.test(s) && !/Chromium/i.test(s)) browser = 'Chrome';
  else if (/Firefox\//i.test(s)) browser = 'Firefox';
  else if (/Safari\//i.test(s) && !/Chrome/i.test(s)) browser = 'Safari';
  let os = '';
  if (/iPhone|iPad/i.test(s)) os = 'iPhone/iPad';
  else if (/Android/i.test(s)) os = 'Android';
  else if (/Mac OS X/i.test(s)) os = 'Mac';
  else if (/Windows/i.test(s)) os = 'Windows';
  else if (/Linux/i.test(s)) os = 'Linux';
  return os ? `${browser} on ${os}` : browser;
}

export function findTrustedDevice(user, fingerprintHash) {
  if (!fingerprintHash || !user?.trustedDevices?.length) return null;
  return user.trustedDevices.find((d) => d.fingerprintHash === fingerprintHash) || null;
}

export function isTrustedDevice(user, fingerprintHash) {
  return Boolean(findTrustedDevice(user, fingerprintHash));
}

/** Add or refresh a trusted device on the user object (caller mutates store). */
export function trustDeviceOnUser(user, { fingerprintHash, label, ip }) {
  if (!fingerprintHash) return;
  if (!Array.isArray(user.trustedDevices)) user.trustedDevices = [];
  const now = new Date().toISOString();
  const existing = user.trustedDevices.find((d) => d.fingerprintHash === fingerprintHash);
  if (existing) {
    existing.lastSeenAt = now;
    if (label) existing.label = label;
    if (ip) existing.lastIp = ip;
    return existing;
  }
  const entry = {
    id: crypto.randomUUID(),
    fingerprintHash,
    label: label || 'Trusted device',
    createdAt: now,
    lastSeenAt: now,
    lastIp: ip || null,
  };
  user.trustedDevices.push(entry);
  if (user.trustedDevices.length > MAX_TRUSTED) {
    user.trustedDevices = user.trustedDevices
      .slice()
      .sort((a, b) => String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || '')))
      .slice(0, MAX_TRUSTED);
  }
  return entry;
}

export function clientIp(req) {
  const xf = req.get('x-forwarded-for');
  if (xf) return String(xf).split(',')[0].trim().slice(0, 64);
  return String(req.ip || '').slice(0, 64) || null;
}
