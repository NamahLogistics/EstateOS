/**
 * Client-side vault crypto (Web Crypto API).
 * Private keys and vault keys never leave the browser in plaintext.
 */
const PBKDF2_ITERATIONS = 310_000;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bufToB64(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64ToBuf(b64) {
  const s = atob(String(b64 || ''));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out.buffer;
}

export async function deriveKek(password, saltB64) {
  const salt = saltB64 ? b64ToBuf(saltB64) : crypto.getRandomValues(new Uint8Array(16)).buffer;
  const baseKey = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(String(password || '')),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const kek = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt']
  );
  return { kek, saltB64: bufToB64(salt) };
}

async function generateRsaKeyPair() {
  return crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );
}

async function wrapPrivateKey(privateKey, kek) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.wrapKey('pkcs8', privateKey, kek, {
    name: 'AES-GCM',
    iv,
  });
  return { wrappedKey: bufToB64(wrapped), iv: bufToB64(iv) };
}

async function unwrapPrivateKey(wrapped, kek) {
  return crypto.subtle.unwrapKey(
    'pkcs8',
    b64ToBuf(wrapped.wrappedKey),
    kek,
    { name: 'AES-GCM', iv: b64ToBuf(wrapped.iv) },
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['decrypt']
  );
}

export async function createUserCrypto(password) {
  const { kek, saltB64 } = await deriveKek(password);
  const { publicKey, privateKey } = await generateRsaKeyPair();
  const wrappedPrivate = await wrapPrivateKey(privateKey, kek);

  // Recovery key: 128-bit random, shown once — can re-wrap after password reset
  const recoveryBytes = crypto.getRandomValues(new Uint8Array(16));
  const recoveryKey = bufToB64(recoveryBytes);
  const { kek: recoveryKek, saltB64: recoverySalt } = await deriveKek(recoveryKey);
  const wrappedForRecovery = await wrapPrivateKey(privateKey, recoveryKek);

  const publicKeyJwk = await crypto.subtle.exportKey('jwk', publicKey);

  return {
    publicKey,
    privateKey,
    publicKeyJwk,
    bundle: {
      version: 1,
      kdf: 'PBKDF2-SHA256',
      iterations: PBKDF2_ITERATIONS,
      salt: saltB64,
      privateKeyWrapped: wrappedPrivate,
      recoverySalt,
      privateKeyWrappedRecovery: wrappedForRecovery,
    },
    recoveryKey,
  };
}

export async function unlockUserCrypto(password, bundle) {
  if (!bundle?.salt || !bundle?.privateKeyWrapped) {
    throw new Error('No encryption keys on this account yet');
  }
  const { kek } = await deriveKek(password, bundle.salt);
  const privateKey = await unwrapPrivateKey(bundle.privateKeyWrapped, kek);
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    bundle.publicKeyJwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['encrypt']
  );
  return { publicKey, privateKey, publicKeyJwk: bundle.publicKeyJwk };
}

export async function recoverUserCrypto(recoveryKey, bundle, newPassword) {
  if (!bundle?.recoverySalt || !bundle?.privateKeyWrappedRecovery) {
    throw new Error('No recovery key on file for this account');
  }
  const { kek: recoveryKek } = await deriveKek(recoveryKey, bundle.recoverySalt);
  const privateKey = await unwrapPrivateKey(bundle.privateKeyWrappedRecovery, recoveryKek);
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    bundle.publicKeyJwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['encrypt']
  );
  const { kek, saltB64 } = await deriveKek(newPassword);
  const wrappedPrivate = await wrapPrivateKey(privateKey, kek);
  return {
    publicKey,
    privateKey,
    publicKeyJwk: bundle.publicKeyJwk,
    bundle: {
      ...bundle,
      salt: saltB64,
      privateKeyWrapped: wrappedPrivate,
    },
  };
}

export async function generateVaultKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

export async function wrapVaultKeyForUser(vaultKey, recipientPublicKeyJwk) {
  const pub = await crypto.subtle.importKey(
    'jwk',
    recipientPublicKeyJwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
  const raw = await crypto.subtle.exportKey('raw', vaultKey);
  const wrapped = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pub, raw);
  return bufToB64(wrapped);
}

export async function unwrapVaultKey(wrappedB64, privateKey) {
  const raw = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    b64ToBuf(wrappedB64)
  );
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encryptJson(vaultKey, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = textEncoder.encode(JSON.stringify(obj ?? {}));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    vaultKey,
    plaintext
  );
  return { v: 1, iv: bufToB64(iv), ct: bufToB64(ciphertext) };
}

export async function decryptJson(vaultKey, payload) {
  if (!payload?.iv || !payload?.ct) return null;
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBuf(payload.iv) },
    vaultKey,
    b64ToBuf(payload.ct)
  );
  return JSON.parse(textDecoder.decode(plaintext));
}

export async function encryptBytes(vaultKey, arrayBuffer) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    vaultKey,
    arrayBuffer
  );
  return { v: 1, iv: bufToB64(iv), ct: bufToB64(ciphertext) };
}

export async function decryptBytes(vaultKey, payload) {
  const buf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBuf(payload.iv) },
    vaultKey,
    b64ToBuf(payload.ct)
  );
  return buf;
}

export const SENSITIVE_FIELDS = [
  'institution',
  'accountRef',
  'notes',
  'shift',
  'paidBy',
  'backupContact',
];

export function splitItemFields(item) {
  const meta = {
    category: item.category,
    title: item.title,
    expiresOn: item.expiresOn || null,
  };
  const sensitive = {};
  for (const f of SENSITIVE_FIELDS) {
    if (item[f] != null && item[f] !== '') sensitive[f] = item[f];
  }
  return { meta, sensitive };
}

export async function encryptItemPayload(vaultKey, itemLike) {
  const { meta, sensitive } = splitItemFields(itemLike);
  const enc = await encryptJson(vaultKey, sensitive);
  return { ...meta, e2ee: true, enc };
}

export async function decryptItemPayload(vaultKey, item) {
  if (!item) return item;
  if (!item.e2ee || !item.enc) return { ...item, e2ee: false };
  try {
    const sensitive = (await decryptJson(vaultKey, item.enc)) || {};
    return {
      ...item,
      ...sensitive,
      e2ee: true,
      _decrypted: true,
    };
  } catch {
    return {
      ...item,
      institution: '[encrypted]',
      accountRef: '',
      notes: 'Could not decrypt — wrong key or corrupt data',
      e2ee: true,
      _decryptFailed: true,
    };
  }
}

export function hasCryptoBundle(user) {
  return Boolean(user?.cryptoBundle?.privateKeyWrapped && user?.cryptoBundle?.publicKeyJwk);
}
