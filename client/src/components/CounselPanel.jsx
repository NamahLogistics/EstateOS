import { useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';

const SCOPE_OPTIONS = [
  'succession',
  'probate',
  'property',
  'nri',
  'disputes',
  'insurance',
  'banking-claims',
  'family-settlement',
];

export default function CounselPanel({ estateId, onToast }) {
  const { api, toast } = useAuth();
  const notify = onToast || toast;
  const [counsel, setCounsel] = useState(null);
  const [lawyers, setLawyers] = useState([]);
  const [filters, setFilters] = useState({ city: '', specialty: '', nri: false });
  const [engage, setEngage] = useState({
    lawyerId: '',
    scopes: ['succession', 'property'],
    familyBrief: '',
    urgency: 'normal',
    conflictAck: false,
  });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const [c, dir] = await Promise.all([
      api(`/api/estates/${estateId}/counsel`),
      api(`/api/lawyers?${new URLSearchParams({
        ...(filters.city ? { city: filters.city } : {}),
        ...(filters.specialty ? { specialty: filters.specialty } : {}),
        ...(filters.nri ? { nri: '1' } : {}),
      }).toString()}`),
    ]);
    setCounsel(c);
    setLawyers(dir.lawyers || []);
  }

  useEffect(() => {
    load().catch((e) => notify(e.message));
  }, [estateId]);

  async function search() {
    try {
      await load();
    } catch (e) {
      notify(e.message);
    }
  }

  async function requestEngage(lawyerId) {
    setBusy(true);
    try {
      await api(`/api/estates/${estateId}/counsel/engage`, {
        method: 'POST',
        body: { ...engage, lawyerId, conflictAck: true },
      });
      notify('Counsel requested — awaiting acceptance');
      await load();
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function demoRetain() {
    setBusy(true);
    try {
      await api(`/api/estates/${estateId}/counsel/demo-retain`, {
        method: 'POST',
        body: { familyBrief: engage.familyBrief || 'Please take over this matter.' },
      });
      notify('Adv. Kavita Mehta retained — brief + pathway ready');
      await load();
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadBrief() {
    try {
      const res = await api(`/api/estates/${estateId}/counsel/brief`);
      const blob = new Blob([res.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
      notify('Counsel brief downloaded');
    } catch (err) {
      notify(err.message);
    }
  }

  async function postNote(e) {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    try {
      await api(`/api/estates/${estateId}/counsel/notes`, {
        method: 'POST',
        body: { body: note, privileged: true, engagementId: counsel?.activeEngagementId },
      });
      setNote('');
      await load();
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function setActionStatus(actionId, status) {
    try {
      await api(`/api/estates/${estateId}/counsel/actions/${actionId}`, {
        method: 'PATCH',
        body: { status },
      });
      await load();
    } catch (err) {
      notify(err.message);
    }
  }

  async function setNeedStatus(needId, status) {
    try {
      await api(`/api/estates/${estateId}/counsel/needs/${needId}`, {
        method: 'PATCH',
        body: { status },
      });
      await load();
    } catch (err) {
      notify(err.message);
    }
  }

  if (!counsel) return <p className="muted">Loading counsel layer…</p>;

  const { pathway, engagements, notes, actions, needs, role } = counsel;
  const active = engagements.find((e) => ['active', 'engaged', 'requested'].includes(e.status));

  return (
    <div className="split">
      <div style={{ display: 'grid', gap: '1rem' }}>
        <div className="card" style={{ padding: '1.15rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div>
              <p className="display" style={{ fontSize: '1.35rem', margin: 0 }}>
                Legal pathway
              </p>
              <p className="small muted" style={{ margin: '0.35rem 0 0' }}>
                Risk score {pathway.riskScore}/100 — guidance for counsel, not a court filing.
              </p>
            </div>
            <button type="button" className="btn btn-ghost" style={{ padding: '0.4rem 0.8rem' }} onClick={downloadBrief}>
              Download counsel brief
            </button>
          </div>
          <p style={{ margin: '0.85rem 0 0', color: 'var(--ink-soft)' }}>{pathway.summary}</p>
          <div style={{ marginTop: '1rem', display: 'grid', gap: '0.65rem' }}>
            {pathway.pathways.map((p) => (
              <div
                key={p.id}
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: 14,
                  padding: '0.85rem 0.95rem',
                  background:
                    p.severity === 'critical'
                      ? 'rgba(143,47,47,0.06)'
                      : p.severity === 'high'
                        ? 'rgba(138,90,18,0.07)'
                        : 'rgba(255,255,255,0.45)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <strong>{p.title}</strong>
                  <span className="badge badge-locked">{p.severity}</span>
                </div>
                <p className="small" style={{ margin: '0.4rem 0' }}>
                  {p.recommendation}
                </p>
                <ul className="small muted" style={{ margin: 0, paddingLeft: '1.1rem' }}>
                  {p.counselActions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {active && ['active', 'engaged'].includes(active.status) && (
          <>
            <div className="card">
              <div style={{ padding: '1rem 1.1rem' }}>
                <strong>Counsel asks family for</strong>
              </div>
              {needs.map((n) => (
                <div key={n.id} className="item-row" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <span className="small">{n.title}</span>
                  <select
                    value={n.status}
                    onChange={(e) => setNeedStatus(n.id, e.target.value)}
                    style={{ borderRadius: 10, border: '1px solid var(--line)', padding: '0.3rem 0.5rem' }}
                  >
                    <option value="open">Open</option>
                    <option value="provided">Provided</option>
                    <option value="waived">Waived</option>
                  </select>
                </div>
              ))}
            </div>

            <div className="card">
              <div style={{ padding: '1rem 1.1rem' }}>
                <strong>Legal action board</strong>
              </div>
              {actions.length === 0 ? (
                <div className="item-row muted small">No actions yet</div>
              ) : (
                actions.map((a) => (
                  <div key={a.id} className="item-row" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <span>{a.title}</span>
                    <select
                      value={a.status}
                      onChange={(e) => setActionStatus(a.id, e.target.value)}
                      style={{ borderRadius: 10, border: '1px solid var(--line)', padding: '0.3rem 0.5rem' }}
                    >
                      <option value="todo">To do</option>
                      <option value="doing">Doing</option>
                      <option value="done">Done</option>
                    </select>
                  </div>
                ))
              )}
            </div>

            <div className="card" style={{ padding: '1.1rem' }}>
              <strong>Privileged matter thread</strong>
              <p className="small muted">Visible to owner, managers, and counsel only.</p>
              <div style={{ maxHeight: 260, overflow: 'auto', marginBottom: '0.75rem' }}>
                {notes.length === 0 ? (
                  <p className="small muted">No notes yet</p>
                ) : (
                  notes.map((n) => (
                    <div key={n.id} style={{ borderTop: '1px solid var(--line)', padding: '0.65rem 0' }}>
                      <div className="small muted">
                        {n.authorName} · {n.authorRole} · {new Date(n.createdAt).toLocaleString()}
                        {n.privileged ? ' · privileged' : ''}
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{n.body}</div>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={postNote}>
                <div className="field">
                  <textarea
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Strategy note, conflict flag, hearing date…"
                  />
                </div>
                <button className="btn btn-primary" disabled={busy}>
                  Post privileged note
                </button>
              </form>
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'grid', gap: '1rem', alignContent: 'start' }}>
        <div className="card" style={{ padding: '1.15rem' }}>
          <p className="display" style={{ fontSize: '1.3rem', marginTop: 0 }}>
            Retain counsel
          </p>
          {active ? (
            <div>
              <p style={{ marginTop: 0 }}>
                <strong>{active.lawyer?.name}</strong>
                <span className="badge badge-pending" style={{ marginLeft: 8 }}>
                  {active.status}
                </span>
              </p>
              <p className="small muted">{active.lawyer?.firm}</p>
              <p className="small">{active.familyBrief}</p>
              <p className="small muted">Scopes: {(active.scopes || []).join(', ')}</p>
            </div>
          ) : (
            <>
              <div className="field">
                <label>Brief for counsel</label>
                <textarea
                  rows={3}
                  value={engage.familyBrief}
                  onChange={(e) => setEngage({ ...engage, familyBrief: e.target.value })}
                  placeholder="Father passed in Pune. Two siblings (one in Canada). Flat + LIC + demat. Need succession path before banks release."
                />
              </div>
              <div className="field">
                <label>Urgency</label>
                <select value={engage.urgency} onChange={(e) => setEngage({ ...engage, urgency: e.target.value })}>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div className="field">
                <label>Scopes</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  {SCOPE_OPTIONS.map((s) => {
                    const on = engage.scopes.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        className={`tab ${on ? 'active' : ''}`}
                        onClick={() =>
                          setEngage({
                            ...engage,
                            scopes: on
                              ? engage.scopes.filter((x) => x !== s)
                              : [...engage.scopes, s],
                          })
                        }
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button type="button" className="btn btn-primary" style={{ width: '100%', marginBottom: '0.6rem' }} disabled={busy || role === 'viewer'} onClick={demoRetain}>
                Retain Adv. Mehta (recommended starter)
              </button>
            </>
          )}
        </div>

        {!active && (
          <div className="card">
            <div style={{ padding: '1rem 1.1rem' }}>
              <strong>Counsel directory</strong>
              <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.75rem' }}>
                <input
                  placeholder="City"
                  value={filters.city}
                  onChange={(e) => setFilters({ ...filters, city: e.target.value })}
                  style={{ borderRadius: 10, border: '1px solid var(--line)', padding: '0.55rem 0.7rem' }}
                />
                <input
                  placeholder="Specialty (nri, property…)"
                  value={filters.specialty}
                  onChange={(e) => setFilters({ ...filters, specialty: e.target.value })}
                  style={{ borderRadius: 10, border: '1px solid var(--line)', padding: '0.55rem 0.7rem' }}
                />
                <label className="small" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={filters.nri}
                    onChange={(e) => setFilters({ ...filters, nri: e.target.checked })}
                  />
                  NRI-friendly only
                </label>
                <button type="button" className="btn btn-ghost" onClick={search}>
                  Filter directory
                </button>
              </div>
            </div>
            {lawyers.map((l) => (
              <div key={l.id} className="item-row">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div>
                    <strong>{l.name}</strong>
                    <div className="small muted">
                      {l.firm} · ★ {l.rating} · {l.years}y · {l.retainerBand}
                    </div>
                    <div className="small muted">
                      {l.cities.join(', ')} · {l.specialties.join(', ')}
                      {l.nriFriendly ? ' · NRI' : ''}
                    </div>
                    <p className="small" style={{ margin: '0.35rem 0 0' }}>
                      {l.bio}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ padding: '0.4rem 0.8rem' }}
                    disabled={busy || role === 'viewer'}
                    onClick={() => requestEngage(l.id)}
                  >
                    Request
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {engagements.filter((e) => e.status === 'closed' || e.status === 'declined').length > 0 && (
          <div className="card">
            <div style={{ padding: '1rem 1.1rem' }}>
              <strong>Past engagements</strong>
            </div>
            {engagements
              .filter((e) => e.status === 'closed' || e.status === 'declined')
              .map((e) => (
                <div key={e.id} className="item-row small muted">
                  {e.lawyer?.name} · {e.status}
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
