import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth.jsx';
import {
  createUserCrypto,
  unlockUserCrypto,
  recoverUserCrypto,
  hasCryptoBundle,
  generateVaultKey,
  wrapVaultKeyForUser,
  unwrapVaultKey,
  encryptItemPayload,
  decryptItemPayload,
  encryptBytes,
  decryptBytes,
  SENSITIVE_FIELDS,
} from './vaultCrypto.js';

const VaultCryptoContext = createContext(null);

export function VaultCryptoProvider({ children }) {
  const { user, api, setUser, toast } = useAuth();
  const [privateKey, setPrivateKey] = useState(null);
  const [publicKeyJwk, setPublicKeyJwk] = useState(null);
  const [vaultKeys, setVaultKeys] = useState({}); // estateId -> CryptoKey
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recoveryKeyOnce, setRecoveryKeyOnce] = useState(null);

  const clearCrypto = useCallback(() => {
    setPrivateKey(null);
    setPublicKeyJwk(null);
    setVaultKeys({});
    setUnlocked(false);
    setRecoveryKeyOnce(null);
  }, []);

  useEffect(() => {
    if (!user) clearCrypto();
  }, [user?.id, clearCrypto]);

  const persistBundle = useCallback(
    async (bundle, publicKeyJwkNext) => {
      const res = await api('/api/me/crypto', {
        method: 'PUT',
        body: {
          cryptoBundle: {
            ...bundle,
            publicKeyJwk: publicKeyJwkNext || bundle.publicKeyJwk,
          },
        },
      });
      if (res.user) setUser(res.user);
      return res.user;
    },
    [api, setUser]
  );

  const setupCrypto = useCallback(
    async (password) => {
      setBusy(true);
      try {
        const created = await createUserCrypto(password);
        await persistBundle(created.bundle, created.publicKeyJwk);
        setPrivateKey(created.privateKey);
        setPublicKeyJwk(created.publicKeyJwk);
        setUnlocked(true);
        setRecoveryKeyOnce(created.recoveryKey);
        toast('End-to-end encryption is on — save your recovery key');
        return created;
      } finally {
        setBusy(false);
      }
    },
    [persistBundle, toast]
  );

  const unlockCrypto = useCallback(
    async (password) => {
      if (!hasCryptoBundle(user)) {
        return setupCrypto(password);
      }
      setBusy(true);
      try {
        const unlockedKeys = await unlockUserCrypto(password, user.cryptoBundle);
        setPrivateKey(unlockedKeys.privateKey);
        setPublicKeyJwk(unlockedKeys.publicKeyJwk);
        setUnlocked(true);
        return unlockedKeys;
      } catch (err) {
        toast(err.message || 'Could not unlock encryption keys');
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [user, setupCrypto, toast]
  );

  const recoverCrypto = useCallback(
    async (recoveryKey, newPassword) => {
      setBusy(true);
      try {
        const recovered = await recoverUserCrypto(
          recoveryKey,
          user.cryptoBundle,
          newPassword
        );
        await persistBundle(recovered.bundle, recovered.publicKeyJwk);
        setPrivateKey(recovered.privateKey);
        setPublicKeyJwk(recovered.publicKeyJwk);
        setUnlocked(true);
        toast('Encryption keys recovered with your new password');
        return recovered;
      } finally {
        setBusy(false);
      }
    },
    [user, persistBundle, toast]
  );

  const ensureEstateVaultKey = useCallback(
    async (estateId, membersWithPubKeys = []) => {
      if (!privateKey || !publicKeyJwk) throw new Error('Unlock encryption first');
      if (vaultKeys[estateId]) return vaultKeys[estateId];

      const res = await api(`/api/estates/${estateId}/vault-key`);
      let vaultKey;
      if (res.wrappedKey) {
        vaultKey = await unwrapVaultKey(res.wrappedKey, privateKey);
      } else {
        vaultKey = await generateVaultKey();
        const wraps = [
          {
            userId: user.id,
            wrappedKey: await wrapVaultKeyForUser(vaultKey, publicKeyJwk),
          },
        ];
        for (const m of membersWithPubKeys) {
          if (!m.userId || m.userId === user.id || !m.cryptoPublicKeyJwk) continue;
          wraps.push({
            userId: m.userId,
            wrappedKey: await wrapVaultKeyForUser(vaultKey, m.cryptoPublicKeyJwk),
          });
        }
        await api(`/api/estates/${estateId}/vault-key`, {
          method: 'PUT',
          body: { wraps },
        });
      }
      setVaultKeys((prev) => ({ ...prev, [estateId]: vaultKey }));
      return vaultKey;
    },
    [api, privateKey, publicKeyJwk, vaultKeys, user?.id]
  );

  const grantVaultKeyToMember = useCallback(
    async (estateId, memberUserId, memberPublicKeyJwk) => {
      const vaultKey = vaultKeys[estateId] || (await ensureEstateVaultKey(estateId));
      const wrappedKey = await wrapVaultKeyForUser(vaultKey, memberPublicKeyJwk);
      await api(`/api/estates/${estateId}/vault-key/grant`, {
        method: 'POST',
        body: { userId: memberUserId, wrappedKey },
      });
    },
    [api, vaultKeys, ensureEstateVaultKey]
  );

  const prepareItemForUpload = useCallback(
    async (estateId, itemLike) => {
      const vaultKey = await ensureEstateVaultKey(estateId);
      const encMeta = await encryptItemPayload(vaultKey, itemLike);
      const out = {
        category: encMeta.category,
        title: encMeta.title,
        expiresOn: encMeta.expiresOn,
        e2ee: true,
        enc: encMeta.enc,
      };
      // Clear sensitive plaintext so server never receives them
      for (const f of SENSITIVE_FIELDS) out[f] = '';
      return { body: out, vaultKey };
    },
    [ensureEstateVaultKey]
  );

  const decryptItems = useCallback(
    async (estateId, items) => {
      if (!items?.length) return items || [];
      const needs = items.some((i) => i.e2ee && i.enc);
      if (!needs) return items;
      const vaultKey = await ensureEstateVaultKey(estateId);
      return Promise.all(items.map((i) => decryptItemPayload(vaultKey, i)));
    },
    [ensureEstateVaultKey]
  );

  const encryptFileForUpload = useCallback(
    async (estateId, file) => {
      const vaultKey = await ensureEstateVaultKey(estateId);
      const buf = await file.arrayBuffer();
      const enc = await encryptBytes(vaultKey, buf);
      const blob = new Blob([JSON.stringify(enc)], { type: 'application/json' });
      const wrapped = new File([blob], `${file.name}.e2ee.json`, {
        type: 'application/json',
      });
      return { file: wrapped, originalName: file.name, originalMime: file.type };
    },
    [ensureEstateVaultKey]
  );

  const decryptFileBlob = useCallback(
    async (estateId, arrayBuffer) => {
      const vaultKey = await ensureEstateVaultKey(estateId);
      const text = new TextDecoder().decode(arrayBuffer);
      const payload = JSON.parse(text);
      return decryptBytes(vaultKey, payload);
    },
    [ensureEstateVaultKey]
  );

  const value = useMemo(
    () => ({
      unlocked,
      busy,
      hasKeys: hasCryptoBundle(user),
      recoveryKeyOnce,
      clearRecoveryKeyOnce: () => setRecoveryKeyOnce(null),
      setupCrypto,
      unlockCrypto,
      recoverCrypto,
      clearCrypto,
      ensureEstateVaultKey,
      grantVaultKeyToMember,
      prepareItemForUpload,
      decryptItems,
      encryptFileForUpload,
      decryptFileBlob,
    }),
    [
      unlocked,
      busy,
      user,
      recoveryKeyOnce,
      setupCrypto,
      unlockCrypto,
      recoverCrypto,
      clearCrypto,
      ensureEstateVaultKey,
      grantVaultKeyToMember,
      prepareItemForUpload,
      decryptItems,
      encryptFileForUpload,
      decryptFileBlob,
    ]
  );

  return (
    <VaultCryptoContext.Provider value={value}>{children}</VaultCryptoContext.Provider>
  );
}

export function useVaultCrypto() {
  const ctx = useContext(VaultCryptoContext);
  if (!ctx) throw new Error('useVaultCrypto outside provider');
  return ctx;
}
