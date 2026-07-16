import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const DISMISS_KEY = 'heirready_sms_phone_banner_dismissed';

/** Soft prompt to add mobile for SMS new-device alerts. */
export default function SmsPhoneBanner() {
  const { user } = useAuth();
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') {
        setHidden(true);
        return;
      }
    } catch {
      /* ignore */
    }
    setHidden(false);
  }, []);

  if (!user || user.accountType === 'lawyer' || user.accountType === 'care') return null;
  if (user.phoneVerified) return null;
  if (hidden) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setHidden(true);
  }

  return (
    <div
      className="card"
      style={{
        padding: '0.95rem 1.15rem',
        marginBottom: '1rem',
        borderColor: 'rgba(47, 107, 82, 0.35)',
        background: 'linear-gradient(165deg, rgba(220, 232, 225, 0.55), var(--card))',
      }}
    >
      <strong>Upgrade sign-in alerts</strong>
      <p className="small muted" style={{ margin: '0.3rem 0 0.65rem' }}>
        Add your mobile — India or NRI (US, UK, UAE, etc.) — and we’ll text you when someone tries
        to sign in from a new device. Email confirm still works either way.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <Link className="btn btn-primary" to="/app/security#phone" style={{ display: 'inline-block' }}>
          Add mobile
        </Link>
        <button type="button" className="btn btn-ghost" onClick={dismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
