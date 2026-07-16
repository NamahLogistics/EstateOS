/**
 * Auth-gated vault file access via short-lived signed URLs.
 */
import jwt from 'jsonwebtoken';
import { readStore } from './db.js';

const SECRET = process.env.JWT_SECRET || 'estate-os-dev-secret';
const FILE_TTL_SEC = 15 * 60;

export function signFileAccessToken(fileId, userId) {
  return jwt.sign(
    { typ: 'file', fid: fileId, sub: userId },
    SECRET,
    { expiresIn: FILE_TTL_SEC }
  );
}

export function verifyFileAccessToken(token, fileId) {
  try {
    const payload = jwt.verify(String(token || ''), SECRET);
    if (payload.typ !== 'file' || payload.fid !== fileId || !payload.sub) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Find which estate (if any) owns this upload id. */
export function findEstateIdForFile(store, fileId) {
  const id = String(fileId || '');
  if (!id) return null;
  for (const item of store.items || []) {
    for (const f of item.files || []) {
      if (f.id === id || (f.path && f.path.endsWith(`/${id}`))) {
        return item.estateId;
      }
    }
  }
  for (const need of store.counselNeeds || []) {
    for (const f of need.files || []) {
      if (f.id === id || (f.path && f.path.endsWith(`/${id}`))) {
        return need.estateId;
      }
    }
  }
  return null;
}

export function userCanAccessFile(store, userId, fileId, canAccessEstate) {
  const estateId = findEstateIdForFile(store, fileId);
  if (!estateId) return false;
  const access = canAccessEstate(store, userId, estateId);
  return Boolean(access?.ok);
}

/** Rewrite file paths in API payloads to include a fresh signature. */
export function signFilePaths(files, userId) {
  if (!Array.isArray(files)) return files;
  return files.map((f) => {
    if (!f?.id && !f?.path) return f;
    const fileId = f.id || String(f.path || '').split('/').pop();
    if (!fileId) return f;
    const sig = signFileAccessToken(fileId, userId);
    const base = `/uploads/${fileId}`;
    return {
      ...f,
      id: fileId,
      path: `${base}?sig=${encodeURIComponent(sig)}`,
    };
  });
}

export function signItemFiles(item, userId) {
  if (!item) return item;
  return { ...item, files: signFilePaths(item.files, userId) };
}
