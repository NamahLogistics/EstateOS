import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const storePath = path.join(dataDir, 'store.json');
const uploadsDir = path.join(dataDir, 'uploads');

const empty = () => ({
  users: [],
  estates: [],
  items: [],
  members: [],
  unlockRequests: [],
  tasks: [],
  audit: [],
  lawyers: [],
  engagements: [],
  legalNotes: [],
  legalActions: [],
  counselNeeds: [],
  counselListings: [],
  careWorkers: [],
  invites: [],
  estateThreadPosts: [],
  referrals: [],
  leads: [],
  mailOutbox: [],
  pendingPayments: [],
  notifications: [],
  pushSubscriptions: [],
  clickLinks: [],
  activityEvents: [],
});

function migrate(store) {
  const base = empty();
  for (const key of Object.keys(base)) {
    if (!Array.isArray(store[key])) store[key] = [];
  }
  return store;
}

let pool = null;
let mode = 'file';
let cache = empty();
let persistChain = Promise.resolve();

function ensureDirs() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
}

async function persistNow(snapshot) {
  const data = migrate(structuredClone(snapshot));
  if (mode === 'postgres') {
    await pool.query(
      'UPDATE estate_os_store SET data = $1::jsonb, updated_at = now() WHERE id = 1',
      [JSON.stringify(data)]
    );
    return;
  }
  ensureDirs();
  const tmp = `${storePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, storePath);
}

function enqueuePersist() {
  const snap = structuredClone(cache);
  persistChain = persistChain
    .then(() => persistNow(snap))
    .catch((err) => console.error('persist failed', err));
  return persistChain;
}

export async function initDb() {
  ensureDirs();
  const url = process.env.DATABASE_URL;
  if (url) {
    pool = new pg.Pool({
      connectionString: url,
      ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
    });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS estate_os_store (
        id integer PRIMARY KEY DEFAULT 1,
        data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS estate_os_files (
        id text PRIMARY KEY,
        name text NOT NULL,
        mime text,
        size integer NOT NULL,
        data bytea NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const { rows } = await pool.query('SELECT data FROM estate_os_store WHERE id = 1');
    if (!rows.length) {
      cache = empty();
      await pool.query('INSERT INTO estate_os_store (id, data) VALUES (1, $1::jsonb)', [
        JSON.stringify(cache),
      ]);
    } else {
      cache = migrate(rows[0].data);
    }
    mode = 'postgres';
    console.log('HeirReady persistence: Postgres (durable store + files)');
  } else {
    if (fs.existsSync(storePath)) {
      cache = migrate(JSON.parse(fs.readFileSync(storePath, 'utf8')));
    } else {
      cache = empty();
      fs.writeFileSync(storePath, JSON.stringify(cache, null, 2));
    }
    mode = 'file';
    console.warn('HeirReady persistence: local file — add DATABASE_URL for production durability');
  }
  return mode;
}

export async function saveUpload({ id, name, mime, buffer }) {
  const fileId = id || crypto.randomUUID();
  if (mode === 'postgres') {
    await pool.query(
      `INSERT INTO estate_os_files (id, name, mime, size, data)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, mime = EXCLUDED.mime, size = EXCLUDED.size, data = EXCLUDED.data`,
      [fileId, name, mime || 'application/octet-stream', buffer.length, buffer]
    );
  } else {
    ensureDirs();
    fs.writeFileSync(path.join(uploadsDir, fileId), buffer);
    fs.writeFileSync(
      path.join(uploadsDir, `${fileId}.meta.json`),
      JSON.stringify({ name, mime, size: buffer.length })
    );
  }
  return {
    id: fileId,
    name,
    mime: mime || 'application/octet-stream',
    size: buffer.length,
    path: `/uploads/${fileId}`,
  };
}

export async function readUpload(fileId) {
  if (mode === 'postgres') {
    const { rows } = await pool.query(
      'SELECT id, name, mime, size, data FROM estate_os_files WHERE id = $1',
      [fileId]
    );
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      name: rows[0].name,
      mime: rows[0].mime,
      size: rows[0].size,
      buffer: rows[0].data,
    };
  }
  const abs = path.join(uploadsDir, fileId);
  if (!fs.existsSync(abs)) return null;
  let meta = { name: fileId, mime: 'application/octet-stream' };
  const metaPath = path.join(uploadsDir, `${fileId}.meta.json`);
  if (fs.existsSync(metaPath)) meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  return {
    id: fileId,
    name: meta.name,
    mime: meta.mime,
    size: meta.size,
    buffer: fs.readFileSync(abs),
  };
}

export function readStore() {
  return cache;
}

export function writeStore(store) {
  cache = migrate(store);
  enqueuePersist();
}

export function mutate(fn) {
  const result = fn(cache);
  enqueuePersist();
  return result;
}

export async function flushPersist() {
  await persistChain;
}

export function audit(store, { estateId, userId, action, detail }) {
  store.audit.push({
    id: crypto.randomUUID(),
    estateId: estateId || null,
    userId,
    action,
    detail,
    at: new Date().toISOString(),
  });
  if (store.audit.length > 5000) store.audit = store.audit.slice(-4000);
}

export function persistenceMode() {
  return mode;
}

export { uploadsDir, dataDir, pool };
