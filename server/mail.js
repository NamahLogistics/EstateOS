/**
 * Transactional email via Resend when RESEND_API_KEY is set.
 * Without a key, emails are recorded in the store outbox (still durable).
 */
import crypto from 'crypto';
import { mutate } from './db.js';

export function mailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail({ to, subject, html, text, replyTo, tags }) {
  const from = process.env.MAIL_FROM || 'HeirReady <onboarding@resend.dev>';
  const payload = {
    id: crypto.randomUUID(),
    to,
    subject,
    html,
    text,
    from,
    replyTo: replyTo || null,
    tags: tags || null,
    at: new Date().toISOString(),
    status: 'queued',
  };

  if (!process.env.RESEND_API_KEY) {
    payload.status = 'logged';
    mutate((s) => {
      if (!s.mailOutbox) s.mailOutbox = [];
      s.mailOutbox.push(payload);
      if (s.mailOutbox.length > 500) s.mailOutbox = s.mailOutbox.slice(-400);
    });
    console.log(`[mail:logged] to=${to} subject=${subject}`);
    return { ok: true, mode: 'logged', id: payload.id };
  }

  const body = {
    from,
    to: [to],
    subject,
    html,
    text,
  };
  if (replyTo) body.reply_to = replyTo;
  if (tags?.length) body.tags = tags;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  payload.status = res.ok ? 'sent' : 'failed';
  payload.providerId = data.id || null;
  payload.error = res.ok ? null : data.message || `HTTP ${res.status}`;
  mutate((s) => {
    if (!s.mailOutbox) s.mailOutbox = [];
    s.mailOutbox.push(payload);
  });
  if (!res.ok) {
    const err = new Error(payload.error || 'Email send failed');
    err.data = data;
    throw err;
  }
  return { ok: true, mode: 'resend', id: data.id };
}

export async function sendInviteEmail({ to, estateName, role, link, inviterName }) {
  const subject = `${inviterName || 'A family member'} invited you to HeirReady — ${estateName}`;
  const text = `You've been invited to join the estate for ${estateName} as ${role}.\n\nAccept here:\n${link}\n\nThis link expires in 14 days.\n\nHeirReady — family continuity software (not legal advice).`;
  const html = `
    <div style="font-family:Georgia,serif;line-height:1.5;color:#14201a">
      <h2 style="font-weight:600">You're invited to HeirReady</h2>
      <p><strong>${inviterName || 'A family member'}</strong> asked you to join
      <strong>${estateName}</strong> as <strong>${role}</strong>.</p>
      <p><a href="${link}" style="display:inline-block;background:#2c4d3c;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none">Accept invite</a></p>
      <p style="font-size:13px;color:#3a4a42">Or open: ${link}</p>
      <p style="font-size:12px;color:#3a4a42">Not legal advice. Link expires in 14 days.</p>
    </div>
  `;
  return sendEmail({ to, subject, html, text });
}
