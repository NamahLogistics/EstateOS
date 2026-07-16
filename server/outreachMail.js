/**
 * Admin outreach that always uses tracked /r/:code links + activity.
 */
import { createTrackedLink } from './clickTrack.js';
import { sendEmail } from './mail.js';
import { recordActivity } from './activity.js';
import { readStore } from './db.js';

function appBase() {
  return (process.env.APP_URL || 'https://heirready.com').replace(/\/$/, '');
}

/**
 * @param {{
 *   to: string,
 *   subject: string,
 *   html?: string,
 *   text?: string,
 *   campaign: string,
 *   destination: string,
 *   name?: string|null,
 *   ctaLabel?: string,
 *   meta?: object,
 * }} opts
 */
export async function sendTrackedOutreachEmail(opts) {
  const to = String(opts.to || '')
    .trim()
    .toLowerCase();
  const subject = String(opts.subject || '').trim();
  const campaign = String(opts.campaign || 'outreach').trim().slice(0, 80);
  let destination = String(opts.destination || '').trim();
  if (!to || !to.includes('@')) throw new Error('Valid to email required');
  if (!subject) throw new Error('subject required');
  if (!destination) throw new Error('destination required (page they should open)');
  if (destination.startsWith('/')) destination = `${appBase()}${destination}`;

  const store = readStore();
  const user = store.users.find((u) => String(u.email || '').toLowerCase() === to);
  const link = createTrackedLink({
    email: to,
    userId: user?.id || null,
    campaign,
    destination,
    channel: 'email',
    meta: {
      ...(opts.meta || {}),
      channel: 'email',
      kind: opts.meta?.kind || 'outreach',
      subject,
    },
  });

  const trackedUrl = link.trackedUrl;
  const ctaLabel = opts.ctaLabel || 'Open HeirReady';
  let html = String(opts.html || '').trim();
  let text = String(opts.text || '').trim();

  if (html) {
    html = html.includes('{{TRACKED_URL}}')
      ? html.split('{{TRACKED_URL}}').join(trackedUrl)
      : `${html}
      <p style="margin:24px 0"><a href="${trackedUrl}" style="display:inline-block;background:#2c4d3c;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none">${ctaLabel}</a></p>
      <p style="font-size:13px;color:#3a4a42">Or open: ${trackedUrl}</p>`;
  } else {
    html = `
      <div style="font-family:Georgia,serif;line-height:1.55;color:#14201a">
        <p>${(opts.name || 'there').replace(/</g, '')},</p>
        <p><a href="${trackedUrl}" style="display:inline-block;background:#2c4d3c;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none">${ctaLabel}</a></p>
        <p style="font-size:13px;color:#3a4a42">Or open: ${trackedUrl}</p>
        <p>— HeirReady</p>
      </div>`;
  }

  if (text) {
    text = text.includes('{{TRACKED_URL}}')
      ? text.split('{{TRACKED_URL}}').join(trackedUrl)
      : `${text}\n\n${ctaLabel}:\n${trackedUrl}\n`;
  } else {
    text = `${subject}\n\n${ctaLabel}:\n${trackedUrl}\n\n— HeirReady\n`;
  }

  const sent = await sendEmail({
    to,
    subject,
    html,
    text,
    tags: [
      { name: 'category', value: 'outreach' },
      { name: 'campaign', value: campaign.slice(0, 40) },
    ],
  });

  recordActivity({
    type: 'email_sent',
    userId: user?.id || null,
    email: to,
    name: opts.name || user?.name || null,
    meta: {
      campaign,
      subject,
      code: link.code,
      destination,
      trackedUrl,
      kind: opts.meta?.kind || 'outreach',
      providerId: sent?.id || null,
      mode: sent?.mode || null,
    },
  });

  return {
    ok: true,
    to,
    campaign,
    code: link.code,
    trackedUrl,
    destination,
    mailId: sent?.id || null,
  };
}
