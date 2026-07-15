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
  const subject = `${inviterName || 'A sibling'} invited you to HeirReady — ${estateName}`;
  const text = `${inviterName || 'A family member'} invited you to join the estate for ${estateName} as ${role}.\n\nThis is for siblings / family sharing Mum/Dad’s life admin — parents don’t need an account.\n\nTens of thousands of crores sit unclaimed in Indian banks, insurance & IEPF — often because heirs never knew what existed. Mapping early means your family isn’t starting blind.\n\nAccept here:\n${link}\n\nThis link expires in 14 days.\n\nHeirReady — not legal advice.`;
  const html = `
    <div style="font-family:Georgia,serif;line-height:1.5;color:#14201a">
      <h2 style="font-weight:600">You’re invited to the family vault</h2>
      <p><strong>${inviterName || 'A sibling'}</strong> asked you to join
      <strong>${estateName}</strong> as <strong>${role}</strong>.</p>
      <p style="color:#3a4a42">For brothers, sisters, and co-managing relatives — parents don’t need to sign up.</p>
      <p style="color:#3a4a42">Tens of thousands of crores sit unclaimed in Indian banks, insurance &amp; IEPF — often because heirs never knew what existed. Mapping early means your family isn’t starting blind.</p>
      <p><a href="${link}" style="display:inline-block;background:#2c4d3c;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none">Accept invite</a></p>
      <p style="font-size:13px;color:#3a4a42">Or open: ${link}</p>
      <p style="font-size:12px;color:#3a4a42">Not legal advice. Link expires in 14 days.</p>
    </div>
  `;
  return sendEmail({ to, subject, html, text });
}

export async function sendPasswordResetEmail({ to, name, link }) {
  const subject = 'Reset your HeirReady password';
  const text = `Hi ${name || 'there'},\n\nReset your HeirReady password with this link (expires in 1 hour):\n${link}\n\nIf you didn’t ask for this, you can ignore this email.\n\nHeirReady`;
  const html = `
    <div style="font-family:Georgia,serif;line-height:1.5;color:#14201a">
      <h2 style="font-weight:600;margin:0 0 12px">Reset your password</h2>
      <p style="margin:0 0 16px">Hi ${name || 'there'}, we received a request to reset your HeirReady password.</p>
      <p><a href="${link}" style="display:inline-block;background:#2c4d3c;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none">Choose a new password</a></p>
      <p style="font-size:13px;color:#3a4a42">Or open: ${link}</p>
      <p style="font-size:12px;color:#3a4a42;margin:16px 0 0">This link expires in 1 hour. If you didn’t ask for a reset, ignore this email.</p>
    </div>
  `;
  return sendEmail({
    to,
    subject,
    html,
    text,
    tags: [{ name: 'category', value: 'password_reset' }],
  });
}

