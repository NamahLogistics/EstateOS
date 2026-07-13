import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useCareNetwork } from '../careNetwork.js';
import UpgradeGate, { isPlanLimitError } from './UpgradeGate.jsx';

function ComingSoonCard() {
  return (
    <div
      className="card"
      style={{
        padding: '1.5rem 1.35rem',
        borderColor: 'rgba(47, 107, 82, 0.35)',
        background: 'linear-gradient(165deg, rgba(220, 232, 225, 0.65), var(--card))',
      }}
    >
      <p
        className="small muted"
        style={{ margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}
      >
        Coming soon
      </p>
      <p className="display" style={{ fontSize: '1.55rem', margin: '0.35rem 0 0.45rem' }}>
        Care in their city
      </p>
      <p className="muted" style={{ marginTop: 0, lineHeight: 1.55, maxWidth: 420 }}>
        Finding nurses, maids, and attendants near your parent isn’t open yet — and there’s nothing to
        buy. We’re building the caregiver network first.
      </p>
      <p className="small muted" style={{ margin: '0.75rem 0 0' }}>
        Know a good caregiver? Invite them free. They can list now; families browse when we launch.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
        <Link className="btn btn-primary" to="/app#grow">
          WhatsApp invite caregivers
        </Link>
        <Link className="btn btn-ghost" to="/auth?mode=register&type=care">
          Caregiver signup — free
        </Link>
      </div>
    </div>
  );
}

export default function CarePanel({ estateId, onSaved }) {
  const { api, toast } = useAuth();
  const { comingSoon, ready } = useCareNetwork();
  const [city, setCity] = useState(() => {
    try {
      localStorage.removeItem('heirready_invite_city');
      return localStorage.getItem('heirready_invite_city_v2') || '';
    } catch {
      return '';
    }
  });
  const [role, setRole] = useState('');
  const [roles, setRoles] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [unlocked, setUnlocked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  async function load(nextCity = city, nextRole = role) {
    setBusy(true);
    try {
      const q = new URLSearchParams();
      if (nextCity.trim()) q.set('city', nextCity.trim());
      if (nextRole) q.set('role', nextRole);
      const res = await api(`/api/care/directory?${q.toString()}`);
      setUnlocked(true);
      setWorkers(res.workers || []);
      if (res.roles?.length) setRoles(res.roles);
    } catch (err) {
      if (err?.data?.code === 'CARE_COMING_SOON' || /coming soon/i.test(err?.message || '')) {
        setUnlocked(false);
        setWorkers([]);
      } else if (isPlanLimitError(err)) {
        setUnlocked(false);
        setWorkers([]);
        setUpgradeOpen(true);
      } else {
        toast(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!ready || comingSoon) return;
    load().catch(() => {});
  }, [ready, comingSoon]);

  async function saveToVault(workerId) {
    setBusy(true);
    try {
      await api(`/api/estates/${estateId}/care/save`, {
        method: 'POST',
        body: { workerId },
      });
      toast('Saved to Life Map → Care at home');
      onSaved?.();
    } catch (err) {
      if (isPlanLimitError(err)) setUpgradeOpen(true);
      else toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!ready || comingSoon) return <ComingSoonCard />;

  return (
    <div className="card" style={{ padding: '1.2rem' }}>
      <UpgradeGate open={upgradeOpen} onClose={() => setUpgradeOpen(false)} reason="care" />
      <p className="display" style={{ fontSize: '1.35rem', marginTop: 0 }}>
        Care in their city
      </p>
      <p className="muted small" style={{ marginTop: 0 }}>
        Nurses, maids, and attendants near your parent — unlock with Family + Care or Diaspora + Care.
      </p>

      {unlocked === false && (
        <div className="upgrade-limit-banner" style={{ marginTop: '0.75rem' }}>
          <p className="small">
            <strong>Add Care Network.</strong> Family + Care ₹2,998/yr or Diaspora + Care ₹24,998/yr —
            then browse and save caregivers to the vault.
          </p>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <Link className="btn btn-primary" style={{ padding: '0.45rem 0.95rem' }} to="/pricing?plan=family_care">
              Family + Care
            </Link>
            <Link className="btn btn-ghost" style={{ padding: '0.45rem 0.95rem' }} to="/pricing?plan=diaspora_care">
              Diaspora + Care
            </Link>
          </div>
        </div>
      )}

      {unlocked !== false && (
        <>
          <div className="panel-grid" style={{ marginTop: '0.85rem' }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>City</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Your city" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="">Any</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: '0.75rem' }}
            disabled={busy}
            onClick={() => load()}
          >
            {busy ? 'Searching…' : 'Search'}
          </button>

          <div style={{ marginTop: '1rem' }}>
            {workers.length === 0 ? (
              <p className="muted small">No caregivers in this city yet — invite them on WhatsApp.</p>
            ) : (
              workers.map((w) => (
                <div key={w.id} className="item-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div>
                      <strong>{w.name}</strong>
                      <div className="small muted">
                        {w.roleLabel} · {(w.cities || []).join(', ')}
                        {w.rateBand ? ` · ${w.rateBand}` : ''}
                        {w.shift ? ` · ${w.shift}` : ''}
                      </div>
                      {w.phone && (
                        <div className="small" style={{ marginTop: '0.25rem' }}>
                          {w.phone}
                        </div>
                      )}
                      {w.bio && (
                        <p className="small" style={{ margin: '0.35rem 0 0' }}>
                          {w.bio}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '0.35rem 0.75rem' }}
                      disabled={busy}
                      onClick={() => saveToVault(w.id)}
                    >
                      Save to vault
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
