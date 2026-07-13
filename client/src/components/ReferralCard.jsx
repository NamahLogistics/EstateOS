import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth.jsx';
import {
  buildInviteUrl,
  shareCareOnboardText,
  shareFamilyOnboardText,
  shareReferralText,
  whatsappShareUrl,
} from '../whatsapp.js';

const CITY_KEY = 'heirready_invite_city_v2';
const SUGGESTED_CITIES = ['Mumbai', 'Bengaluru', 'Hyderabad', 'Delhi NCR', 'Chennai', 'Jaipur', 'Ahmedabad', 'Kolkata'];

export default function ReferralCard({ compact = false }) {
  const { user, api, toast, setUser, token } = useAuth();
  const [referral, setReferral] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [city, setCity] = useState(() => {
    try {
      localStorage.removeItem('heirready_invite_city'); // drop old Pune default
      return localStorage.getItem(CITY_KEY) || '';
    } catch {
      return '';
    }
  });
  const isLawyer = user?.accountType === 'lawyer';

  useEffect(() => {
    if (city.trim()) localStorage.setItem(CITY_KEY, city.trim());
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
        setError(String(err.message || 'Could not load invite links'));
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
      family: referral?.linkFamily || buildInviteUrl({ origin, ref: code, city }),
      care: referral?.linkCare || buildInviteUrl({ origin, ref: code, city, type: 'care' }),
      lawyer: referral?.linkLawyer || buildInviteUrl({ origin, ref: code, city, type: 'lawyer' }),
    };
  }, [code, referral, city, origin]);

  if (!user) return null;

  const ready = Boolean(code && (links.family || links.care));

  async function copy(text, label) {
    if (!text) {
      toast('Link not ready yet');
      return;
    }
    await navigator.clipboard.writeText(text).catch(() => {});
    toast(`${label} copied`);
  }

  return (
    <div
      id="grow"
      className="card"
      style={{
        padding: compact ? '1.1rem 1.15rem' : '1.35rem',
        marginTop: compact ? 0 : '1.5rem',
        borderColor: 'rgba(47, 107, 82, 0.35)',
        background: 'linear-gradient(165deg, rgba(220, 232, 225, 0.65), var(--card))',
      }}
    >
      <p
        className="small muted"
        style={{ margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}
      >
        Invite
      </p>
      <p className="display" style={{ fontSize: compact ? '1.25rem' : '1.45rem', margin: '0.25rem 0 0.35rem' }}>
        Grow your city — WhatsApp invites
      </p>
      <p className="muted" style={{ marginTop: 0 }}>
        Type the city you care about — works anywhere. Caregiver invites are free to join —{' '}
        <strong>no 50% off for free care signups</strong>. You get 50% off only when someone{' '}
        <strong>pays</strong> a plan with your code.
      </p>

      <div className="field" style={{ marginBottom: '0.85rem' }}>
        <label>Focus city</label>
        <input
          list="heirready-cities"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Your city"
          required
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
          <p className="small" style={{ marginBottom: '0.85rem' }}>
            Your code: <strong style={{ letterSpacing: '0.06em' }}>{code}</strong>
            {' · '}
            Credits: {referral?.referralDiscountCredits ?? user.referralDiscountCredits ?? 0}
          </p>

          <div style={{ display: 'grid', gap: '1rem' }}>
            <div>
              <p className="small" style={{ margin: '0 0 0.35rem', fontWeight: 700 }}>
                1. Invite family (adult children)
              </p>
              <p
                className="small"
                style={{
                  wordBreak: 'break-all',
                  background: 'rgba(255,255,255,0.7)',
                  padding: '0.55rem 0.7rem',
                  borderRadius: 10,
                  margin: '0 0 0.45rem',
                }}
              >
                {links.family}
              </p>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: '0.45rem 0.9rem' }}
                  onClick={() => copy(links.family, 'Family link')}
                >
                  Copy family link
                </button>
                <a
                  className="btn btn-ghost"
                  style={{ padding: '0.45rem 0.9rem' }}
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
                2. Invite caregivers (nurses / maids)
              </p>
              <p
                className="small"
                style={{
                  wordBreak: 'break-all',
                  background: 'rgba(255,255,255,0.7)',
                  padding: '0.55rem 0.7rem',
                  borderRadius: 10,
                  margin: '0 0 0.45rem',
                }}
              >
                {links.care}
              </p>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: '0.45rem 0.9rem' }}
                  onClick={() => copy(links.care, 'Care link')}
                >
                  Copy care link
                </button>
                <a
                  className="btn btn-ghost"
                  style={{ padding: '0.45rem 0.9rem' }}
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

            {isLawyer && (
              <div>
                <p className="small" style={{ margin: '0 0 0.35rem', fontWeight: 700 }}>
                  Counsel invite
                </p>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: '0.45rem 0.9rem' }}
                    onClick={() => copy(links.lawyer, 'Counsel link')}
                  >
                    Copy counsel link
                  </button>
                  <a
                    className="btn btn-ghost"
                    style={{ padding: '0.45rem 0.9rem' }}
                    href={whatsappShareUrl(
                      shareReferralText({
                        link: links.lawyer,
                        inviterName: user.name,
                        accountType: 'lawyer',
                      })
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    WhatsApp counsel
                  </a>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        !loading &&
        !error && <p className="small muted">No referral code yet — hard-refresh the page (Cmd+Shift+R).</p>
      )}
    </div>
  );
}
