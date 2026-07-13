import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import UpgradeGate, { isPlanLimitError } from './UpgradeGate.jsx';

export default function CarePanel({ estateId, onSaved }) {
  const { api, toast } = useAuth();
  const [city, setCity] = useState('');
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
      if (isPlanLimitError(err)) {
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
      if (isPlanLimitError(err)) {
        setUpgradeOpen(true);
      } else toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: '1.2rem' }}>
      <UpgradeGate open={upgradeOpen} onClose={() => setUpgradeOpen(false)} reason="care" />
      <p className="display" style={{ fontSize: '1.35rem', marginTop: 0 }}>
        Care in their city
      </p>
      <p className="muted small" style={{ marginTop: 0 }}>
        Nurses, maids, and attendants near your parent — included with Family or Diaspora.
      </p>

      {unlocked === false && (
        <div className="upgrade-limit-banner" style={{ marginTop: '0.75rem' }}>
          <p className="small">
            <strong>Upgrade to browse city care.</strong> Family (₹1,499/yr) or Diaspora (₹24,998/yr)
            unlocks nurses and maids — then save them to the vault.
          </p>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <Link className="btn btn-primary" style={{ padding: '0.45rem 0.95rem' }} to="/pricing?plan=family">
              Family
            </Link>
            <Link className="btn btn-ghost" style={{ padding: '0.45rem 0.95rem' }} to="/pricing?plan=diaspora">
              Diaspora
            </Link>
          </div>
        </div>
      )}

      {unlocked !== false && (
        <>
          <div className="panel-grid" style={{ marginTop: '0.85rem' }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>City</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Pune" />
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
              <p className="muted small">No caregivers in this city yet — check back as the network grows.</p>
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
                      {w.bio && <p className="small" style={{ margin: '0.35rem 0 0' }}>{w.bio}</p>}
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
