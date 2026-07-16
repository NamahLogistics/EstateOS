import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const DISMISS_KEY = 'heirready_security_trust_banner_v1';

/** Soft nudge → Security / how we protect data. */
export default function SecurityTrustBanner({ compact = false }) {
  const { user, token } = useAuth();
  const [hidden, setHidden] = useState(true);
  const href = token ? '/app/security' : '/security';

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

  if (hidden) return null;
  // Don't nag lawyers/care desks
  if (user && (user.accountType === 'lawyer' || user.accountType === 'care')) return null;

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
        padding: compact ? '0.85rem 1rem' : '0.95rem 1.15rem',
        marginBottom: '1rem',
        borderColor: 'rgba(47, 107, 82, 0.3)',
        background: 'linear-gradient(165deg, rgba(220, 232, 225, 0.4), var(--card))',
      }}
    >
      <strong>Worried about security?</strong>
      <p className="small muted" style={{ margin: '0.3rem 0 0.65rem' }}>
        Vault secrets (account numbers, notes, files) are locked on your device. Even HeirReady
        cannot read them. See exactly what we can and can’t see.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <Link className="btn btn-primary" to={href} style={{ display: 'inline-block' }}>
          How we protect your data
        </Link>
        <button type="button" className="btn btn-ghost" onClick={dismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
