/**
 * Per-recipient email click tracking.
 * Resend “click tracking” only gives rates — these unique /r/:code links tell you who.
 */
import crypto from 'crypto';
import { mutate, readStore } from './db.js';

function appBase() {
  return (process.env.APP_URL || 'https://heirready.com').replace(/\/$/, '');
}

function shortCode() {
  return crypto.randomBytes(9).toString('base64url');
}

/**
 * @param {{ userId?: string|null, email?: string|null, campaign: string, destination: string, meta?: object }} opts
 * @returns {{ code: string, trackedUrl: string, id: string }}
 */
export function createTrackedLink(opts) {
  const campaign = String(opts.campaign || 'general').slice(0, 80);
  let destination = String(opts.destination || '/app').trim();
  if (!destination) destination = '/app';
  // Allow path or absolute same-site URL
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

  return record && destination
    ? { destination, link: record }
    : null;
}

export function listClickStats({ campaign, limit = 100 } = {}) {
  const store = readStore();
  const links = (store.clickLinks || [])
    .filter((c) => !campaign || c.campaign === campaign)
    .sort((a, b) => String(b.lastClickAt || b.createdAt).localeCompare(String(a.lastClickAt || a.createdAt)))
    .slice(0, limit);

  const events = (store.leads || [])
    .filter((l) => l.type === 'email_click' && (!campaign || l.campaign === campaign))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, limit);

  return {
    links: links.map((c) => ({
      code: c.code,
      email: c.email,
      userId: c.userId,
      campaign: c.campaign,
      destination: c.destination,
      clickCount: c.clickCount || 0,
      createdAt: c.createdAt,
      lastClickAt: c.lastClickAt,
    })),
    events,
  };
}
