import { useState } from 'react';
import { useVaultCrypto } from '../crypto/VaultCryptoContext.jsx';
import { useAuth } from '../auth.jsx';

/** Prompt to unlock or enable E2EE with account password. */
export default function UnlockCryptoBanner({ compact = false }) {
  const { user } = useAuth();
  const {
    unlocked,
    busy,
    hasKeys,
    unlockCrypto,
    setupCrypto,
    recoveryKeyOnce,
    clearRecoveryKeyOnce,
  } = useVaultCrypto();
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

  if (!user || unlocked) {
    if (recoveryKeyOnce) {
      return (
        <div
          className="card"
          style={{
            padding: '1rem 1.15rem',
            marginBottom: '1rem',
            borderColor: 'rgba(180, 83, 9, 0.5)',
            background: 'rgba(254, 243, 199, 0.5)',
          }}
        >
          <strong>Save your recovery key</strong>
          <p className="small muted" style={{ margin: '0.35rem 0' }}>
            If you reset your password, you need this key to open old encrypted vaults. We cannot
            recover it for you.
          </p>
          <code
            style={{
              display: 'block',
              wordBreak: 'break-all',
              padding: '0.65rem',
              background: '#fff',
              borderRadius: 8,
              fontSize: '0.85rem',
            }}
          >
            {recoveryKeyOnce}
          </code>
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: '0.65rem' }}
            onClick={() => {
              navigator.clipboard?.writeText(recoveryKeyOnce).catch(() => {});
              clearRecoveryKeyOnce();
            }}
          >
            Copied — hide
          </button>
        </div>
      );
    }
    return null;
  }

  async function submit(e) {
    e.preventDefault();
    setErr('');
    try {
      if (hasKeys) await unlockCrypto(password);
      else await setupCrypto(password);
      setPassword('');
    } catch (ex) {
      setErr(ex.message || 'Unlock failed');
    }
  }

  return (
    <div
      className="card"
      style={{
        padding: compact ? '0.85rem 1rem' : '1.1rem 1.2rem',
        marginBottom: '1rem',
        borderColor: 'rgba(47, 107, 82, 0.45)',
        background: 'linear-gradient(165deg, rgba(220, 232, 225, 0.7), var(--card))',
      }}
    >
      <strong>{hasKeys ? 'Unlock vault encryption' : 'Turn on end-to-end encryption'}</strong>
      <p className="small muted" style={{ margin: '0.3rem 0 0.65rem' }}>
        {hasKeys
          ? 'Enter your HeirReady password so this device can decrypt Life Map secrets. Keys never leave your browser.'
          : 'Bank / LIC numbers and notes will be encrypted on your device before they reach our servers. Even HeirReady staff cannot read them.'}
      </p>
      <form onSubmit={submit} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <input
          type="password"
          className="input"
          style={{ flex: '1 1 12rem', minWidth: 0 }}
          placeholder="Your account password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? '…' : hasKeys ? 'Unlock' : 'Enable E2EE'}
        </button>
      </form>
      {err ? (
        <p className="small" style={{ color: 'var(--danger, #8f2f2f)', margin: '0.5rem 0 0' }}>
          {err}
        </p>
      ) : null}
    </div>
  );
}
