import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useCareNetwork } from '../careNetwork.js';
import {
  buildInviteUrl,
  shareCareOnboardText,
  whatsappShareUrl,
} from '../whatsapp.js';
import { logWhatsAppShare } from '../activity.js';
import UpgradeGate, { isPlanLimitError } from './UpgradeGate.jsx';

const CITY_KEY = 'heirready_invite_city_v2';
const SUGGESTED = ['Lucknow', 'Mumbai', 'Bengaluru', 'Delhi NCR', 'Hyderabad', 'Jaipur'];

function ComingSoonCard({ city, onCity, stats, careWa, user, onWaShare }) {
  const listed = stats?.listed ?? 0;
  const goal = stats?.goal ?? 12;
  const pct = Math.round(Math.min(1, listed / goal) * 100);

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
        buy. We’re seeding the caregiver network first.
      </p>

      <div className="field" style={{ marginTop: '1rem', maxWidth: 320 }}>
        <label>Parent city</label>
        <input
          value={city}
          onChange={(e) => onCity(e.target.value)}
          placeholder="e.g. Lucknow"
          list="care-city-suggest"
        />
        <datalist id="care-city-suggest">
          {SUGGESTED.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      {city.trim() && (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.85rem 1rem',
            borderRadius: 12,
            background: 'rgba(255,255,255,0.72)',
            lineHeight: 1.5,
          }}
        >
          <strong>
            {listed} caregiver{listed === 1 ? '' : 's'} listed in {city.trim()}
          </strong>
          <p className="small muted" style={{ margin: '0.35rem 0 0.55rem' }}>
            Goal: {goal} to unlock city browse for families. You’re helping seed density — like early
            Airbnb supply.
          </p>
          <div
            style={{
              height: 8,
              borderRadius: 999,
              background: 'rgba(47, 107, 82, 0.15)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: '100%',
                background: 'var(--forest, #2f6b52)',
                borderRadius: 999,
              }}
            />
          </div>
          <p className="small muted" style={{ margin: '0.45rem 0 0' }}>
            {listed >= goal
              ? 'Density ready — we’re opening cities carefully.'
              : `${Math.max(0, goal - listed)} more listings help unlock ${city.trim()}.`}
          </p>
        </div>
      )}

      <p className="small muted" style={{ margin: '0.85rem 0 0' }}>
        Know a good caregiver? Invite them free. They can list now; families browse when we launch.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
        {careWa ? (
          <a
            className="btn btn-primary"
            href={careWa}
            target="_blank"
            rel="noreferrer"
            onClick={() => onWaShare?.()}
          >
            WhatsApp invite caregivers
          </a>
        ) : (
          <Link className="btn btn-primary" to="/app#grow">
            WhatsApp invite caregivers
          </Link>
        )}
        <Link className="btn btn-ghost" to="/auth?mode=register&type=care">
          Caregiver signup — free
        </Link>
      </div>
      {!user && (
        <p className="small muted" style={{ marginTop: '0.75rem' }}>
          Sign in to attach your referral credit when caregivers join.
        </p>
      )}
    </div>
  );
}

export default function CarePanel({ estateId, onSaved }) {
  const { api, toast, user } = useAuth();
  const { comingSoon, ready } = useCareNetwork();
  const [city, setCity] = useState(() => {
    try {
      localStorage.removeItem('heirready_invite_city');
      return localStorage.getItem(CITY_KEY) || '';
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
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (city.trim()) {
      try {
        localStorage.setItem(CITY_KEY, city.trim());
      } catch {
        /* ignore */
      }
    }
  }, [city]);

  useEffect(() => {
    if (!city.trim()) {
      setStats(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/care/stats?city=${encodeURIComponent(city.trim())}`)
      .then(async (r) => {
        const d = await r.json();
        if (!cancelled && r.ok) setStats(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [city]);

  const careWa =
    user?.referralCode && city.trim()
      ? whatsappShareUrl(
          shareCareOnboardText({
            link: buildInviteUrl({
              origin: window.location.origin,
              ref: user.referralCode,
              type: 'care',
              city: city.trim(),
            }),
            city: city.trim(),
            inviterName: user.name,
          })
        )
      : null;

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

  if (!ready || comingSoon) {
    return (
      <ComingSoonCard
        city={city}
        onCity={setCity}
        stats={stats}
        careWa={careWa}
        user={user}
        onWaShare={() =>
          logWhatsAppShare('referral_care', { city: city.trim() || null }, api)
        }
      />
    );
  }

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
