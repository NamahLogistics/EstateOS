import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth.jsx';
import {
  buildInviteUrl,
  shareCareOnboardText,
  shareFamilyOnboardText,
  shareReferralText,
  whatsappShareUrl,
} from '../whatsapp.js';

const CITY_KEY = 'heirready_invite_city';
const SUGGESTED_CITIES = ['Pune', 'Mumbai', 'Bengaluru', 'Hyderabad', 'Delhi NCR', 'Chennai'];

export default function ReferralCard({ compact = false }) {
  const { user, api, toast, setUser, token } = useAuth();
  const [referral, setReferral] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [city, setCity] = useState(() => localStorage.getItem(CITY_KEY) || 'Pune');
  const isLawyer = user?.accountType === 'lawyer';
  const isCare = user?.accountType === 'care';

  useEffect(() => {
    localStorage.setItem(CITY_KEY, city || 'Pune');
  }, [city]);

  useEffect(() => {
    if (!user || !token) {
      setReferral(null);
      setError('');
      return;
    }
    let cancelled = false;
    setLoading(true);
    const q = city.trim() ? `?city=${encodeURIComponent(city.trim())}` : '';
    api(`/api/billing/referral${q}`)
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
          setError('Could not load referral — refresh or try again.');
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
  }, [user?.id, token, city]);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://heirready.com';
  const code = referral?.referralCode || user?.referralCode || null;

  const links = useMemo(() => {
    if (!code) return { family: null, care: null, lawyer: null };
    return {
      family:
        referral?.linkFamily ||
        buildInviteUrl({ origin, ref: code, city, type: isLawyer ? 'lawyer' : null }),
      care: referral?.linkCare || buildInviteUrl({ origin, ref: code, city, type: 'care' }),
      lawyer: referral?.linkLawyer || buildInviteUrl({ origin, ref: code, city, type: 'lawyer' }),
    };
  }, [code, referral, city, origin, isLawyer]);

  if (!user) return null;

  const ready = Boolean(code && links.family);
  const rule =
    referral?.rule ||
    (isLawyer
      ? 'Share with another advocate. When they pay Counsel Pro, you get 50% off your next year.'
      : 'Pick a city, then WhatsApp family or caregivers. Paid signups with your code → 50% off.');

  async function copy(text, label) {
    if (!text) {
      toast('Link not ready yet');
      return;
    }
    await navigator.clipboard.writeText(text).catch(() => {});
    toast(`${label} copied`);
  }

  return (
    <div className="card" style={{ padding: compact ? '1rem 1.15rem' : '1.25rem', marginTop: compact ? 0 : '1.5rem' }}>
      <p className="display" style={{ fontSize: compact ? '1.15rem' : '1.35rem', marginTop: 0 }}>
        {isLawyer ? 'Refer counsel — 50% off' : isCare ? 'Invite caregivers / families' : 'Grow one city'}
      </p>
      <p className="muted" style={{ marginTop: 0 }}>
        {rule}
      </p>

      <div className="field" style={{ marginBottom: '0.75rem' }}>
        <label>Focus city</label>
        <input
          list="heirready-cities"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Pune"
        />
        <datalist id="heirready-cities">
          {SUGGESTED_CITIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      {loading && <p className="small muted">Loading your invite links…</p>}
      {error && (
        <p className="small" style={{ color: 'var(--danger, #8f2f2f)' }}>
          {error}
        </p>
      )}

      {ready ? (
        <>
          <p className="small" style={{ marginBottom: '0.75rem' }}>
            Your code: <strong style={{ letterSpacing: '0.06em' }}>{code}</strong>
            {' · '}
            Credits: {referral?.referralDiscountCredits ?? user.referralDiscountCredits ?? 0}
            {' · '}
            Paid referrals: {referral?.paidReferredCount ?? 0}
          </p>

          {!isLawyer && (
            <div style={{ display: 'grid', gap: '0.85rem', marginBottom: '0.85rem' }}>
              <div>
                <p className="small" style={{ margin: '0 0 0.35rem', fontWeight: 700 }}>
                  Family invite — {city || 'city'}
                </p>
                <p
                  className="small"
                  style={{
                    wordBreak: 'break-all',
                    background: 'var(--mist)',
                    padding: '0.55rem 0.7rem',
                    borderRadius: 10,
                    margin: '0 0 0.45rem',
                  }}
                >
                  {links.family}
                </p>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-primary" style={{ padding: '0.4rem 0.85rem' }} onClick={() => copy(links.family, 'Family link')}>
                    Copy
                  </button>
                  <a
                    className="btn btn-ghost"
                    style={{ padding: '0.4rem 0.85rem' }}
                    href={whatsappShareUrl(
                      shareFamilyOnboardText({
                        link: links.family,
                        city,
                        inviterName: user.name,
                      })
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    WhatsApp family
                  </a>
                </div>
              </div>

              <div>
                <p className="small" style={{ margin: '0 0 0.35rem', fontWeight: 700 }}>
                  Caregiver invite — {city || 'city'}
                </p>
                <p
                  className="small"
                  style={{
                    wordBreak: 'break-all',
                    background: 'var(--mist)',
                    padding: '0.55rem 0.7rem',
                    borderRadius: 10,
                    margin: '0 0 0.45rem',
                  }}
                >
                  {links.care}
                </p>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-primary" style={{ padding: '0.4rem 0.85rem' }} onClick={() => copy(links.care, 'Care link')}>
                    Copy
                  </button>
                  <a
                    className="btn btn-ghost"
                    style={{ padding: '0.4rem 0.85rem' }}
                    href={whatsappShareUrl(
                      shareCareOnboardText({
                        link: links.care,
                        city,
                        inviterName: user.name,
                      })
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    WhatsApp caregivers
                  </a>
                </div>
              </div>
            </div>
          )}

          {isLawyer && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={() => copy(links.lawyer || links.family, 'Counsel link')}>
                Copy counsel link
              </button>
              <a
                className="btn btn-ghost"
                href={whatsappShareUrl(
                  shareReferralText({
                    link: links.lawyer || links.family,
                    inviterName: user.name,
                    accountType: 'lawyer',
                  })
                )}
                target="_blank"
                rel="noreferrer"
              >
                Share on WhatsApp
              </a>
            </div>
          )}
        </>
      ) : (
        !loading && !error && <p className="small muted">No referral code yet — refresh the page.</p>
      )}
    </div>
  );
}
