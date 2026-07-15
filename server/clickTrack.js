/**
 * Per-link click tracking (email + WhatsApp) + signup attribution.
 * Resend “click tracking” only gives rates — these unique /r/:code links tell you who.
 */
import crypto from 'crypto';
import { mutate, readStore } from './db.js';
import { recordActivity } from './activity.js';

function appBase() {
  return (process.env.APP_URL || 'https://heirready.com').replace(/\/$/, '');
}

function shortCode() {
  return crypto.randomBytes(9).toString('base64url');
}

/** Append hr_ec=code to destination so the SPA can attribute signup later. */
export function destinationWithClickAttribution(destination, code) {
  try {
    const base = appBase();
    const url = new URL(destination, base);
    url.searchParams.set('hr_ec', code);
    return url.toString();
  } catch {
    const sep = String(destination).includes('?') ? '&' : '?';
    return `${destination}${sep}hr_ec=${encodeURIComponent(code)}`;
  }
}

/**
 * @param {{ userId?: string|null, email?: string|null, campaign: string, destination: string, meta?: object }} opts
 * @returns {{ code: string, trackedUrl: string, id: string }}
 */
export function createTrackedLink(opts) {
  const campaign = String(opts.campaign || 'general').slice(0, 80);
  let destination = String(opts.destination || '/app').trim();
  if (!destination) destination = '/app';
  if (destination.startsWith('/')) {
    destination = `${appBase()}${destination}`;
  }

  const id = crypto.randomUUID();
  const code = shortCode();
  const email = opts.email ? String(opts.email).trim().toLowerCase() : null;
  const userId = opts.userId || null;
  const channel =
    opts.channel ||
    opts.meta?.channel ||
    (email ? 'email' : 'whatsapp');

  mutate((s) => {
    if (!s.clickLinks) s.clickLinks = [];
    s.clickLinks.push({
      id,
      code,
      channel,
      userId,
      email,
      campaign,
      destination,
      meta: opts.meta || null,
      createdAt: new Date().toISOString(),
      clickCount: 0,
      lastClickAt: null,
      convertedAt: null,
      convertedUserId: null,
      convertedEmail: null,
    });
    if (s.clickLinks.length > 5000) s.clickLinks = s.clickLinks.slice(-4000);
  });

  return {
    id,
    code,
    trackedUrl: `${appBase()}/r/${code}`,
  };
}

/**
 * Create one tracked link per recipient for the same destination/campaign.
 * @returns {Array<{ email: string, userId: string|null, trackedUrl: string, code: string }>}
 */
export function createTrackedLinksForEmails(emails, { campaign, destination, meta } = {}) {
  const store = readStore();
  const out = [];
  for (const raw of emails || []) {
    const email = String(raw || '').trim().toLowerCase();
    if (!email) continue;
    const user = store.users.find((u) => String(u.email || '').toLowerCase() === email);
    const link = createTrackedLink({
      email,
      userId: user?.id || null,
      campaign,
      destination,
      meta: { ...(meta || {}), channel: 'email' },
      channel: 'email',
    });
    out.push({
      email,
      userId: user?.id || null,
      name: user?.name || null,
      trackedUrl: link.trackedUrl,
      code: link.code,
    });
  }
  return out;
}

/**
 * Mint a unique /r/:code for a logged-in WhatsApp share tap.
 * @param {{ id: string, name?: string, email?: string }} sharer
 */
export function createWhatsAppTrackedLink(
  sharer,
  { kind, destination, estateId, estateName, city, meta } = {}
) {
  const shareKind = String(kind || 'share').trim().slice(0, 48);
  let dest = String(destination || '').trim();
  if (!dest) throw new Error('destination required');
  if (dest.startsWith('/')) dest = `${appBase()}${dest}`;

  return createTrackedLink({
    userId: sharer.id,
    email: null,
    campaign: `wa_${shareKind}`,
    destination: dest,
    channel: 'whatsapp',
    meta: {
      channel: 'whatsapp',
      kind: shareKind,
      sharedByUserId: sharer.id,
      sharedByName: sharer.name || null,
      sharedByEmail: sharer.email || null,
      estateId: estateId || null,
      estateName: estateName || null,
      city: city || null,
      ...(meta || {}),
    },
  });
}