/** Checkout failed — give the customer a durable pay link + alternate ways to finish. */
export async function sendPaymentRecoveryEmail({
  to,
  name,
  planLabel,
  amountRupees,
  payUrl,
  failReason,
}) {
  const first = String(name || 'there').split(/\s+/)[0] || 'there';
  const amount =
    amountRupees != null
      ? `₹${Number(amountRupees).toLocaleString('en-IN')}`
      : 'your plan';
  const subject = `Finish your HeirReady ${planLabel || 'plan'} payment`;
  const reasonBit = failReason ? `\n\nWhat we saw: ${failReason}` : '';
  const text = `Hi ${first},

Your checkout for HeirReady ${planLabel || 'plan'} (${amount}) didn’t finish — international cards sometimes time out or get blocked by the bank.${reasonBit}

Finish anytime with this secure link (UPI in India works best if a relative can help):
${payUrl}

Tips if your card failed from abroad:
1. Retry the link with another Visa/Mastercard
2. Ask family in India to open the same link and pay with UPI (they don’t need your password)
3. When the link is paid, your HeirReady plan unlocks automatically — sign in and open the app
4. Reply to this email if you’re stuck — we’ll help

HeirReady`;
  const html = `
    <div style="font-family:Georgia,serif;line-height:1.5;color:#14201a">
      <h2 style="font-weight:600;margin:0 0 12px">Finish your ${planLabel || 'plan'} payment</h2>
      <p style="margin:0 0 12px">Hi ${first}, your checkout for <strong>${planLabel || 'HeirReady'}</strong> (${amount}) didn’t complete — foreign cards sometimes time out or get blocked mid-way.</p>
      ${failReason ? `<p style="margin:0 0 12px;font-size:13px;color:#3a4a42">What we saw: ${String(failReason).slice(0, 180)}</p>` : ''}
      <p style="margin:0 0 16px"><a href="${payUrl}" style="display:inline-block;background:#2c4d3c;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none">Pay ${amount} securely</a></p>
      <p style="margin:0 0 8px;font-weight:600">If your card failed from abroad</p>
      <ol style="margin:0 0 16px;padding-left:1.2rem;color:#3a4a42">
        <li>Retry the link with another Visa / Mastercard</li>
        <li>Ask family in India to open the same link and pay with <strong>UPI</strong> (they don’t need your password)</li>
        <li>When paid, your plan unlocks automatically — sign in and open the app</li>
        <li>Reply to this email if you’re stuck — we’ll help</li>
      </ol>
      <p style="font-size:13px;color:#3a4a42">Or open: ${payUrl}</p>
      <p style="font-size:12px;color:#3a4a42;margin:16px 0 0">HeirReady — not legal advice.</p>
    </div>
  `;
  return sendEmail({
    to,
    subject,
    html,
    text,
    tags: [{ name: 'category', value: 'payment_recovery' }],
  });
}

export async function sendEstateThreadNotify({
  to,
  recipientName,
  estateName,
  authorName,
  body,
  link,
}) {
  const preview = String(body || '').slice(0, 280);
  const subject = `${estateName}: new family note from ${authorName || 'someone'}`;
  const text = `Hi ${recipientName || 'there'},\n\n${authorName || 'A family member'} posted on ${estateName}:\n\n"${preview}"\n\nOpen the family thread:\n${link}\n\nHeirReady — family continuity (not legal advice).`;
  const html = `
    <div style="font-family:Georgia,serif;line-height:1.5;color:#14201a">
      <p style="display:inline-block;background:#2c4d3c;color:#fff;padding:6px 12px;border-radius:999px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;margin:0 0 12px">Family thread</p>
      <h2 style="margin:0 0 8px;font-weight:600">${estateName}</h2>
      <p style="margin:0 0 12px"><strong>${authorName || 'A family member'}</strong> posted:</p>
      <p style="margin:0 0 16px;padding:12px 14px;background:#eef2ef;border-radius:12px;white-space:pre-wrap">${preview.replace(/</g, '&lt;')}</p>
      <p><a href="${link}" style="display:inline-block;background:#2c4d3c;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none">Open family thread</a></p>
      <p style="font-size:12px;color:#3a4a42;margin:16px 0 0">You’re getting this because you’re on this estate. Not legal advice.</p>
    </div>
  `;
  return sendEmail({
    to,
    subject,
    html,
    text,
    tags: [{ name: 'category', value: 'estate_thread' }],
  });
}

