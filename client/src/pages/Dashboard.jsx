import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { track } from '../analytics.js';
import ReferralCard from '../components/ReferralCard.jsx';
import UpgradeGate, { isPlanLimitError, upgradeReasonFromError } from '../components/UpgradeGate.jsx';

function statusBadge(status, t) {
  if (status === 'unlocked') return <span className="badge badge-unlocked">{t('unlocked')}</span>;
  if (status === 'unlock_pending') return <span className="badge badge-pending">{t('unlockPending')}</span>;
  return <span className="badge badge-locked">{t('locked')}</span>;
}

export default function Dashboard() {
  const { api, toast, user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [estates, setEstates] = useState([]);
  const [form, setForm] = useState({
    subjectName: '',
    subjectRelation: 'Parent',
    countryPack: 'IN',
    notes: '',
  });
  const [busy, setBusy] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState('estate');

  async function load() {
    const data = await api('/api/estates');
    setEstates(data.estates || []);
  }

  useEffect(() => {
    load().catch((e) => toast(e.message));
  }, []);

  useEffect(() => {
    if (window.location.hash !== '#grow') return;
    const timer = window.setTimeout(() => {
      document.getElementById('grow')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, []);

  async function createEstate(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api('/api/estates', { method: 'POST', body: form });
      setForm({ subjectName: '', subjectRelation: 'Parent', countryPack: 'IN', notes: '' });
      toast(t('estateCreated'));
      const estateId = res.estate?.id || res.id;
      track('estate_created', { estateId });
      if (estateId) {
        navigate(`/app/estates/${estateId}?tab=housewarming`);
      } else {
        await load();
      }
    } catch (err) {
      if (isPlanLimitError(err)) {
        setUpgradeReason(upgradeReasonFromError(err, 'estate'));
        setUpgradeOpen(true);
      } else toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  const packLabel = { IN: 'India', IN_US: 'India + US', IN_UK: 'India + UK' };
  const diaspora =
    (user?.plan === 'diaspora' || user?.plan === 'diaspora_care') && user?.planActive !== false;
  const isFreeUser =
    user?.accountType !== 'lawyer' &&
    (user?.plan === 'free' || !user?.plan || user?.planActive === false);
  const ownsEstate = estates.some((e) => e.myRole === 'owner');
  const freeAtEstateCap = isFreeUser && ownsEstate;

  return (
    <section style={{ paddingBottom: '2rem' }}>
      <UpgradeGate open={upgradeOpen} onClose={() => setUpgradeOpen(false)} reason={upgradeReason} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'end' }}>
        <div>
          <h1 className="display" style={{ fontSize: '2.2rem', marginBottom: 0 }}>
            {t('yourEstates')}
          </h1>
          <p className="muted">
            {t('oneEstatePerParent')}
            {user?.plan === 'free' || !user?.plan
              ? t('freePlanHint')
              : user?.planExpiresAt
                ? ` Plan: ${user.plan} · renews ${new Date(user.planExpiresAt).toLocaleDateString()}.`
                : ` Plan: ${user.plan}.`}
            {user?.needsRenewal ? (
              <>
                {' '}
                <Link to="/pricing">{t('renewSoon')}</Link>
              </>
            ) : null}
            {user?.planLapsedAt || (user?.previousPlan && user?.plan === 'free') ? (
              <>
                {' '}
                <Link to="/pricing">{t('planLapsed')}</Link>
              </>
            ) : null}
          </p>
        </div>
      </div>

      <div style={{ marginTop: '1.15rem', maxWidth: 640 }}>
        {estates.length > 0 ? <ReferralCard /> : null}
      </div>

      {freeAtEstateCap && (
        <div className="upgrade-limit-banner">
          <p className="small">
            <strong>{t('freeOneParent')}</strong> {t('upgradeFamily')}
          </p>
          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: '0.45rem 0.95rem' }}
            onClick={() => {
              setUpgradeReason('estate');
              setUpgradeOpen(true);
            }}
          >
            {t('upgrade')}
          </button>
        </div>
      )}

      <div className="split" style={{ marginTop: '1.25rem' }}>
        <div className="card">
          {estates.length === 0 ? (
            <div style={{ padding: '1.4rem' }}>
              <p className="display" style={{ fontSize: '1.3rem', marginTop: 0 }}>
                {t('noEstatesYet')}
              </p>
              <p className="muted">{t('createOneInvite')}</p>
            </div>
          ) : (
            estates.map((e) => (
              <Link key={e.id} to={`/app/estates/${e.id}`} className="item-row" style={{ display: 'block' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <div>
                    <strong style={{ fontSize: '1.05rem' }}>{e.subjectName}</strong>
                    <div className="small muted">
                      {e.subjectRelation} · {packLabel[e.countryPack || e.country] || e.country} ·{' '}
                      {e.itemCount} {t('vaultItems')} · {e.myRole}
                    </div>
                    {e.health && (
                      <div className="small" style={{ marginTop: '0.35rem', lineHeight: 1.45 }}>
                        <span style={{ fontWeight: 700, color: e.health.ready ? 'var(--forest, #2f6b52)' : 'var(--ink)' }}>
                          Life Map {e.health.scoreLabel}
                        </span>
                        <span className="muted">
                          {' · '}
                          {e.health.checks.map((c) => `${c.label} ${c.ok ? '✓' : '✗'}`).join(' · ')}
                        </span>
                        {e.health.next && (
                          <div className="muted" style={{ marginTop: '0.15rem' }}>
                            Next: {e.health.next.hint}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {statusBadge(e.status, t)}
                </div>
              </Link>
            ))
          )}
        </div>

        <form
          className="card"
          style={{ padding: '1.2rem' }}
          onSubmit={(e) => {
            if (freeAtEstateCap) {
              e.preventDefault();
              setUpgradeReason('estate');
              setUpgradeOpen(true);
              return;
            }
            createEstate(e);
          }}
        >
          <p className="display" style={{ fontSize: '1.35rem', marginTop: 0 }}>
            {t('newEstateHw')}
          </p>
          <p className="small muted" style={{ marginTop: 0 }}>
            {t('newEstateHwBlurb')}
          </p>
          <div className="field">
            <label>{t('subjectName')}</label>
            <input
              required
              value={form.subjectName}
              onChange={(e) => setForm({ ...form, subjectName: e.target.value })}
              placeholder="Ramesh Kumar"
            />
          </div>
          <div className="field">
            <label>{t('subjectRelation')}</label>
            <input
              value={form.subjectRelation}
              onChange={(e) => setForm({ ...form, subjectRelation: e.target.value })}
              placeholder="Father / Mother"
            />
          </div>
          <div className="field">
            <label>{t('countryPack')}</label>
            <select
              value={form.countryPack}
              onChange={(e) => {
                const v = e.target.value;
                if ((v === 'IN_US' || v === 'IN_UK') && !diaspora) {
                  setUpgradeReason('diaspora');
                  setUpgradeOpen(true);
                  return;
                }
                setForm({ ...form, countryPack: v });
              }}
            >
              <option value="IN">India</option>
              <option value="IN_US">India + US — Diaspora plan</option>
              <option value="IN_UK">India + UK — Diaspora plan</option>
            </select>
          </div>
          <div className="field">
            <label>{t('notes')}</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Lives in India; you’re in NYC / London…"
            />
          </div>
          <button className="btn btn-primary" disabled={busy} style={{ width: '100%' }}>
            {busy ? t('creating') : freeAtEstateCap ? t('upgradeAddEstate') : t('createCta')}
          </button>
        </form>
      </div>
    </section>
  );
}
