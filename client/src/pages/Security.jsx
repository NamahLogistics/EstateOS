import { useState, useEffect } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import UnlockCryptoBanner from '../components/UnlockCryptoBanner.jsx';

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
  const [phoneStep, setPhoneStep] = useState('idle'); // idle | code
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneMaskedPending, setPhoneMaskedPending] = useState('');
  const highlightPhone = location.hash === '#phone';

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

  async function startPhoneVerify(e) {
    e.preventDefault();
    setPhoneBusy(true);
    try {
      const res = await api('/api/me/phone/start', {
        method: 'POST',
        body: { phone: phoneInput },
      });
      setPhoneMaskedPending(res.phoneMasked || '');
      setPhoneStep('code');
      setPhoneCode(res.debugCode || '');
      toast(res.message || 'Code sent');
    } catch (err) {
      toast(err.message);
    } finally {
      setPhoneBusy(false);
    }
  }

  async function confirmPhone(e) {
    e.preventDefault();
    setPhoneBusy(true);
    try {
      const res = await api('/api/me/phone/confirm', {
        method: 'POST',
        body: { code: phoneCode },
      });
      if (res.user) setUser(res.user);
      setPhoneStep('idle');
      setPhoneInput('');
      setPhoneCode('');
      toast(res.message || 'Mobile verified');
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

      <div className="card" style={{ padding: '1.15rem 1.25rem', marginBottom: '1rem' }}>
        <strong>Your family’s private details stay private</strong>
        <p className="small muted" style={{ margin: '0.4rem 0 0.85rem' }}>
          Think of your vault like a locked box. The lock opens only with your password (and a
          recovery key you keep). We never get a spare key — so even HeirReady cannot open the box
          and read what’s inside.
        </p>

        <p className="small" style={{ margin: '0 0 0.25rem', fontWeight: 700 }}>
          We cannot see
        </p>
        <ul className="small" style={{ margin: '0 0 0.85rem', paddingLeft: '1.1rem', lineHeight: 1.55 }}>
          <li>Bank, LIC, demat, or folio numbers</li>
          <li>The notes you write for family</li>
          <li>Photos and PDFs you upload</li>
        </ul>

        <p className="small" style={{ margin: '0 0 0.25rem', fontWeight: 700 }}>
          We can see (so the app works)
        </p>
        <ul className="small" style={{ margin: '0 0 0.85rem', paddingLeft: '1.1rem', lineHeight: 1.55 }}>
          <li>Your email and whether you’re on a paid plan</li>
          <li>Who’s in the family circle (names and emails)</li>
          <li>
            Simple labels you choose — like “Papa’s HDFC account” — but not the actual account
            number
          </li>
          <li>Reminder dates (so we can nudge you before something expires)</li>
        </ul>

        <p className="small" style={{ margin: '0 0 0.25rem', fontWeight: 700 }}>
          If someone attacks our systems
        </p>
        <ul className="small" style={{ margin: '0 0 0.85rem', paddingLeft: '1.1rem', lineHeight: 1.55 }}>
          <li>
            Your real secrets stay scrambled — without your password or recovery key, the box
            stays locked
          </li>
          <li>Your login password is never stored as plain text</li>
          <li>
            An attacker might see the same labels we see (titles, emails) — not numbers, notes, or
            documents
          </li>
        </ul>

        <p className="small" style={{ margin: '0 0 0.25rem', fontWeight: 700 }}>
          Attackers can open your vault only if you slip
        </p>
        <p className="small muted" style={{ margin: '0 0 0.4rem' }}>
          Breaking into HeirReady’s servers is not enough. Someone gets into the vault only if they
          also get hold of your key — usually because something on your side went wrong:
        </p>
        <ul className="small" style={{ margin: '0 0 0.85rem', paddingLeft: '1.1rem', lineHeight: 1.55 }}>
          <li>You reuse a password and it leaks elsewhere, or you fall for a fake login page</li>
          <li>You leave 2FA off — so a stolen password is enough</li>
          <li>Your phone or laptop is unlocked and someone uses your open HeirReady session</li>
          <li>Virus / scam software on your device watches you type or copies what’s on screen</li>
          <li>You share or lose the recovery key (photo in chat, sticky note, email to yourself)</li>
          <li>A family member you invited shares access carelessly</li>
        </ul>
        <p className="small" style={{ margin: '0 0 0.85rem' }}>
          <strong>Your side of the lock:</strong> turn on authenticator 2FA below, use a unique
          password, keep the recovery key offline, and lock your devices. Do that, and a server
          attack still leaves your vault shut.
        </p>

        <p className="small" style={{ margin: '0 0 0.25rem', fontWeight: 700 }}>
          New device = confirm by email
        </p>
        <p className="small muted" style={{ margin: '0 0 0.85rem' }}>
          Like Google or Facebook: if you sign in from a phone or laptop we don’t recognise, we
          email you first. Only after you tap “Yes, it was me” can that device finish signing in.
          Stolen passwords alone aren’t enough on a new device. Optional:{' '}
          <a href="#phone">add a verified mobile</a> for an SMS alert too.
        </p>

        <p className="small muted" style={{ margin: 0 }}>
          When you turn on vault encryption, we’ll show a <strong>recovery key once</strong>. Write
          it down offline. If you later reset your password and that key is gone,{' '}
          <strong>the vault can stay locked forever</strong> — we have no back door. That’s what
          keeps family secrets private.
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
        <strong>SMS login alerts (optional)</strong>
        <p className="small muted" style={{ margin: '0.35rem 0 0.75rem' }}>
          Add your mobile so we can text you when someone tries to sign in from a new device — same
          idea as Google. Used only for sign-in / security alerts unless you opt in to product
          reminders below.
        </p>

        {user.phoneVerified ? (
          <>
            <p className="small" style={{ margin: '0 0 0.65rem' }}>
              <strong>{user.phoneMasked || `+91••••••${user.phoneLast4 || ''}`}</strong>
              {' · '}
              {user.smsAlertsEnabled ? 'Alerts on' : 'Alerts off'}
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
              Text me on SMS for new-device sign-ins
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
        ) : phoneStep === 'code' ? (
          <form onSubmit={confirmPhone}>
            <p className="small muted" style={{ marginTop: 0 }}>
              Code sent to {phoneMaskedPending || 'your phone'}. Expires in 10 minutes.
            </p>
            <div className="field">
              <label>6-digit SMS code</label>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={phoneCode}
                onChange={(e) => setPhoneCode(e.target.value)}
                placeholder="123456"
                maxLength={8}
                required
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="submit" className="btn btn-primary" disabled={phoneBusy}>
                {phoneBusy ? '…' : 'Verify & turn on alerts'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setPhoneStep('idle');
                  setPhoneCode('');
                }}
              >
                Back
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={startPhoneVerify}>
            {!user.smsConfigured ? (
              <p className="small" style={{ marginTop: 0, color: 'var(--ink-soft)' }}>
                SMS delivery isn’t fully set up on our side yet — you can still try; if it fails,
                check back soon.
              </p>
            ) : null}
            <div className="field">
              <label>Indian mobile</label>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="98XXXXXXXX"
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={phoneBusy}>
              {phoneBusy ? 'Sending…' : 'Send verification code'}
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
