/**
 * TOTP MFA (Google Authenticator / Authy) + one-time backup codes.
 */
import crypto from 'crypto';
import * as OTPAuth from 'otpauth';
import { hashPassword, verifyPassword } from './auth.js';

const ISSUER = 'HeirReady';

export function generateTotpSecret(email) {
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email || 'account',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });
  return {
    secret: secret.base32,
    otpauthUrl: totp.toString(),
  };
}

export function verifyTotpCode(secretBase32, code) {
  const clean = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  try {
    const totp = new OTPAuth.TOTP({
      issuer: ISSUER,
      label: 'HeirReady',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secretBase32),
    });
    const delta = totp.validate({ token: clean, window: 1 });
    return delta !== null;
  } catch {
    return false;
  }
}

export async function generateBackupCodes(count = 8) {
  const plain = [];
  const hashes = [];
  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(5).toString('hex').toUpperCase(); // 10 hex chars
    plain.push(code);
    hashes.push(await hashPassword(code));
  }
  return { plain, hashes };
}

export async function consumeBackupCode(user, code) {
  const clean = String(code || '').replace(/\s+/g, '').toUpperCase();
  if (!clean || !Array.isArray(user.mfaBackupCodeHashes)) return false;
  for (let i = 0; i < user.mfaBackupCodeHashes.length; i++) {
    const hash = user.mfaBackupCodeHashes[i];
    if (!hash) continue;
    if (await verifyPassword(clean, hash)) {
      user.mfaBackupCodeHashes[i] = null;
      user.mfaBackupCodeHashes = user.mfaBackupCodeHashes.filter(Boolean);
      return true;
    }
  }
  return false;
}

export function mfaPublicFields(user) {
  return {
    mfaEnabled: Boolean(user?.mfaEnabled && user?.mfaSecret),
    mfaBackupCodesRemaining: Array.isArray(user?.mfaBackupCodeHashes)
      ? user.mfaBackupCodeHashes.filter(Boolean).length
      : 0,
  };
}
