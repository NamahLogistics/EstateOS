import { useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { shareReferralText, whatsappShareUrl } from '../whatsapp.js';

export default function ReferralCard({ compact = false }) {
  const { user, api, toast, setUser, token } = useAuth();
  const [referral, setReferral] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !token) {
      setReferral(null);
      return;
    }
    let cancelled = false;
    api('/api/billing/referral')
      .then((data) => {
        if (cancelled) return;
        setReferral(data);
        setError('');
        if (data.referralCode && data.referralCode !== user.referralCode) {
          setUser({
            ...user,
            referralCode: data.referralCode,
            referralDiscountCredits: data.referralDiscountCredits,
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Could not load referral');
        // Client fallback so the link is never missing when signed in
        const code = user.referralCode || 'LOADING';
        const origin = window.location.origin;
        setReferral({
          referralCode: code,
          referralDiscountCredits: user.referralDiscountCredits || 0,
          paidReferredCount: 0,
          link: `${origin}/auth?mode=register&ref=${code}`,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, token]);

  if (!user) return null;

  const link =
    referral?.link ||
    `${window.location.origin}/auth?mode=register&ref=${referral?.referralCode || user.referralCode || ''}`;
  const code = referral?.referralCode || user.referralCode || '…';
  const ready = code && code !== 'LOADING' && code !== '…';

  async function copy() {
    if (!ready) {
      toast('Referral still loading — try again in a second');
      return;
    }
    await navigator.clipboard.writeText(link).catch(() => {});
    toast('Referral link copied');
  }

  return (
    <div className="card" style={{ padding: compact ? '1rem 1.15rem' : '1.25rem', marginTop: compact ? 0 : '1.5rem' }}>
      <p className="display" style={{ fontSize: compact ? '1.15rem' : '1.35rem', marginTop: 0 }}>
        Refer a paying member — get 50% off
      </p>
      <p className="muted" style={{ marginTop: 0 }}>
        When they sign up with your link and pay for Family or Diaspora, you get 50% off your next
        checkout.
      </p>
      {error && (
        <p className="small" style={{ color: 'var(--warn)' }}>
          {error} — showing local link anyway.
        </p>
      )}
      <p className="small" style={{ marginBottom: '0.35rem' }}>
        Your code: <strong style={{ fontSize: '1.05rem', letterSpacing: '0.06em' }}>{code}</strong>
      </p>
      <p
        className="small"
        style={{
          wordBreak: 'break-all',
          background: 'var(--mist)',
          padding: '0.65rem 0.75rem',
          borderRadius: 10,
          margin: '0 0 0.75rem',
        }}
      >
        {link}
      </p>
      <p className="small muted">
        Credits ready: {referral?.referralDiscountCredits ?? user.referralDiscountCredits ?? 0} ·
        Paid referrals: {referral?.paidReferredCount ?? 0}
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" onClick={copy} disabled={!ready}>
          Copy link
        </button>
        {ready && (
          <a
            className="btn btn-ghost"
            href={whatsappShareUrl(shareReferralText({ link, inviterName: user.name }))}
            target="_blank"
            rel="noreferrer"
          >
            Share on WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}
