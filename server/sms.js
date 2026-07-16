/**
 * SMS helpers — Twilio, MSG91, or log mode for local testing.
 * Supports Indian and NRI / international mobiles (Twilio for non-+91).
 */
import crypto from 'crypto';
import { mutate } from './db.js';

export function smsConfigured() {
  const provider = String(process.env.SMS_PROVIDER || '').toLowerCase();
  if (provider === 'log') return true;
  if (provider === 'twilio') {
    return Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_FROM
    );
  }
  if (provider === 'msg91') {
    return Boolean(process.env.MSG91_AUTH_KEY && process.env.MSG91_SENDER_ID);
  }
  if (
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM
  ) {
    return true;
  }
  if (process.env.MSG91_AUTH_KEY && process.env.MSG91_SENDER_ID) return true;
  return false;
}

/** Common dial codes for India + diaspora. */
export const PHONE_COUNTRY_OPTIONS = [
  { code: 'IN', dial: '91', label: 'India (+91)' },
  { code: 'US', dial: '1', label: 'US / Canada (+1)' },
  { code: 'GB', dial: '44', label: 'UK (+44)' },
  { code: 'AE', dial: '971', label: 'UAE (+971)' },
  { code: 'SG', dial: '65', label: 'Singapore (+65)' },
  { code: 'AU', dial: '61', label: 'Australia (+61)' },
  { code: 'DE', dial: '49', label: 'Germany (+49)' },
  { code: 'OTHER', dial: '', label: 'Other (full number with +)' },
];

/**
 * Normalize to E.164.
 * - Full international with + (e.g. +14155552671)
 * - Local digits + countryDial (e.g. 4155552671 + 1)
 * - Bare 10-digit Indian mobile defaults to +91
 */
export function normalizePhone(raw, countryDial = '91') {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) return null;
    if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
    return `+${digits}`;
  }

  let digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);

  const dial = String(countryDial || '').replace(/\D/g, '');

  if (dial) {
    if (digits.startsWith(dial) && digits.length >= dial.length + 7) {
      if (digits.length > 15) return null;
      return `+${digits}`;
    }
    if (dial === '91' && digits.length === 11 && digits.startsWith('0')) {
      digits = digits.slice(1);
    }
    const full = `${dial}${digits}`;
    if (full.length < 8 || full.length > 15) return null;
    if (dial === '91' && !/^91[6-9]\d{9}$/.test(full)) return null;
    return `+${full}`;
  }

  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return `+91${digits}`;
  }
  if (digits.length >= 8 && digits.length <= 15 && /^[1-9]/.test(digits)) {
    return `+${digits}`;
  }
  return null;
}

/** @deprecated use normalizePhone */
export function normalizeIndianPhone(raw) {
  return normalizePhone(raw, '91');
}

export function phoneLast4(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length < 4) return null;
  return d.slice(-4);
}

export function maskPhone(phone) {
  const e164 = String(phone || '');
  const digits = e164.replace(/\D/g, '');
  const last = phoneLast4(e164);
  if (!last || digits.length < 6) return e164 ? `${e164.slice(0, 3)}••••` : null;
  const cc = digits.slice(0, Math.max(1, digits.length - 10));
  return `+${cc}••••${last}`;
}

function twilioReady() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM
  );
}

function msg91Ready() {
  return Boolean(process.env.MSG91_AUTH_KEY && process.env.MSG91_SENDER_ID);
}

function resolveProvider(toE164) {
  const explicit = String(process.env.SMS_PROVIDER || '').toLowerCase();
  const isIndia = String(toE164 || '').startsWith('+91');

  if (explicit === 'log') return 'log';
  if (!isIndia) {
    if (twilioReady()) return 'twilio';
    if (explicit === 'msg91' || msg91Ready()) return 'intl_unsupported';
    return null;
  }
  if (explicit === 'twilio' && twilioReady()) return 'twilio';
  if (explicit === 'msg91' && msg91Ready()) return 'msg91';
  if (msg91Ready()) return 'msg91';
  if (twilioReady()) return 'twilio';
  return null;
}

export function phonePublicFields(user) {
  const verified = Boolean(user?.phoneVerifiedAt && user?.phone);
  return {
    phoneVerified: verified,
    phoneLast4: verified ? phoneLast4(user.phone) : null,
    phoneMasked: verified ? maskPhone(user.phone) : null,
    smsAlertsEnabled: verified ? Boolean(user.smsAlertsEnabled) : false,
    phoneMarketingOptIn: verified ? Boolean(user.phoneMarketingOptIn) : false,
    smsConfigured: smsConfigured(),
  };
}

