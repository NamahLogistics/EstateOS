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
  const [savedOffline, setSavedOffline] = useState(false);

  if (!user || unlocked) {
    if (recoveryKeyOnce) {
      return (
        <div
          className="card"
          style={{
            padding: '1.1rem 1.2rem',
            marginBottom: '1rem',
            borderColor: 'rgba(180, 83, 9, 0.65)',
            background: 'rgba(254, 243, 199, 0.65)',
          }}
          role="alertdialog"
          aria-labelledby="recovery-key-title"
        >
          <strong id="recovery-key-title">Write this recovery key down — one time only</strong>
          <p className="small" style={{ margin: '0.45rem 0 0.35rem' }}>
            This is <em>not</em> your login password. It is a spare key for your encrypted vault.
          </p>
          <ul className="small" style={{ margin: '0 0 0.65rem', paddingLeft: '1.1rem', lineHeight: 1.5 }}>
            <li>Save it offline (paper, password manager, or a safe) — not WhatsApp or email</li>
            <li>We will never show this key again</li>
            <li>
              <strong>If you reset your password and lose this key, your vault stays locked forever</strong>{' '}
              — even HeirReady cannot open it
            </li>
          </ul>
          <code
            style={{
              display: 'block',
              wordBreak: 'break-all',
              padding: '0.75rem',
              background: '#fff',
              borderRadius: 8,
              fontSize: '0.9rem',
              fontWeight: 600,
              letterSpacing: '0.02em',
            }}
          >
            {recoveryKeyOnce}
          </code>
          <label
            className="small"
            style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'flex-start',
              marginTop: '0.75rem',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={savedOffline}
              onChange={(e) => setSavedOffline(e.target.checked)}
              style={{ marginTop: '0.2rem' }}
            />
            <span>I have saved this recovery key somewhere safe offline</span>
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.65rem' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                navigator.clipboard?.writeText(recoveryKeyOnce).catch(() => {});
              }}
            >
              Copy key
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                const blob = new Blob(
                  [
                    'HeirReady vault recovery key\n',
                    '============================\n\n',
                    'Save this offline. We will never show it again.\n',
                    'If you reset your password and lose this key, the vault can stay locked forever.\n\n',
                    `Account: ${user.email || ''}\n`,
                    `Key: ${recoveryKeyOnce}\n`,
                    `Saved: ${new Date().toISOString()}\n`,
                  ].join(''),
                  { type: 'text/plain;charset=utf-8' }
                );
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'heirready-recovery-key.txt';
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Download .txt
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!savedOffline}
              onClick={() => {
                clearRecoveryKeyOnce();
                setSavedOffline(false);
              }}
            >
              I’ve saved it — hide
            </button>
          </div>
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
          ? 'Enter your HeirReady password so this device can open Life Map secrets.'
          : 'Bank / LIC numbers and notes will be locked on your device before they reach us. After you turn this on, we’ll show a recovery key once — save it offline, or a password reset could lock the vault forever.'}
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
          {busy ? '…' : hasKeys ? 'Unlock' : 'Enable encryption'}
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
