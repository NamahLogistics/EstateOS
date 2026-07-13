import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import ReferralCard from '../components/ReferralCard.jsx';
import UpgradeGate, { isPlanLimitError, upgradeReasonFromError } from '../components/UpgradeGate.jsx';

function statusBadge(status) {
  if (status === 'unlocked') return <span className="badge badge-unlocked">Unlocked</span>;
  if (status === 'unlock_pending') return <span className="badge badge-pending">Unlock pending</span>;
  return <span className="badge badge-locked">Locked</span>;
}

export default function Dashboard() {
  const { api, toast, user } = useAuth();
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
    const t = window.setTimeout(() => {
      document.getElementById('grow')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => window.clearTimeout(t);
  }, []);

  async function createEstate(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api('/api/estates', { method: 'POST', body: form });
      setForm({ subjectName: '', subjectRelation: 'Parent', countryPack: 'IN', notes: '' });
      toast('Estate created — start Digital Housewarming');
      const estateId = res.estate?.id || res.id;
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
            Your estates
          </h1>
          <p className="muted">
            One estate per parent.
            {user?.plan === 'free' || !user?.plan
              ? ' Free: 1 estate, 5 vault items.'
              : user?.planExpiresAt
                ? ` Plan: ${user.plan} · renews ${new Date(user.planExpiresAt).toLocaleDateString()}.`
                : ` Plan: ${user.plan}.`}
            {user?.needsRenewal ? (
              <>
                {' '}
                <Link to="/pricing">Renew soon</Link>
              </>
            ) : null}
            {user?.planLapsedAt || (user?.previousPlan && user?.plan === 'free') ? (
              <>
                {' '}
                <Link to="/pricing">Plan lapsed — renew</Link>
              </>
            ) : null}
          </p>
        </div>
      </div>

      <div style={{ marginTop: '1.15rem', maxWidth: 640 }}>
        <ReferralCard />
      </div>

      {freeAtEstateCap && (
        <div className="upgrade-limit-banner">
          <p className="small">
            <strong>Free plan: one parent.</strong> Upgrade to Family to map another estate and unlock
            unlimited vault items.
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
            Upgrade
          </button>
        </div>
      )}

      <div className="split" style={{ marginTop: '1.25rem' }}>
        <div className="card">
          {estates.length === 0 ? (
            <div style={{ padding: '1.4rem' }}>
              <p className="display" style={{ fontSize: '1.3rem', marginTop: 0 }}>
                No estates yet
              </p>
              <p className="muted">Create one for a parent. Invite siblings next — they join the vault.</p>
            </div>
          ) : (
            estates.map((e) => (
              <Link key={e.id} to={`/app/estates/${e.id}`} className="item-row" style={{ display: 'block' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <div>
                    <strong style={{ fontSize: '1.05rem' }}>{e.subjectName}</strong>
                    <div className="small muted">
                      {e.subjectRelation} · {packLabel[e.countryPack || e.country] || e.country} ·{' '}
                      {e.itemCount} items · {e.myRole}
                    </div>
                  </div>
                  {statusBadge(e.status)}
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
            New estate · Digital Housewarming
          </p>
          <p className="small muted" style={{ marginTop: 0 }}>
            Create the file, then run a 20‑minute call script — bills and caregivers, not a death dossier.
          </p>
          <div className="field">
            <label>Parent / subject name</label>
            <input
              required
              value={form.subjectName}
              onChange={(e) => setForm({ ...form, subjectName: e.target.value })}
              placeholder="Ramesh Kumar"
            />
          </div>
          <div className="field">
            <label>Relation</label>
            <input
              value={form.subjectRelation}
              onChange={(e) => setForm({ ...form, subjectRelation: e.target.value })}
              placeholder="Father / Mother"
            />
          </div>
          <div className="field">
            <label>Country pack</label>
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
            <label>Notes</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Lives in India; you’re in NYC / London…"
            />
          </div>
          <button className="btn btn-primary" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Creating…' : freeAtEstateCap ? 'Upgrade to add another estate' : 'Create estate'}
          </button>
        </form>
      </div>
    </section>
  );
}
