/**
 * SMS helpers — Twilio, MSG91, or log mode for local testing.
 * Used for phone verification OTP and new-device login alerts.
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
  // Auto-detect
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

function resolveProvider() {
  const explicit = String(process.env.SMS_PROVIDER || '').toLowerCase();
  if (explicit) return explicit;
  if (
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM
  ) {
    return 'twilio';
  }
  if (process.env.MSG91_AUTH_KEY && process.env.MSG91_SENDER_ID) return 'msg91';
  return null;
}

/** Normalize Indian mobiles to E.164 (+91…). Returns null if invalid. */
export function normalizeIndianPhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 12 && digits.startsWith('91')) {
    /* keep */
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = `91${digits.slice(1)}`;
  } else if (digits.length === 10) {
    digits = `91${digits}`;
  } else {
    return null;
  }
  if (!/^91[6-9]\d{9}$/.test(digits)) return null;
  return `+${digits}`;
}

export function phoneLast4(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length < 4) return null;
  return d.slice(-4);
}

export function maskPhone(phone) {
  const e164 = String(phone || '');
  const last = phoneLast4(e164);
  if (!last) return null;
  return `+91••••••${last}`;
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

/** Full phone only for the account owner on /api/me. */
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
  const provider = resolveProvider();
  const payload = {
    id: crypto.randomUUID(),
    to,
    body,
    tag: tag || null,
    at: new Date().toISOString(),
    status: 'queued',
    provider,
  };

  if (!provider || !smsConfigured()) {
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
    else {
      throw new Error(`Unknown SMS_PROVIDER: ${provider}`);
    }
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
