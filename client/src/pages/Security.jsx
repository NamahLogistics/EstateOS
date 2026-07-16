import { useState, useEffect } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import UnlockCryptoBanner from '../components/UnlockCryptoBanner.jsx';
import SecurityTrustProof from '../components/SecurityTrustProof.jsx';

export default function SecurityPage() {
  const { user, api, toast, setUser, token } = useAuth();
  const location = useLocation();
  const [step, setStep] = useState('idle'); // idle | setup | backup | disable
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneCountry, setPhoneCountry] = useState('91'); // dial code; '' = other/+
  const [phoneBusy, setPhoneBusy] = useState(false);
  const highlightPhone = location.hash === '#phone';

  const phoneCountries = [
    { dial: '91', label: 'India (+91)' },
    { dial: '1', label: 'US / Canada (+1)' },
    { dial: '44', label: 'UK (+44)' },
    { dial: '971', label: 'UAE (+971)' },
    { dial: '65', label: 'Singapore (+65)' },
    { dial: '61', label: 'Australia (+61)' },
    { dial: '49', label: 'Germany (+49)' },
    { dial: '', label: 'Other (include +country)' },
  ];

  useEffect(() => {
    if (location.hash !== '#phone') return;
    const t = window.setTimeout(() => {
      document.getElementById('phone')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => window.clearTimeout(t);
  }, [location.hash]);

  if (!token) return <Navigate to="/auth" replace />;
  if (!user) return null;

  async function startSetup() {
    setBusy(true);
    try {
      const res = await api('/api/auth/mfa/setup', { method: 'POST', body: {} });
      setSetup(res);
      setStep('setup');
      setCode('');
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api('/api/auth/mfa/confirm', {
        method: 'POST',
        body: { code },
      });
      setUser(res.user);
      setBackupCodes(res.backupCodes || []);
      setStep('backup');
      setCode('');
      toast('Two-factor authentication is on');
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function disableMfa(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api('/api/auth/mfa/disable', {
        method: 'POST',
        body: { password, code },
      });
      setUser(res.user);
      setStep('idle');
      setPassword('');
      setCode('');
      toast('Two-factor authentication turned off');
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function refreshBackup(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api('/api/auth/mfa/backup-codes', {
        method: 'POST',
        body: { code },
      });
      setBackupCodes(res.backupCodes || []);
      setStep('backup');
      setCode('');
      setUser({
        ...user,
        mfaBackupCodesRemaining: res.backupCodes?.length || 0,
      });
      toast('New backup codes ready — save them now');
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function savePhone(e) {
    e.preventDefault();
    setPhoneBusy(true);
    try {
      const res = await api('/api/me/phone/start', {
        method: 'POST',
        body: { phone: phoneInput, countryDial: phoneCountry },
      });
      if (res.user) setUser(res.user);
      setPhoneInput('');
      toast(res.message || 'Saved and verified');
    } catch (err) {
      toast(err.message);
    } finally {
      setPhoneBusy(false);
    }
  }

  async function patchPhone(body) {
    setPhoneBusy(true);
    try {
      const res = await api('/api/me/phone', { method: 'PATCH', body });
      if (res.user) setUser(res.user);
      toast(body.clear ? 'Mobile removed' : 'Saved');
    } catch (err) {
      toast(err.message);
    } finally {
      setPhoneBusy(false);
    }
  }

  return (
    <section style={{ padding: '1.5rem 0 3rem', maxWidth: 640 }}>
      <p
        className="small muted"
        style={{ margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}
      >
        Account
      </p>
      <h1 className="display" style={{ fontSize: '2rem', margin: '0.35rem 0 0.5rem' }}>
        Security
      </h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Banking-style sign-in: password plus a code from your phone. Even if someone gets your
        password, they still need your authenticator.
      </p>

      <div
        className="card"
        style={{
          padding: '1.15rem 1.25rem',
          marginBottom: '1rem',
          borderColor: user.mfaEnabled ? 'rgba(47, 107, 82, 0.45)' : 'rgba(180, 83, 9, 0.4)',
          background: user.mfaEnabled
            ? 'rgba(220, 232, 225, 0.45)'
            : 'rgba(254, 243, 199, 0.35)',
        }}
      >
        <strong>{user.mfaEnabled ? '2FA is on' : '2FA is off — turn it on'}</strong>
        <p className="small muted" style={{ margin: '0.35rem 0 0' }}>
          {user.mfaEnabled
            ? `Authenticator app required at every sign-in. ${user.mfaBackupCodesRemaining || 0} backup code${
                (user.mfaBackupCodesRemaining || 0) === 1 ? '' : 's'
              } left.`
            : 'Recommended for every family account that holds Life Map documents.'}
        </p>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <SecurityTrustProof />
        <p className="small muted" style={{ margin: '0.65rem 0 0' }}>
          Optional:{' '}
          <a href="#phone">add a verified mobile</a> for login alerts when SMS is enabled later.
        </p>
      </div>

      <div
        id="phone"
        className="card"
        style={{
          padding: '1.15rem 1.25rem',
          marginBottom: '1rem',
          borderColor: highlightPhone
            ? 'rgba(47, 107, 82, 0.55)'
            : user.phoneVerified
              ? 'rgba(47, 107, 82, 0.35)'
              : undefined,
          background: highlightPhone ? 'rgba(220, 232, 225, 0.35)' : undefined,
        }}
      >
        <strong>Mobile for login alerts (optional)</strong>
        <p className="small muted" style={{ margin: '0.35rem 0 0.75rem' }}>
          Add your mobile — India or abroad (US, UK, UAE, Singapore, etc.). Used for sign-in /
          security alerts unless you opt in to product reminders below.
        </p>

        {user.phoneVerified ? (
          <>
            <p className="small" style={{ margin: '0 0 0.65rem' }}>
              <strong>{user.phoneMasked || `••••${user.phoneLast4 || ''}`}</strong>
              {' · '}
              Saved and verified
              {user.smsAlertsEnabled ? ' · Alerts on' : ' · Alerts off'}
            </p>
            <label
              className="small"
              style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}
            >
              <input
                type="checkbox"
                checked={Boolean(user.smsAlertsEnabled)}
                disabled={phoneBusy}
                onChange={(e) => patchPhone({ smsAlertsEnabled: e.target.checked })}
              />
              Prefer SMS alerts for new-device sign-ins (when SMS is enabled later)
            </label>
            <label
              className="small"
              style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}
            >
              <input
                type="checkbox"
                checked={Boolean(user.phoneMarketingOptIn)}
                disabled={phoneBusy}
                onChange={(e) => patchPhone({ phoneMarketingOptIn: e.target.checked })}
              />
              Also send light product reminders (off by default)
            </label>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={phoneBusy}
              onClick={() => {
                if (window.confirm('Remove this mobile number?')) patchPhone({ clear: true });
              }}
            >
              Remove mobile
            </button>
          </>
        ) : (
          <form onSubmit={savePhone}>
            <div className="field">
              <label>Country</label>
              <select
                value={phoneCountry}
                onChange={(e) => setPhoneCountry(e.target.value)}
                style={{ width: '100%' }}
              >
                {phoneCountries.map((c) => (
                  <option key={c.label} value={c.dial}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{phoneCountry === '' ? 'Full number with +' : 'Mobile number'}</label>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder={
                  phoneCountry === '91'
                    ? '98XXXXXXXX'
                    : phoneCountry === '1'
                      ? '4155552671'
                      : phoneCountry === ''
                        ? '+14155552671'
                        : 'National number'
                }
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={phoneBusy}>
              {phoneBusy ? 'Saving…' : 'Save mobile'}
            </button>
          </form>
        )}
      </div>

      <div style={{ marginBottom: '1.25rem' }}>
        <UnlockCryptoBanner />
      </div>

      {!user.mfaEnabled && step === 'idle' && (
        <button type="button" className="btn btn-primary" disabled={busy} onClick={startSetup}>
          {busy ? 'Preparing…' : 'Turn on authenticator 2FA'}
        </button>
      )}

      {step === 'setup' && setup && (
        <form className="card" style={{ padding: '1.15rem 1.25rem', marginTop: '1rem' }} onSubmit={confirmSetup}>
          <strong>1. Scan this QR</strong>
          <p className="small muted">Open Google Authenticator, Authy, or 1Password → Add account → Scan.</p>
          <img
            src={setup.qrUrl}
            alt="MFA QR code"
            width={200}
            height={200}
            style={{ display: 'block', margin: '0.75rem 0', borderRadius: 8 }}
          />
          <p className="small">
            Or enter key manually:{' '}
            <code style={{ wordBreak: 'break-all' }}>{setup.secret}</code>
          </p>
          <div className="field" style={{ marginTop: '0.85rem' }}>
            <label>2. Enter the 6-digit code</label>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              maxLength={8}
              required
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Checking…' : 'Confirm & enable'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setStep('idle')}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {step === 'backup' && backupCodes.length > 0 && (
        <div className="card" style={{ padding: '1.15rem 1.25rem', marginTop: '1rem' }}>
          <strong>Save these backup codes</strong>
          <p className="small muted">
            Each code works once if you lose your phone. Store them offline — we won’t show them
            again.
          </p>
          <ul
            style={{
              fontFamily: 'ui-monospace, monospace',
              letterSpacing: '0.06em',
              margin: '0.75rem 0',
              paddingLeft: '1.1rem',
            }}
          >
            {backupCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              navigator.clipboard?.writeText(backupCodes.join('\n')).catch(() => {});
              toast('Backup codes copied');
              setStep('idle');
            }}
          >
            Copied — done
          </button>
        </div>
      )}

      {user.mfaEnabled && step === 'idle' && (
        <div style={{ display: 'grid', gap: '0.65rem', marginTop: '0.25rem' }}>
          <button type="button" className="btn btn-ghost" onClick={() => setStep('refresh')}>
            Get new backup codes
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setStep('disable')}>
            Turn off 2FA
          </button>
        </div>
      )}

      {step === 'refresh' && (
        <form className="card" style={{ padding: '1.15rem 1.25rem', marginTop: '1rem' }} onSubmit={refreshBackup}>
          <strong>New backup codes</strong>
          <p className="small muted">Enter a current authenticator code. Old backup codes will stop working.</p>
          <div className="field">
            <label>Authenticator code</label>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? '…' : 'Generate'}
          </button>
        </form>
      )}

      {step === 'disable' && (
        <form className="card" style={{ padding: '1.15rem 1.25rem', marginTop: '1rem' }} onSubmit={disableMfa}>
          <strong>Turn off 2FA</strong>
          <p className="small muted">Requires your password and a current authenticator (or backup) code.</p>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Authenticator or backup code</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? '…' : 'Disable 2FA'}
          </button>
        </form>
      )}

      <p className="small" style={{ marginTop: '1.5rem' }}>
        <Link to="/app">← Back to vaults</Link>
      </p>
    </section>
  );
}
