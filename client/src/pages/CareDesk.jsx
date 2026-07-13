import { useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import ReferralCard from '../components/ReferralCard.jsx';

const DEFAULT_ROLES = [
  { id: 'nurse', label: 'Nurse' },
  { id: 'attendant', label: 'Attendant / ayah' },
  { id: 'maid', label: 'Maid / domestic help' },
  { id: 'cook', label: 'Cook' },
  { id: 'driver', label: 'Driver' },
  { id: 'other', label: 'Other caregiver' },
];

function formFromWorker(worker) {
  return {
    name: worker?.name || '',
    role: worker?.role || 'maid',
    cities: (worker?.cities || []).join(', '),
    languages: (worker?.languages || []).join(', '),
    years: worker?.years ?? 1,
    rateBand: worker?.rateBand || '',
    shift: worker?.shift || '',
    phone: worker?.phone || '',
    bio: worker?.bio || '',
    acceptingWork: worker?.acceptingWork !== false,
  };
}

export default function CareDesk() {
  const { api, toast, user } = useAuth();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await api('/api/care/desk');
    setData(res);
    setForm(formFromWorker(res.worker));
  }

  useEffect(() => {
    load().catch((e) => toast(e.message));
  }, []);

  async function save(e) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      const res = await api('/api/care/me', {
        method: 'PATCH',
        body: { ...form, years: Number(form.years) },
      });
      setData((d) => ({ ...d, worker: res.worker }));
      setForm(formFromWorker(res.worker));
      toast('Profile saved — you’ll show when city care launches for families');
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!data || !form) return <p className="muted">Loading care desk…</p>;

  const roles = data.roles?.length ? data.roles : DEFAULT_ROLES;
  const worker = data.worker;

  return (
    <section style={{ paddingBottom: '2.5rem' }}>
      <p className="small muted" style={{ letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>
        Care desk
      </p>
      <h1 className="display" style={{ fontSize: '2.3rem', margin: '0.2rem 0 0.4rem' }}>
        {worker?.name || user.name}
      </h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {(worker?.cities || []).join(' / ') || 'Set cities'} · {worker?.roleLabel || worker?.role} ·{' '}
        {worker?.acceptingWork === false ? 'Not accepting work' : 'Accepting work'}
      </p>

      <div
        className="card"
        style={{
          margin: '1rem 0',
          maxWidth: 640,
          padding: '1rem 1.15rem',
          borderColor: 'rgba(47, 107, 82, 0.35)',
          background: 'linear-gradient(165deg, rgba(220, 232, 225, 0.55), var(--card))',
        }}
      >
        <p
          className="small muted"
          style={{ margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}
        >
          Coming soon for families
        </p>
        <p className="muted" style={{ margin: '0.35rem 0 0' }}>
          Keep your profile ready. Families can’t browse yet — city care unlock is coming soon. You’re free to join
          and list.
        </p>
      </div>

      <div style={{ margin: '1.15rem 0', maxWidth: 640 }}>
        <ReferralCard />
      </div>

      <form className="card" style={{ padding: '1.15rem', margin: '1.25rem 0' }} onSubmit={save}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <strong>Your care profile</strong>
            <p className="small muted" style={{ margin: '0.25rem 0 0' }}>
              List free now — families will see you when city care launches.
            </p>
          </div>
          <button type="submit" className="btn btn-primary" style={{ padding: '0.4rem 0.85rem' }} disabled={busy}>
            Save profile
          </button>
        </div>

        <div className="panel-grid" style={{ marginTop: '1rem' }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Display name</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Role</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Cities (comma-separated)</label>
            <input
              required
              value={form.cities}
              onChange={(e) => setForm({ ...form, cities: e.target.value })}
              placeholder="Cities you serve"
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Phone (shown to paid families)</label>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+91…"
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Languages</label>
            <input
              value={form.languages}
              onChange={(e) => setForm({ ...form, languages: e.target.value })}
              placeholder="Hindi, Marathi"
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Years of work</label>
            <input
              type="number"
              min={0}
              value={form.years}
              onChange={(e) => setForm({ ...form, years: e.target.value })}
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Rate band</label>
            <input
              value={form.rateBand}
              onChange={(e) => setForm({ ...form, rateBand: e.target.value })}
              placeholder="₹15k–20k / month"
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Typical shift</label>
            <input
              value={form.shift}
              onChange={(e) => setForm({ ...form, shift: e.target.value })}
              placeholder="Day / night / 24h"
            />
          </div>
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label>Short bio</label>
          <textarea
            rows={3}
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            placeholder="Experienced with elderly care, live-out…"
          />
        </div>
        <label className="small" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={form.acceptingWork}
            onChange={(e) => setForm({ ...form, acceptingWork: e.target.checked })}
          />
          Accepting new work
        </label>
      </form>

      <p className="small muted">
        Complete your profile so you’re ready when families can browse. Caregivers join free — no payment needed.
      </p>
    </section>
  );
}
