/**
 * Product activity feed for admin — who shared, joined, signed up, etc.
 */
import crypto from 'crypto';
import { mutate, readStore } from './db.js';

const CLIENT_TYPES = new Set(['whatsapp_share', 'copy_link', 'checkout']);
const MAX_EVENTS = 8000;
const TRIM_TO = 6000;

/**
 * @param {{
 *   type: string,
 *   userId?: string|null,
 *   email?: string|null,
 *   name?: string|null,
 *   meta?: object,
 *   path?: string|null,
 *   ip?: string|null,
 *   userAgent?: string|null,
 * }} opts
 */
export function recordActivity(opts) {
  const type = String(opts.type || '').trim().slice(0, 64);
  if (!type) return null;

  const at = new Date().toISOString();
  const event = {
    id: crypto.randomUUID(),
    type,
    userId: opts.userId || null,
    email: opts.email ? String(opts.email).trim().toLowerCase() : null,
    name: opts.name ? String(opts.name).trim().slice(0, 120) : null,
    meta: opts.meta && typeof opts.meta === 'object' ? sanitizeMeta(opts.meta) : null,
    path: opts.path ? String(opts.path).slice(0, 240) : null,
    ip: opts.ip || null,
    userAgent: opts.userAgent ? String(opts.userAgent).slice(0, 240) : null,
    at,
  };

  mutate((s) => {
    if (!s.activityEvents) s.activityEvents = [];
    s.activityEvents.push(event);
    if (s.activityEvents.length > MAX_EVENTS) {
      s.activityEvents = s.activityEvents.slice(-TRIM_TO);
    }
  });

  return event;
}

function sanitizeMeta(meta) {
  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v == null) continue;
    const key = String(k).slice(0, 48);
    if (typeof v === 'string') out[key] = v.slice(0, 400);
    else if (typeof v === 'number' || typeof v === 'boolean') out[key] = v;
    else if (typeof v === 'object') {
      try {
        out[key] = JSON.parse(JSON.stringify(v));
      } catch {
        /* skip */
      }
    }
  }
  return out;
}

export function isClientActivityType(type) {
  return CLIENT_TYPES.has(String(type || ''));
}

/**
 * @param {{ type?: string|null, limit?: number }} opts
 */
export function listActivity({ type = null, limit = 200 } = {}) {
  const store = readStore();
  const lim = Math.min(Math.max(Number(limit) || 200, 1), 500);
  let rows = store.activityEvents || [];
  if (type) {
    const t = String(type).trim();
    rows = rows.filter((e) => e.type === t || e.meta?.kind === t);
  }
  rows = [...rows].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, lim);

  const usersById = new Map((store.users || []).map((u) => [u.id, u]));
  return rows.map((e) => {
    const u = e.userId ? usersById.get(e.userId) : null;
    return {
      id: e.id,
      type: e.type,
      userId: e.userId,
      email: e.email || u?.email || null,
      name: e.name || u?.name || null,
      meta: e.meta || null,
      path: e.path || null,
      at: e.at,
    };
  });
}
