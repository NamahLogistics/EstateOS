import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import UpgradeGate, { isPlanLimitError } from './UpgradeGate.jsx';

export default function CarePanel({ estateId, onSaved }) {
  const { api, toast } = useAuth();
  const [comingSoon, setComingSoon] = useState(true);
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
      setComingSoon(false);
      setUnlocked(true);
      setWorkers(res.workers || []);
      if (res.roles?.length) setRoles(res.roles);
    } catch (err) {
      if (err?.data?.code === 'CARE_COMING_SOON' || /coming soon/i.test(err?.message || '')) {
        setComingSoon(true);
        setUnlocked(false);
        setWorkers([]);
      } else if (isPlanLimitError(err)) {
        setComingSoon(false);
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
    load().catch(() => {});
  }, []);

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
      if (err?.data?.code === 'CARE_COMING_SOON' || /coming soon/i.test(err?.message || '')) {
        setComingSoon(true);
      } else if (isPlanLimitError(err)) {
        setUpgradeOpen(true);
      } else toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (comingSoon) {
    return (
      <div
        className="card"
        style={{
          padding: '1.35rem',
          borderColor: 'rgba(47, 107, 82, 0.35)',
          background: 'linear-gradient(165deg, rgba(220, 232, 225, 0.55), var(--card))',
        }}
      >
        <p
          className="small muted"
          style={{ margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}
        >
          Coming soon
        </p>
        <p className="display" style={{ fontSize: '1.45rem', margin: '0.3rem 0 0.4rem' }}>
          Care in their city
        </p>
        <p className="muted" style={{ marginTop: 0, lineHeight: 1.55 }}>
          Browse nurses, maids, and attendants near your parent isn’t open yet. We’re seeding the
          network first — caregivers can join free today.
        </p>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.85rem' }}>
          <Link className="btn btn-primary" style={{ padding: '0.5rem 1rem' }} to="/auth?mode=register&type=care">
            Invite a caregiver — free
          </Link>
          <Link className="btn btn-ghost" style={{ padding: '0.5rem 1rem' }} to="/app#grow">
            WhatsApp invite
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: '1.2rem' }}>
      <UpgradeGate open={upgradeOpen} onClose={() => setUpgradeOpen(false)} reason="care" />
      <p className="display" style={{ fontSize: '1.35rem', marginTop: 0 }}>
        Care in their city
      </p>
      <p className="muted small" style={{ marginTop: 0 }}>
        Nurses, maids, and attendants near your parent.
      </p>

      {unlocked === false && (
        <div className="upgrade-limit-banner" style={{ marginTop: '0.75rem' }}>
          <p className="small">
            <strong>Coming soon.</strong> City care browse isn’t available to purchase yet.
          </p>
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