function linkChannel(row) {
  return row?.channel || row?.meta?.channel || (row?.email ? 'email' : 'whatsapp');
}

/**
 * WhatsApp / iMessage / Slack unfurlers fetch the URL for a preview when you compose
 * a message — that must not count as a human click.
 */
export function isLinkPreviewBot(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  if (!ua) return false;
  return /whatsapp|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|skypeuripreview|applebot|bingpreview|googlebot|yandex|duckduckbot|baiduspider|embedly|quora link preview|pinterest\/0\.|bitlybot|tumblr|vkshare|redditbot|semrushbot|ahrefsbot|preview/i.test(
    ua
  );
}

/** Resolve /r/:code — log click (humans only), return destination or null */
export function consumeClick(code, { ip, userAgent } = {}) {
  const token = String(code || '').trim();
  if (!token) return null;

  const store = readStore();
  const existing = (store.clickLinks || []).find((c) => c.code === token);
  if (!existing) return null;

  // Preview bots still get redirected (so unfurl works) but never inflate counts.
  if (isLinkPreviewBot(userAgent)) {
    return { destination: existing.destination, link: { ...existing }, previewOnly: true };
  }

  let destination = null;
  let record = null;

  mutate((s) => {
    if (!s.clickLinks) s.clickLinks = [];
    const row = s.clickLinks.find((c) => c.code === token);
    if (!row) return;
    row.clickCount = (row.clickCount || 0) + 1;
    row.lastClickAt = new Date().toISOString();
    destination = row.destination;
    record = { ...row };

    const ch = linkChannel(row);
    if (!s.leads) s.leads = [];
    s.leads.push({
      id: crypto.randomUUID(),
      type: ch === 'whatsapp' ? 'whatsapp_click' : 'email_click',
      channel: ch,
      campaign: row.campaign,
      code: row.code,
      userId: row.userId,
      email: row.email,
      destination: row.destination,
      clickCount: row.clickCount,
      meta: row.meta || null,
      ip: ip || null,
      userAgent: userAgent ? String(userAgent).slice(0, 240) : null,
      at: row.lastClickAt,
    });
  });

  if (record && destination) {
    try {
      const ch = linkChannel(record);
      recordActivity({
        type: ch === 'whatsapp' ? 'whatsapp_click' : 'email_click',
        userId: ch === 'whatsapp' ? record.meta?.sharedByUserId || record.userId : record.userId,
        email: ch === 'whatsapp' ? record.meta?.sharedByEmail : record.email,
        name: ch === 'whatsapp' ? record.meta?.sharedByName : null,
        meta: {
          channel: ch,
          campaign: record.campaign,
          code: record.code,
          kind: record.meta?.kind || null,
          destination,
          clickCount: record.clickCount,
          estateId: record.meta?.estateId || null,
          estateName: record.meta?.estateName || null,
        },
        ip: ip || null,
        userAgent: userAgent || null,
      });
    } catch (err) {
      console.error('activity link_click failed', err.message);
    }
  }

  return record && destination
    ? { destination, link: record }
    : null;
}

/**
 * One-shot: drop preview-bot "clicks" that already polluted WhatsApp / email stats.
 * Also treats near-instant whatsapp_click (compose-time unfurl) as non-human when UA missing.
 */