export async function sendVaultChangeEmail({
  to,
  recipientName,
  estateName,
  actorName,
  actionLabel,
  itemTitle,
  categoryLabel,
  link,
}) {
  const subject = `${estateName}: ${actorName || 'A sibling'} ${actionLabel}`;
  const detail = [itemTitle, categoryLabel].filter(Boolean).join(' · ');
  const text =
    `Hi ${recipientName || 'there'},\n\n` +
    `${actorName || 'A family member'} ${actionLabel} on ${estateName}` +
    (detail ? `: ${detail}` : '') +
    `.\n\nOpen the vault:\n${link}\n\n` +
    `You’re getting this because you’re on this Life Map. HeirReady — not legal advice.`;
  const html = `
    <div style="font-family:Georgia,serif;line-height:1.5;color:#14201a">
      <p style="display:inline-block;background:#2c4d3c;color:#fff;padding:6px 12px;border-radius:999px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;margin:0 0 12px">Vault update</p>
      <h2 style="margin:0 0 8px;font-weight:600">${estateName}</h2>
      <p style="margin:0 0 12px"><strong>${actorName || 'A family member'}</strong> ${actionLabel}${
        detail ? ':' : '.'
      }</p>
      ${
        detail
          ? `<p style="margin:0 0 16px;padding:12px 14px;background:#eef2ef;border-radius:12px">${detail.replace(
              /</g,
              '&lt;'
            )}</p>`
          : ''
      }
      <p><a href="${link}" style="display:inline-block;background:#2c4d3c;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none">Open vault</a></p>
      <p style="font-size:12px;color:#3a4a42;margin:16px 0 0">You’re on this Life Map. Not legal advice.</p>
    </div>
  `;
  return sendEmail({
    to,
    subject,
    html,
    text,
    tags: [{ name: 'category', value: 'vault_change' }],
  });
}

export async function sendHousewarmingCompleteEmail({ to, name, estateName, link }) {
  const subject = `${estateName}: housewarming done — invite a sibling`;
  const text =
    `Hi ${name || 'there'},\n\n` +
    `You’ve finished Digital Housewarming for ${estateName} on HeirReady.\n\n` +
    `Next: invite a sibling on WhatsApp so they can add what they know, and share the fridge QR.\n\n` +
    `Open the file:\n${link}\n\n` +
    `HeirReady — not legal advice.`;
  const html = `
    <div style="font-family:Georgia,serif;line-height:1.5;color:#14201a">
      <h2 style="font-weight:600;margin:0 0 12px">Housewarming complete</h2>
      <p style="margin:0 0 12px">Hi ${name || 'there'}, you’ve finished setup for <strong>${estateName}</strong>.</p>
      <p style="margin:0 0 16px">Invite a sibling on WhatsApp and share the fridge QR so family isn’t stuck guessing later.</p>
      <p><a href="${link}" style="display:inline-block;background:#2c4d3c;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none">Open ${estateName}</a></p>
      <p style="font-size:12px;color:#3a4a42;margin:16px 0 0">Not legal advice.</p>
    </div>
  `;
  return sendEmail({
    to,
    subject,
    html,
    text,
    tags: [{ name: 'category', value: 'housewarming_complete' }],
  });
}

export async function sendSiblingJoinedEmail({
  to,
  ownerName,
  siblingName,
  estateName,
  link,
}) {
  const subject = `${siblingName} joined ${estateName} on HeirReady`;
  const text =
    `Hi ${ownerName || 'there'},\n\n` +
    `Good news: ${siblingName} just joined the family vault for ${estateName}.\n\n` +
    `Invite another sibling while you’re at it:\n${link}\n\n` +
    `HeirReady — not legal advice.`;
  const html = `
    <div style="font-family:Georgia,serif;line-height:1.5;color:#14201a">
      <h2 style="font-weight:600;margin:0 0 12px">Sibling joined</h2>
      <p style="margin:0 0 12px">Hi ${ownerName || 'there'}, <strong>${siblingName}</strong> joined <strong>${estateName}</strong>.</p>
      <p style="margin:0 0 16px">Invite another sibling so more of the family can add what they know.</p>
      <p><a href="${link}" style="display:inline-block;background:#2c4d3c;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none">Open family tab</a></p>
      <p style="font-size:12px;color:#3a4a42;margin:16px 0 0">Not legal advice.</p>
    </div>
  `;
  return sendEmail({
    to,
    subject,
    html,
    text,
    tags: [{ name: 'category', value: 'sibling_joined' }],
  });
}

