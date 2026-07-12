import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
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
});

function migrate(store) {
  const base = empty();
  for (const key of Object.keys(base)) {
    if (!Array.isArray(store[key])) store[key] = [];
  }
  return store;
}

function ensure() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify(empty(), null, 2));
  }
}

export function readStore() {
  ensure();
  const store = migrate(JSON.parse(fs.readFileSync(storePath, 'utf8')));
  return store;
}

export function writeStore(store) {
  ensure();
  fs.writeFileSync(storePath, JSON.stringify(migrate(store), null, 2));
}

export function mutate(fn) {
  const store = readStore();
  const result = fn(store);
  writeStore(store);
  return result;
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
}

export { uploadsDir, dataDir };