export function scrubPreviewBotClicks() {
  let scrubbed = 0;
  mutate((s) => {
    if (!s.leads) s.leads = [];
    if (!s.clickLinks) s.clickLinks = [];
    if (!s.activityEvents) s.activityEvents = [];

    const linksByCode = new Map(s.clickLinks.map((c) => [c.code, c]));
    const botLeadCodes = new Set();
    const keptLeads = [];
    for (const lead of s.leads) {
      if (lead.type !== 'whatsapp_click' && lead.type !== 'email_click') {
        keptLeads.push(lead);
        continue;
      }
      const isBotUa = isLinkPreviewBot(lead.userAgent);
      const link = lead.code ? linksByCode.get(lead.code) : null;
      const instantUnfurl =
        link &&
        lead.type === 'whatsapp_click' &&
        link.createdAt &&
        lead.at &&
        Math.abs(new Date(lead.at).getTime() - new Date(link.createdAt).getTime()) < 45_000;
      if (isBotUa || instantUnfurl) {
        if (lead.code) botLeadCodes.add(lead.code);
        scrubbed += 1;
        continue;
      }
      keptLeads.push(lead);
    }
    s.leads = keptLeads;

    s.activityEvents = (s.activityEvents || []).filter((e) => {
      if (e.type !== 'whatsapp_click' && e.type !== 'email_click') return true;
      if (isLinkPreviewBot(e.userAgent)) {
        scrubbed += 1;
        if (e.meta?.code) botLeadCodes.add(e.meta.code);
        return false;
      }
      const link = e.meta?.code ? linksByCode.get(e.meta.code) : null;
      if (
        e.type === 'whatsapp_click' &&
        link?.createdAt &&
        e.at &&
        Math.abs(new Date(e.at).getTime() - new Date(link.createdAt).getTime()) < 45_000
      ) {
        scrubbed += 1;
        if (e.meta?.code) botLeadCodes.add(e.meta.code);
        return false;
      }
      return true;
    });

    for (const row of s.clickLinks) {
      const humanLeads = keptLeads.filter(
        (l) =>
          l.code === row.code &&
          (l.type === 'whatsapp_click' || l.type === 'email_click')
      );
      if (humanLeads.length === 0) {
        if ((row.clickCount || 0) > 0 && !row.convertedAt) {
          row.clickCount = 0;
          row.lastClickAt = null;
          scrubbed += 1;
        }
      } else {
        row.clickCount = humanLeads.length;
        row.lastClickAt = humanLeads
          .map((l) => l.at)
          .sort()
          .at(-1);
      }
    }
  });
  return scrubbed;
}

/**
 * Tie a new signup to a prior email click (hr_ec code, or same-email fallback).
 * Mutates store inside `mutate` callback — pass the mutable store `s`.
 */
export function attachEmailClickOnRegister(s, user, emailClickCode) {
  if (!s.clickLinks) s.clickLinks = [];
  const signupEmail = String(user.email || '').trim().toLowerCase();
  const code = String(emailClickCode || '').trim();

  let link = null;
  if (code) {
    link = s.clickLinks.find((c) => c.code === code) || null;
  }
  if (!link && signupEmail) {
    link =
      s.clickLinks
        .filter(
          (c) =>
            c.email === signupEmail &&
            (c.clickCount || 0) > 0 &&
            !c.convertedAt
        )
        .sort((a, b) =>
          String(b.lastClickAt || b.createdAt).localeCompare(String(a.lastClickAt || a.createdAt))
        )[0] || null;
  }
  if (!link) return null;

  link.convertedAt = new Date().toISOString();
  link.convertedUserId = user.id;
  link.convertedEmail = signupEmail;
  const ch = linkChannel(link);
  user.clickAttribution = {
    code: link.code,
    campaign: link.campaign,
    channel: ch,
    mailedEmail: link.email,
    sharedByUserId: link.meta?.sharedByUserId || null,
    sharedByName: link.meta?.sharedByName || null,
    kind: link.meta?.kind || null,
    clickedAt: link.lastClickAt,
    attributedAt: link.convertedAt,
  };
  return {
    code: link.code,
    campaign: link.campaign,
    channel: ch,
    mailedEmail: link.email,
    sharedByUserId: link.meta?.sharedByUserId || null,
    sharedByName: link.meta?.sharedByName || null,
    kind: link.meta?.kind || null,
    signupEmail,
    differentEmail: Boolean(link.email && link.email !== signupEmail),
  };
}

