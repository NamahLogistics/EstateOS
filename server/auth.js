import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { mutate, readStore } from './db.js';
import { applyPlanExpiryInPlace, planPublicFields } from './plans.js';

const SECRET = process.env.JWT_SECRET || 'estate-os-dev-secret';

/** Emails that always have app admin (comma-separated). Default: founder. */
export function adminEmailList() {
  const raw =
    process.env.ADMIN_EMAILS || 'mishra.shubham0301@gmail.com';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAppAdmin(user) {
  if (!user) return false;
  if (user.isAdmin === true) return true;
  const email = String(user.email || '').trim().toLowerCase();
  return Boolean(email && adminEmailList().includes(email));
}

export function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name, mfa: true }, SECRET, {
    expiresIn: '30d',
  });
}

/** Short-lived token after password — must complete MFA before full session. */
export function signMfaPendingToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, mfaPending: true },
    SECRET,
    { expiresIn: '10m' }
  );
}

export function verifyMfaPendingToken(token) {
  try {
    const payload = jwt.verify(String(token || ''), SECRET);
    if (!payload?.mfaPending || !payload.sub) return null;
    return payload;
  } catch {
    return null;
  }
}

export function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Sign in required' });
  try {
    const payload = jwt.verify(token, SECRET);
    if (payload.mfaPending) {
      return res.status(401).json({ error: 'Complete two-factor authentication first' });
    }
    const store = readStore();
    const user = store.users.find((u) => u.id === payload.sub);
    if (!user) return res.status(401).json({ error: 'User not found' });

    if (applyPlanExpiryInPlace(user)) {
      mutate((s) => {
        const u = s.users.find((x) => x.id === user.id);
        if (!u) return;
        applyPlanExpiryInPlace(u);
      });
    }

    const planFields = planPublicFields(user);
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      plan: planFields.plan,
      planExpiresAt: planFields.planExpiresAt,
      planActive: planFields.planActive,
      accountType: user.accountType || 'family',
      isAdmin: isAppAdmin(user),
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid session' });
  }
}

/** Prefer session admin; fall back to X-Admin-Key for scripts. */
export function adminRequired(req, res, next) {
  const key = process.env.ADMIN_API_KEY;
  if (key && req.get('X-Admin-Key') === key) return next();
  return authRequired(req, res, () => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Admin only' });
    }
    next();
  });
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key)));
  });
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password, hash) {
  const [salt, key] = String(hash || '').split(':');
  if (!salt || !key) return false;
  const derived = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, buf) => (err ? reject(err) : resolve(buf)));
  });
  const a = Buffer.from(key, 'hex');
  const b = derived;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