export function phoneOwnerFields(user) {
  const base = phonePublicFields(user);
  if (!user?.phoneVerifiedAt || !user?.phone) {
    return { ...base, phone: null };
  }
  return { ...base, phone: user.phone };
}

export function hashPhoneCode(code) {
  return crypto.createHash('sha256').update(String(code || '')).digest('hex');
}

export function generatePhoneOtp() {
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(6, '0');
}

function recordSmsOutbox(payload) {
  mutate((s) => {
    if (!s.smsOutbox) s.smsOutbox = [];
    s.smsOutbox.push(payload);
    if (s.smsOutbox.length > 300) s.smsOutbox = s.smsOutbox.slice(-200);
  });
}

async function sendViaTwilio({ to, body }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error_message || `Twilio HTTP ${res.status}`);
  }
  return { providerId: data.sid || null };
}

async function sendViaMsg91({ to, body }) {
  const authKey = process.env.MSG91_AUTH_KEY;
  const sender = process.env.MSG91_SENDER_ID || 'HEIRRD';
  const mobile = String(to).replace(/^\+/, '');
  const url = new URL('https://control.msg91.com/api/sendhttp.php');
  url.searchParams.set('authkey', authKey);
  url.searchParams.set('mobiles', mobile);
  url.searchParams.set('message', body);
  url.searchParams.set('sender', sender);
  url.searchParams.set('route', '4');
  url.searchParams.set('country', '91');
  const r2 = await fetch(url.toString());
  const text = await r2.text();
  if (!r2.ok || /^error/i.test(text)) {
    throw new Error(text || `MSG91 HTTP ${r2.status}`);
  }
  return { providerId: text.slice(0, 64) };
}

export async function sendSms({ to, body, tag }) {
  if (!smsConfigured()) {
    const err = new Error(
      'SMS alerts aren’t set up on the server yet. You can try again after we finish setup.'
    );
    err.code = 'SMS_NOT_CONFIGURED';
    throw err;
  }

  const provider = resolveProvider(to);
  const payload = {
    id: crypto.randomUUID(),
    to,
    body,
    tag: tag || null,
    at: new Date().toISOString(),
    status: 'queued',
    provider,
  };

  if (provider === 'intl_unsupported') {
    payload.status = 'failed';
    payload.error = 'International SMS needs Twilio';
    recordSmsOutbox(payload);
    const err = new Error(
      'International / NRI numbers need Twilio SMS. Indian (+91) numbers work with MSG91. Email confirm still protects new-device logins.'
    );
    err.code = 'SMS_INTL_UNSUPPORTED';
    throw err;
  }

  if (!provider) {
    payload.status = 'failed';
    payload.error = 'SMS not configured';
    recordSmsOutbox(payload);
    const err = new Error(
      'SMS alerts aren’t set up on the server yet. You can try again after we finish setup.'
    );
    err.code = 'SMS_NOT_CONFIGURED';
    throw err;
  }

  try {
    if (provider === 'log') {
      payload.status = 'logged';
      console.log(`[sms:logged] to=${to} tag=${tag || ''} body=${body}`);
      recordSmsOutbox(payload);
      return { ok: true, mode: 'logged', id: payload.id };
    }
    let result;
    if (provider === 'twilio') result = await sendViaTwilio({ to, body });
    else if (provider === 'msg91') result = await sendViaMsg91({ to, body });
    else throw new Error(`Unknown SMS_PROVIDER: ${provider}`);
    payload.status = 'sent';
    payload.providerId = result.providerId;
    recordSmsOutbox(payload);
    return { ok: true, mode: provider, id: payload.id, providerId: result.providerId };
  } catch (err) {
    payload.status = 'failed';
    payload.error = err.message;
    recordSmsOutbox(payload);
    throw err;
  }
}

export async function sendPhoneVerifyOtp({ to, code }) {
  const body = `HeirReady code: ${code}. Use this to verify your mobile for login alerts. Expires in 10 minutes.`;
  return sendSms({ to, body, tag: 'phone_verify' });
}

export async function sendNewDeviceSms({ to, name, deviceLabel, link }) {
  const who = String(name || 'there').split(/\s+/)[0] || 'there';
  const device = deviceLabel || 'a new device';
  const body = `HeirReady: Hi ${who}, sign-in attempt from ${device}. If it was you, approve via email or open: ${link} — If not, change your password.`;
  return sendSms({ to, body, tag: 'new_device' });
}