export async function sendLightReviewNudgeEmail({ to, name, estateName, link, waText }) {
  const subject = `${estateName}: quick check-in — same maid? same LIC?`;
  const text =
    `Hi ${name || 'there'},\n\n` +
    `It’s been about 90 days since you set up ${estateName} on HeirReady.\n\n` +
    `Quick check: same maid / nurse phone? Same LIC / bank? Any new caregiver?\n\n` +
    `Open the Life Map:\n${link}\n\n` +
    (waText ? `WhatsApp a sibling:\n${waText}\n\n` : '') +
    `HeirReady — not legal advice.`;
  const html = `
    <div style="font-family:Georgia,serif;line-height:1.5;color:#14201a">
      <h2 style="font-weight:600;margin:0 0 12px">90-day check-in</h2>
      <p style="margin:0 0 12px">Hi ${name || 'there'}, a light nudge for <strong>${estateName}</strong>.</p>
      <p style="margin:0 0 16px">Same maid / nurse phone? Same LIC or bank? Add anything new — takes a few minutes.</p>
      <p><a href="${link}" style="display:inline-block;background:#2c4d3c;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none">Open Life Map</a></p>
      <p style="font-size:12px;color:#3a4a42;margin:16px 0 0">Not legal advice.</p>
    </div>
  `;
  return sendEmail({
    to,
    subject,
    html,
    text,
    tags: [{ name: 'category', value: 'light_review' }],
  });
}

/** Abandoned signup drip — family accounts with no parent file yet */
export async function sendActivationNudgeEmail({ to, name, link, step }) {
  const first = String(name || '').trim().split(/\s+/)[0] || 'there';
  const copy = {
    '1h': {
      subject: 'Next step: map one parent on HeirReady (20 min)',
      lead: `You’ve signed up — the useful part is creating Mum or Dad’s file.`,
      body: `It takes about twenty minutes on a call. Banks, LIC, maid phone — so you’re not guessing on WhatsApp later.`,
      cta: 'Create a parent file',
    },
    '1d': {
      subject: `${first}, still need to set up a parent file?`,
      lead: `Your HeirReady account is ready. One parent file unlocks the housewarming checklist.`,
      body: `No lawyers today — just practical life admin you can help with from abroad.`,
      cta: 'Start Digital Housewarming',
    },
    '3d': {
      subject: 'Last nudge: finish HeirReady setup for one parent',
      lead: `We’ll stop emailing about this — but the vault only helps once there’s a parent file.`,
      body: `Create one file, run the 20‑minute housewarming, invite a sibling. Free plan covers the first map.`,
      cta: 'Open HeirReady',
    },
  };
  const c = copy[step] || copy['1d'];
  const text =
    `Hi ${first},\n\n` +
    `${c.lead}\n\n` +
    `${c.body}\n\n` +
    `${c.cta}:\n${link}\n\n` +
    `HeirReady — not legal advice. Reply to this email if you’re stuck.`;
  const html = `
    <div style="font-family:Georgia,serif;line-height:1.5;color:#14201a">
      <h2 style="font-weight:600;margin:0 0 12px">${c.cta}</h2>
      <p style="margin:0 0 12px">Hi ${first},</p>
      <p style="margin:0 0 12px">${c.lead}</p>
      <p style="margin:0 0 16px">${c.body}</p>
      <p><a href="${link}" style="display:inline-block;background:#2c4d3c;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none">${c.cta}</a></p>
      <p style="font-size:12px;color:#3a4a42;margin:16px 0 0">Not legal advice. You’re getting this because you signed up and haven’t created a parent file yet.</p>
    </div>
  `;
  return sendEmail({
    to,
    subject: c.subject,
    html,
    text,
    tags: [
      { name: 'category', value: 'activation' },
      { name: 'step', value: String(step) },
    ],
  });
}
