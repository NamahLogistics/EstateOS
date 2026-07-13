import { useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { shareReferralText, whatsappShareUrl } from '../whatsapp.js';

export default function ReferralCard({ compact = false }) {
  const { user, api, toast, setUser, token } = useAuth();
  const [referral, setReferral] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || !token) {
      setReferral(null);
      setError('');
      return;
    }
    let cancelled = false;
    setLoading(true);
    api('/api/billing/referral')
      .then((data) => {
        if (cancelled) return;
        setReferral(data);
        setError('');
        if (data.referralCode) {
          setUser({
            ...user,
            referralCode: data.referralCode,
            referralDiscountCredits: data.referralDiscountCredits,
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = String(err.message || '');
        if (/Cannot GET|<!DOCTYPE|Failed to fetch|404/i.test(msg)) {
          setError(
            'API is outdated or not running. On your machine run: cd EstateOS && PORT=4060 node server/index.js — or use the live site.'
          );
        } else {
          setError(msg || 'Could not load referral');
        }
        setReferral(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, token]);

  if (!user) return null;

  const code = referral?.referralCode || user.referralCode || null;
  const link = referral?.link
    ? referral.link
    : code
      ? `${window.location.origin}/auth?mode=register&ref=${code}`
      : null;
  const ready = Boolean(code && link);

  async function copy() {
    if (!ready) {
      toast('Referral not ready yet — wait a moment or restart the API');
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
      {loading && <p className="small muted">Loading your referral code…</p>}
      {error && (
        <p className="small" style={{ color: 'var(--danger, #8f2f2f)' }}>
          {error}
        </p>
      )}
      {ready ? (
        <>
          <p className="small" style={{ marginBottom: '0.35rem' }}>
            Your code:{' '}
            <strong style={{ fontSize: '1.05rem', letterSpacing: '0.06em' }}>{code}</strong>
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
            <button type="button" className="btn btn-primary" onClick={copy}>
              Copy link
            </button>
            <a
              className="btn btn-ghost"
              href={whatsappShareUrl(shareReferralText({ link, inviterName: user.name }))}
              target="_blank"
              rel="noreferrer"
            >
              Share on WhatsApp
            </a>
          </div>
        </>
      ) : (
        !loading &&
        !error && <p className="small muted">No referral code yet — refresh the page.</p>
      )}
    </div>
  );
}
