import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { readStore } from './db.js';

const SECRET = process.env.JWT_SECRET || 'estate-os-dev-secret';

export function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name }, SECRET, {
    expiresIn: '30d',
  });
}

export function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Sign in required' });
  try {
    const payload = jwt.verify(token, SECRET);
    const store = readStore();
    const user = store.users.find((u) => u.id === payload.sub);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan,
      accountType: user.accountType || 'family',
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid session' });
  }
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
