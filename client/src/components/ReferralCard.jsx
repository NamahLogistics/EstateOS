import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
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
  const { t, lang } = useI18n();
  const [referral, setReferral] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [careStats, setCareStats] = useState(null);
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
    if (!city.trim() || isLawyer) {
      setCareStats(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/care/stats?city=${encodeURIComponent(city.trim())}`)
      .then(async (r) => {
        const d = await r.json();
        if (!cancelled && r.ok) setCareStats(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [city, isLawyer]);

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
              lang,
            })
          )
        : null,
    [links.family, city, user?.name, lang]
  );

  const careWa = useMemo(
    () =>
      links.care
        ? whatsappShareUrl(
            shareCareOnboardText({
              link: links.care,
              city,
              inviterName: user?.name,
              lang,
            })
          )
        : null,
    [links.care, city, user?.name, lang]
  );

  const lawyerWa = useMemo(
    () =>
      links.lawyer
        ? whatsappShareUrl(
            shareReferralText({
              link: links.lawyer,
              inviterName: user?.name,
              accountType: 'lawyer',
              lang,
            })
          )
        : null,
    [links.lawyer, user?.name, lang]
  );

  if (!user) return null;

  const ready = Boolean(code && (links.family || links.care));
  const cityReady = Boolean(city.trim());

  function needCity(e) {
    if (cityReady) return;
    e.preventDefault();
    toast(t('needCityFirst'));
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
        {t('inviteWhatsApp')}
      </p>
      <p className="display" style={{ fontSize: compact ? '1.25rem' : '1.45rem', margin: '0.25rem 0 0.35rem' }}>
        {t('tapPickSend')}
      </p>
      <p className="muted" style={{ marginTop: 0 }}>
        {t('bringSiblings')}
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
        <strong style={{ color: 'var(--ink)' }}>{t('careCreditsTitle')}</strong>
        <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
          <li>{t('careCredits1')}</li>
          <li>{t('careCredits2')}</li>
          <li>{t('careCredits3')}</li>
          <li>{t('careCredits4')}</li>
          <li>{t('careCredits5')}</li>
        </ul>
      </div>

      <div className="field" style={{ marginBottom: '1rem' }}>
        <label>{t('cityInMessage')}</label>
        <input
          list="heirready-cities"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder={t('yourCity')}
          required
        />
        <datalist id="heirready-cities">
          {SUGGESTED_CITIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      {careStats && cityReady && !isLawyer && (
        <p className="small" style={{ margin: '-0.35rem 0 1rem', lineHeight: 1.45 }}>
          <strong>
            {careStats.listed} caregiver{careStats.listed === 1 ? '' : 's'} listed in {city.trim()}
          </strong>
          <span className="muted">
            {' '}
            · goal {careStats.goal} to unlock city browse
            {careStats.listed < careStats.goal
              ? ` (${careStats.goal - careStats.listed} more helps)`
              : ' — density ready'}
          </span>
        </p>
      )}

      {loading && <p className="small muted">{t('preparingInvites')}</p>}
      {error && (
        <p className="small" style={{ color: 'var(--danger, #8f2f2f)' }}>
          {error}
        </p>
      )}

      {ready ? (
        <>
          <p className="small" style={{ marginBottom: '0.85rem' }}>
            {t('yourCode')}: <strong style={{ letterSpacing: '0.06em' }}>{code}</strong>
            {' · '}
            {t('creditsReady')}:{' '}
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
                {t('waSiblings')}
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
                {t('waCare')}
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
                {t('waAdvocates')}
              </a>
            )}
          </div>

          <p className="small muted" style={{ margin: '0.85rem 0 0' }}>
            {t('opensWhatsApp')}
          </p>
        </>
      ) : (
        !loading &&
        !error && <p className="small muted">{t('noRefCode')}</p>
      )}
    </div>
  );
}