function serializeLink(c, usersById) {
  const ch = linkChannel(c);
  const sharer =
    ch === 'whatsapp'
      ? usersById?.get(c.meta?.sharedByUserId || c.userId)
      : null;
  return {
    code: c.code,
    channel: ch,
    email: c.email,
    userId: c.userId,
    campaign: c.campaign,
    destination: c.destination,
    kind: c.meta?.kind || null,
    sharedByUserId: c.meta?.sharedByUserId || (ch === 'whatsapp' ? c.userId : null),
    sharedByName: c.meta?.sharedByName || sharer?.name || null,
    sharedByEmail: c.meta?.sharedByEmail || sharer?.email || null,
    estateId: c.meta?.estateId || null,
    estateName: c.meta?.estateName || null,
    clickCount: c.clickCount || 0,
    createdAt: c.createdAt,
    lastClickAt: c.lastClickAt,
    convertedAt: c.convertedAt || null,
    convertedUserId: c.convertedUserId || null,
    convertedEmail: c.convertedEmail || null,
  };
}

function matchesChannel(c, channel) {
  if (!channel || channel === 'all') return true;
  return linkChannel(c) === channel;
}

export function listClickStats({ campaign, channel = null, limit = 100 } = {}) {
  const store = readStore();
  const usersByEmail = new Map(
    (store.users || []).map((u) => [String(u.email || '').toLowerCase(), u])
  );
  const usersById = new Map((store.users || []).map((u) => [u.id, u]));

  const all = (store.clickLinks || [])
    .filter((c) => matchesChannel(c, channel))
    .filter((c) => !campaign || c.campaign === campaign);
  const links = [...all]
    .sort((a, b) =>
      String(b.lastClickAt || b.createdAt).localeCompare(String(a.lastClickAt || a.createdAt))
    )
    .slice(0, limit)
    .map((c) => serializeLink(c, usersById));

  const events = (store.leads || [])
    .filter(
      (l) =>
        (l.type === 'email_click' || l.type === 'whatsapp_click') &&
        matchesChannel({ channel: l.channel || l.meta?.channel, email: l.email, meta: l.meta }, channel) &&
        (!campaign || l.campaign === campaign)
    )
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, limit);

  const clicked = all.filter((c) => (c.clickCount || 0) > 0);
  const waiting = all.filter((c) => !(c.clickCount > 0));
  const converted = clicked.filter((c) => c.convertedAt);
  /** Clicked, never attributed signup. Email: also skip if mailed address already has account. */
  const abandoned = clicked.filter((c) => {
    if (c.convertedAt) return false;
    if (linkChannel(c) === 'whatsapp') return true;
    if (c.email && usersByEmail.has(c.email)) return false;
    return true;
  });
  /** Clicked, have an account on mailed email, but never stamped conversion (legacy / missed hr_ec). */
  const signedUpSameEmail = clicked.filter((c) => {
    if (c.convertedAt) return false;
    return Boolean(c.email && usersByEmail.has(c.email));
  });

  return {
    links,
    events,
    waiting: waiting.map((c) => serializeLink(c, usersById)),
    abandoned: abandoned
      .sort((a, b) => String(b.lastClickAt || '').localeCompare(String(a.lastClickAt || '')))
      .map((c) => serializeLink(c, usersById)),
    converted: converted
      .sort((a, b) => String(b.convertedAt || '').localeCompare(String(a.convertedAt || '')))
      .map((c) => serializeLink(c, usersById)),
    signedUpSameEmail: signedUpSameEmail.map((c) => {
      const u = usersByEmail.get(c.email);
      return {
        ...serializeLink(c, usersById),
        userName: u?.name || null,
        userCreatedAt: u?.createdAt || null,
      };
    }),
  };
}
