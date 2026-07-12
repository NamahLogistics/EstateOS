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
  invites: [],
  leads: [],
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
    console.log('Estate OS persistence: Postgres (durable)');
  } else {
    if (fs.existsSync(storePath)) {
      cache = migrate(JSON.parse(fs.readFileSync(storePath, 'utf8')));
    } else {
      cache = empty();
      fs.writeFileSync(storePath, JSON.stringify(cache, null, 2));
    }
    mode = 'file';
    console.warn('Estate OS persistence: local file — add DATABASE_URL for production durability');
  }
  return mode;
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

export { uploadsDir, dataDir };
