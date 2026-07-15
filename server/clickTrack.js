/**
 * Per-recipient email click tracking + signup attribution.
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

  mutate((s) => {
    if (!s.clickLinks) s.clickLinks = [];
    s.clickLinks.push({
      id,
      code,
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
      meta,
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

/** Resolve /r/:code — log click, return destination or null */
export function consumeClick(code, { ip, userAgent } = {}) {
  const token = String(code || '').trim();
  if (!token) return null;

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

    if (!s.leads) s.leads = [];
    s.leads.push({
      id: crypto.randomUUID(),
      type: 'email_click',
      campaign: row.campaign,
      code: row.code,
      userId: row.userId,
      email: row.email,
      destination: row.destination,
      clickCount: row.clickCount,
      ip: ip || null,
      userAgent: userAgent ? String(userAgent).slice(0, 240) : null,
      at: row.lastClickAt,
    });
  });

  if (record && destination) {
    try {
      recordActivity({
        type: 'email_click',
        userId: record.userId,
        email: record.email,
        meta: {
          campaign: record.campaign,
          code: record.code,
          destination,
          clickCount: record.clickCount,
        },
        ip: ip || null,
        userAgent: userAgent || null,
      });
    } catch (err) {
      console.error('activity email_click failed', err.message);
    }
  }

  return record && destination
    ? { destination, link: record }
    : null;
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
  user.emailAttribution = {
    code: link.code,
    campaign: link.campaign,
    mailedEmail: link.email,
    clickedAt: link.lastClickAt,
    attributedAt: link.convertedAt,
  };
  return {
    code: link.code,
    campaign: link.campaign,
    mailedEmail: link.email,
    signupEmail,
    differentEmail: Boolean(link.email && link.email !== signupEmail),
  };
}

function serializeLink(c) {
  return {
    code: c.code,
    email: c.email,
    userId: c.userId,
    campaign: c.campaign,
    destination: c.destination,
    clickCount: c.clickCount || 0,
    createdAt: c.createdAt,
    lastClickAt: c.lastClickAt,
    convertedAt: c.convertedAt || null,
    convertedUserId: c.convertedUserId || null,
    convertedEmail: c.convertedEmail || null,
  };
}

export function listClickStats({ campaign, limit = 100 } = {}) {
  const store = readStore();
  const usersByEmail = new Map(
    (store.users || []).map((u) => [String(u.email || '').toLowerCase(), u])
  );

  const all = (store.clickLinks || []).filter((c) => !campaign || c.campaign === campaign);
  const links = [...all]
    .sort((a, b) =>
      String(b.lastClickAt || b.createdAt).localeCompare(String(a.lastClickAt || a.createdAt))
    )
    .slice(0, limit)
    .map(serializeLink);

  const events = (store.leads || [])
    .filter((l) => l.type === 'email_click' && (!campaign || l.campaign === campaign))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, limit);

  const clicked = all.filter((c) => (c.clickCount || 0) > 0);
  const waiting = all.filter((c) => !(c.clickCount > 0));
  const converted = clicked.filter((c) => c.convertedAt);
  /** Clicked mail, never attributed a signup (and no account on the mailed address). */
  const abandoned = clicked.filter((c) => {
    if (c.convertedAt) return false;
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
    waiting: waiting.map(serializeLink),
    abandoned: abandoned
      .sort((a, b) => String(b.lastClickAt || '').localeCompare(String(a.lastClickAt || '')))
      .map(serializeLink),
    converted: converted
      .sort((a, b) => String(b.convertedAt || '').localeCompare(String(a.convertedAt || '')))
      .map(serializeLink),
    signedUpSameEmail: signedUpSameEmail.map((c) => {
      const u = usersByEmail.get(c.email);
      return {
        ...serializeLink(c),
        userName: u?.name || null,
        userCreatedAt: u?.createdAt || null,
      };
    }),
  };
}
