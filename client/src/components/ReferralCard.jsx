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

const waBtn = {
  padding: '0.75rem 1.1rem',
  background: '#128C7E',
  color: '#fff',
  border: 'none',
  fontWeight: 700,
  width: '100%',
  textAlign: 'center',
  textDecoration: 'none',
  display: 'inline-block',
  borderRadius: 12,
};

export default function ReferralCard({ compact = false }) {
  const { user, api, toast, setUser, token } = useAuth();
  const [referral, setReferral] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [city, setCity] = useState(() => {
    try {
      localStorage.removeItem('heirready_invite_city');
      return localStorage.getItem(CITY_KEY) || '';
    } catch {
      return '';
    }
  });
  const isLawyer = user?.accountType === 'lawyer';
  const isCare = user?.accountType === 'care';

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

  const familyWa = useMemo(
    () =>
      links.family
        ? whatsappShareUrl(
            shareFamilyOnboardText({
              link: links.family,
              city,
              inviterName: user?.name,
            })
          )
        : null,
    [links.family, city, user?.name]
  );

  const careWa = useMemo(
    () =>
      links.care
        ? whatsappShareUrl(
            shareCareOnboardText({
              link: links.care,
              city,
              inviterName: user?.name,
            })
          )
        : null,
    [links.care, city, user?.name]
  );

  const lawyerWa = useMemo(
    () =>
      links.lawyer
        ? whatsappShareUrl(
            shareReferralText({
              link: links.lawyer,
              inviterName: user?.name,
              accountType: 'lawyer',
            })
          )
        : null,
    [links.lawyer, user?.name]
  );

  if (!user) return null;

  const ready = Boolean(code && (links.family || links.care));
  const cityReady = Boolean(city.trim());

  function needCity(e) {
    if (cityReady) return;
    e.preventDefault();
    toast('Type a city first — it goes in the WhatsApp message');
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
        Invite on WhatsApp
      </p>
      <p className="display" style={{ fontSize: compact ? '1.25rem' : '1.45rem', margin: '0.25rem 0 0.35rem' }}>
        Tap → pick a chat → send
      </p>
      <p className="muted" style={{ marginTop: 0 }}>
        Bring families with your link. One person can earn many credits — each paid signup stacks.
      </p>

      <div
        className="small"
        style={{
          marginBottom: '1rem',
          padding: '0.75rem 0.85rem',
          borderRadius: 12,
          background: 'rgba(255,255,255,0.72)',
          lineHeight: 1.55,
          color: 'var(--ink-soft)',
        }}
      >
        <strong style={{ color: 'var(--ink)' }}>How 50% credits work</strong>
        <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
          <li>They join free with your link → linked to you (no credit yet).</li>
          <li>They pay a plan later — even next year → you get <strong>1 credit</strong>.</li>
          <li>Invite many people → credits <strong>stack</strong> (10 paid friends = 10 credits).</li>
          <li>Each credit = 50% off one checkout (upgrade or renew). Credits don’t expire.</li>
          <li>Caregiver free joins don’t earn credits. One credit per person, first payment only.</li>
        </ul>
      </div>

      <div className="field" style={{ marginBottom: '1rem' }}>
        <label>City in the message</label>
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

      {loading && <p className="small muted">Preparing your WhatsApp invites…</p>}
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
            Credits ready:{' '}
            <strong>{referral?.referralDiscountCredits ?? user.referralDiscountCredits ?? 0}</strong>
            {(referral?.referralRewardCount || user.referralRewardCount) ? (
              <>
                {' '}
                · Earned from {referral?.referralRewardCount ?? user.referralRewardCount} paid signup
                {(referral?.referralRewardCount ?? user.referralRewardCount) === 1 ? '' : 's'}
              </>
            ) : null}
          </p>

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {!isCare && (
              <a
                className="btn"
                style={{ ...waBtn, opacity: cityReady ? 1 : 0.55 }}
                href={familyWa || '#'}
                target="_blank"
                rel="noreferrer"
                onClick={needCity}
              >
                WhatsApp family / adult children
              </a>
            )}

            {!isLawyer && (
              <a
                className="btn"
                style={{ ...waBtn, opacity: cityReady ? 1 : 0.55 }}
                href={careWa || '#'}
                target="_blank"
                rel="noreferrer"
                onClick={needCity}
              >
                WhatsApp nurses / maids
              </a>
            )}

            {isLawyer && (
              <a
                className="btn"
                style={waBtn}
                href={lawyerWa || '#'}
                target="_blank"
                rel="noreferrer"
              >
                WhatsApp other advocates
              </a>
            )}
          </div>

          <p className="small muted" style={{ margin: '0.85rem 0 0' }}>
            Opens WhatsApp with a ready message — choose who to send it to.
          </p>
        </>
      ) : (
        !loading &&
        !error && <p className="small muted">No referral code yet — hard-refresh the page (Cmd+Shift+R).</p>
      )}
    </div>
  );
}
