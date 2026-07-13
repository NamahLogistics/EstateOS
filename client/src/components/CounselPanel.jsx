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
  const [newNeed, setNewNeed] = useState('');
  const [newAction, setNewAction] = useState('');
  const [closeRating, setCloseRating] = useState(5);
  const [closeReview, setCloseReview] = useState('');
  const [listingForm, setListingForm] = useState({
    city: '',
    blurb: '',
    urgency: 'normal',
    scopes: ['succession', 'property'],
    published: true,
    showContact: false,
    exclusive: false,
  });

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
    if (c.listing) {
      setListingForm({
        city: c.listing.city || '',
        blurb: c.listing.blurb || '',
        urgency: c.listing.urgency || 'normal',
        scopes: c.listing.scopes?.length ? c.listing.scopes : ['succession'],
        published: c.listing.status === 'open',
        showContact: !!c.listing.showContact,
        exclusive: !!c.listing.exclusive,
      });
    }
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

  async function regenerateBrief() {
    setBusy(true);
    try {
      await api(`/api/estates/${estateId}/counsel/brief/regenerate`, { method: 'POST', body: {} });
      notify('Brief regenerated from current Life Map');
      await load();
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function addNeed(e) {
    e.preventDefault();
    if (!newNeed.trim()) return;
    setBusy(true);
    try {
      await api(`/api/estates/${estateId}/counsel/needs`, {
        method: 'POST',
        body: { title: newNeed.trim(), engagementId: counsel?.activeEngagementId },
      });
      setNewNeed('');
      notify('Need added for family');
      await load();
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function addAction(e) {
    e.preventDefault();
    if (!newAction.trim()) return;
    setBusy(true);
    try {
      await api(`/api/estates/${estateId}/counsel/actions`, {
        method: 'POST',
        body: { title: newAction.trim(), engagementId: counsel?.activeEngagementId },
      });
      setNewAction('');
      await load();
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function uploadNeedFiles(needId, fileList) {
    if (!fileList?.length) return;
    setBusy(true);
    try {
      const fd = new FormData();
      [...fileList].forEach((f) => fd.append('files', f));
      await api(`/api/estates/${estateId}/counsel/needs/${needId}/files`, {
        method: 'POST',
        body: fd,
      });
      notify('Document uploaded');
      await load();
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function closeMatter(engagementId, withRating = false) {
    setBusy(true);
    try {
      const body = {};
      if (withRating && role === 'owner') {
        body.rating = Number(closeRating);
        body.review = closeReview;
      }
      const res = await api(`/api/counsel/engagements/${engagementId}/close`, {
        method: 'POST',
        body,
      });
      notify(
        res.ratingError
          ? `Matter closed — rating note: ${res.ratingError}`
          : withRating
            ? 'Matter closed and rated'
            : 'Matter closed'
      );
      setCloseReview('');
      setCloseRating(5);
      await load();
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function rateMatter(engagementId) {
    setBusy(true);
    try {
      await api(`/api/counsel/engagements/${engagementId}/rate`, {
        method: 'POST',
        body: { rating: Number(closeRating), review: closeReview },
      });
      notify('Thanks — rating saved');
      setCloseReview('');
      setCloseRating(5);
      await load();
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
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

  async function saveListing(published = true) {
    setBusy(true);
    try {
      await api(`/api/estates/${estateId}/counsel/listing`, {
        method: 'PUT',
        body: { ...listingForm, published },
      });
      notify(published ? 'Listed for counsel in your city' : 'Listing paused');
      await load();
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function respondApproach(engagementId, decision) {
    setBusy(true);
    try {
      await api(`/api/counsel/engagements/${engagementId}/family-respond`, {
        method: 'POST',
        body: { decision },
      });
      notify(decision === 'accept' ? 'Counsel retained — matter is active' : 'Approach declined');
      await load();
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!counsel) return <p className="muted">Loading counsel layer…</p>;

  const { pathway, engagements, notes, actions, needs, role, listing, timeline, briefGeneratedAt } =
    counsel;
  const active =
    engagements.find((e) => ['active', 'requested'].includes(e.status)) ||
    engagements.find((e) => e.status === 'approached');
  const approached = engagements.filter((e) => e.status === 'approached');
  const matterLive = active && active.status === 'active';

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
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-ghost" style={{ padding: '0.4rem 0.8rem' }} onClick={downloadBrief}>
                Download counsel brief
              </button>
              {matterLive && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: '0.4rem 0.8rem' }}
                  disabled={busy}
                  onClick={regenerateBrief}
                >
                  Regenerate brief
                </button>
              )}
            </div>
          </div>
          {briefGeneratedAt && (
            <p className="small muted" style={{ margin: '0.5rem 0 0' }}>
              Brief last generated {new Date(briefGeneratedAt).toLocaleString()}
            </p>
          )}
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

        {matterLive && (
          <>
            <div className="card">
              <div style={{ padding: '1rem 1.1rem' }}>
                <strong>Counsel asks family for</strong>
                <p className="small muted" style={{ margin: '0.25rem 0 0' }}>
                  Attach scans / PDFs against each ask. Status flips to Provided on upload.
                </p>
              </div>
              {needs.length === 0 ? (
                <div className="item-row muted small">No document asks yet</div>
              ) : (
                needs.map((n) => (
                  <div key={n.id} className="item-row" style={{ display: 'grid', gap: '0.45rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
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
                    {(n.files || []).length > 0 && (
                      <div className="small" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                        {n.files.map((f) => (
                          <a
                            key={f.path || f.id}
                            href={f.path}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: 'var(--sage-deep)', fontWeight: 600 }}
                          >
                            {f.name}
                          </a>
                        ))}
                      </div>
                    )}
                    <label className="small muted" style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
                      Upload
                      <input
                        type="file"
                        multiple
                        disabled={busy}
                        onChange={(e) => {
                          uploadNeedFiles(n.id, e.target.files);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                ))
              )}
              {['counsel', 'owner', 'manager'].includes(role) && (
                <form onSubmit={addNeed} style={{ padding: '0.85rem 1.1rem', borderTop: '1px solid var(--line)' }}>
                  <div className="field" style={{ marginBottom: '0.55rem' }}>
                    <input
                      value={newNeed}
                      onChange={(e) => setNewNeed(e.target.value)}
                      placeholder="Add custom ask — e.g. Society NOC copy"
                    />
                  </div>
                  <button className="btn btn-ghost" style={{ padding: '0.35rem 0.75rem' }} disabled={busy}>
                    Add need
                  </button>
                </form>
              )}
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
              {['counsel', 'owner'].includes(role) && (
                <form onSubmit={addAction} style={{ padding: '0.85rem 1.1rem', borderTop: '1px solid var(--line)' }}>
                  <div className="field" style={{ marginBottom: '0.55rem' }}>
                    <input
                      value={newAction}
                      onChange={(e) => setNewAction(e.target.value)}
                      placeholder="Add legal action…"
                    />
                  </div>
                  <button className="btn btn-ghost" style={{ padding: '0.35rem 0.75rem' }} disabled={busy}>
                    Add action
                  </button>
                </form>
              )}
            </div>

            <div className="card">
              <div style={{ padding: '1rem 1.1rem' }}>
                <strong>Matter timeline</strong>
                <p className="small muted" style={{ margin: '0.25rem 0 0' }}>
                  Accept, notes, asks, uploads, and action updates.
                </p>
              </div>
              {(timeline || []).length === 0 ? (
                <div className="item-row muted small">No events yet</div>
              ) : (
                (timeline || []).map((ev) => (
                  <div key={ev.id} className="item-row">
                    <div className="small muted">
                      {ev.actorName || 'System'} · {ev.type} · {new Date(ev.at).toLocaleString()}
                    </div>
                    <div className="small">{ev.detail}</div>
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

            <div className="card" style={{ padding: '1.1rem' }}>
              <strong>Close matter</strong>
              <p className="small muted" style={{ marginTop: '0.25rem' }}>
                Closes the engagement and counts toward counsel reputation.
                {role === 'owner' ? ' You can rate 1–5 stars when closing.' : ''}
              </p>
              {role === 'owner' && (
                <div className="panel-grid" style={{ margin: '0.75rem 0' }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Rating</label>
                    <select value={closeRating} onChange={(e) => setCloseRating(e.target.value)}>
                      {[5, 4, 3, 2, 1].map((n) => (
                        <option key={n} value={n}>
                          {n} star{n === 1 ? '' : 's'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Review (optional)</label>
                    <input
                      value={closeReview}
                      onChange={(e) => setCloseReview(e.target.value)}
                      placeholder="Clear, responsive, good on NRI docs…"
                    />
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {role === 'owner' ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => closeMatter(active.id, true)}
                  >
                    Close + rate
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => closeMatter(active.id, false)}
                >
                  Close matter
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'grid', gap: '1rem', alignContent: 'start' }}>
        {approached.length > 0 && ['owner', 'manager'].includes(role) && (
          <div className="card">
            <div style={{ padding: '1rem 1.1rem' }}>
              <strong>Counsel approached you</strong>
              <p className="small muted" style={{ margin: '0.25rem 0 0' }}>
                Paid lawyers found your listing. Accept to open the matter.
              </p>
            </div>
            {approached.map((e) => (
              <div key={e.id} className="item-row">
                <strong>{e.lawyer?.name}</strong>
                <div className="small muted">{e.lawyer?.firm}</div>
                {e.lawyerPitch && (
                  <p className="small" style={{ margin: '0.35rem 0' }}>
                    {e.lawyerPitch}
                  </p>
                )}
                {e.lawyerFeeNote && (
                  <p className="small muted" style={{ margin: '0.15rem 0 0' }}>
                    Fee / retainer: {e.lawyerFeeNote}
                  </p>
                )}
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ padding: '0.4rem 0.8rem' }}
                    disabled={busy}
                    onClick={() => respondApproach(e.id, 'accept')}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: '0.4rem 0.8rem' }}
                    disabled={busy}
                    onClick={() => respondApproach(e.id, 'decline')}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {['owner', 'manager'].includes(role) && (
          <div className="card" style={{ padding: '1.15rem' }}>
            <p className="display" style={{ fontSize: '1.3rem', marginTop: 0 }}>
              Looking for counsel?
            </p>
            <p className="small muted" style={{ marginTop: 0 }}>
              Opt in so paid lawyers in your city can find you. Share city + need only — vault stays private.
              {listing?.status === 'open' ? (
                <span> · Currently listed in {listing.city}</span>
              ) : listing ? (
                <span> · Listing paused</span>
              ) : null}
            </p>
            <div className="field">
              <label>City</label>
              <input
                value={listingForm.city}
                onChange={(e) => setListingForm({ ...listingForm, city: e.target.value })}
                placeholder="Pune"
              />
            </div>
            <div className="field">
              <label>What you need (public blurb)</label>
              <textarea
                rows={3}
                value={listingForm.blurb}
                onChange={(e) => setListingForm({ ...listingForm, blurb: e.target.value })}
                placeholder="Father passed in Pune. Two siblings abroad. Need succession path for flat + bank — no account numbers here."
              />
            </div>
            <div className="field">
              <label>Urgency</label>
              <select
                value={listingForm.urgency}
                onChange={(e) => setListingForm({ ...listingForm, urgency: e.target.value })}
              >
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="field">
              <label>Scopes</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {SCOPE_OPTIONS.map((s) => {
                  const on = listingForm.scopes.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      className={`tab ${on ? 'active' : ''}`}
                      onClick={() =>
                        setListingForm({
                          ...listingForm,
                          scopes: on
                            ? listingForm.scopes.filter((x) => x !== s)
                            : [...listingForm.scopes, s],
                        })
                      }
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ display: 'grid', gap: '0.55rem', marginBottom: '0.9rem' }}>
              <label className="small" style={{ display: 'flex', gap: '0.45rem', alignItems: 'flex-start' }}>
                <input
                  type="checkbox"
                  checked={listingForm.showContact}
                  onChange={(e) => setListingForm({ ...listingForm, showContact: e.target.checked })}
                  style={{ marginTop: '0.2rem' }}
                />
                <span>
                  Share my email with counsel who approach (they still need your accept to open the vault)
                </span>
              </label>
              <label className="small" style={{ display: 'flex', gap: '0.45rem', alignItems: 'flex-start' }}>
                <input
                  type="checkbox"
                  checked={listingForm.exclusive}
                  onChange={(e) => setListingForm({ ...listingForm, exclusive: e.target.checked })}
                  style={{ marginTop: '0.2rem' }}
                />
                <span>Exclusive — only one counsel can approach at a time</span>
              </label>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => saveListing(true)}
              >
                {listing?.status === 'open' ? 'Update listing' : 'Publish for counsel'}
              </button>
              {listing?.status === 'open' && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => saveListing(false)}
                >
                  Pause listing
                </button>
              )}
            </div>
          </div>
        )}

        <div className="card" style={{ padding: '1.15rem' }}>
          <p className="display" style={{ fontSize: '1.3rem', marginTop: 0 }}>
            Retain counsel
          </p>
          {active && active.status !== 'approached' ? (
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
              <p className="small muted" style={{ marginBottom: '0.75rem' }}>
                No demo counsel. Request someone from the directory below, or publish “Looking for counsel” so paid advocates in your city can approach you.
              </p>
            </>
          )}
        </div>

        {(!active || active.status === 'approached') && (
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
            {lawyers.length === 0 ? (
              <div className="item-row muted small">
                No advocates in the directory yet. Publish your city listing so counsel can find you, or ask an advocate to register as counsel.
              </div>
            ) : (
            lawyers.map((l) => (
              <div key={l.id} className="item-row">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div>
                    <strong>
                      {l.name}
                      {l.verified ? (
                        <span className="badge badge-unlocked" style={{ marginLeft: '0.45rem' }}>
                          Verified
                        </span>
                      ) : null}
                    </strong>
                    <div className="small muted">
                      {l.firm}
                      {l.rating != null
                        ? ` · ★ ${l.rating}${l.ratingCount ? ` (${l.ratingCount})` : ''}`
                        : ' · New on HeirReady'}
                      {` · ${l.years}y · ${l.retainerBand}`}
                      {l.mattersCompleted ? ` · ${l.mattersCompleted} matters` : ''}
                    </div>
                    <div className="small muted">
                      {(l.cities || []).join(', ')} · {(l.specialties || []).join(', ')}
                      {l.nriFriendly ? ' · NRI' : ''}
                      {l.barId && !/pending/i.test(l.barId) ? ` · Bar ${l.barId}` : ''}
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
            ))
            )}
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
                <div key={e.id} className="item-row">
                  <div className="small">
                    <strong>{e.lawyer?.name}</strong> · {e.status}
                    {e.familyRating ? ` · ★ ${e.familyRating}/5` : ''}
                  </div>
                  {e.familyReview && <p className="small muted">{e.familyReview}</p>}
                  {e.status === 'closed' && !e.familyRating && role === 'owner' && (
                    <div style={{ marginTop: '0.5rem', display: 'grid', gap: '0.4rem' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <select
                          value={closeRating}
                          onChange={(ev) => setCloseRating(ev.target.value)}
                          style={{ borderRadius: 10, border: '1px solid var(--line)', padding: '0.3rem 0.5rem' }}
                        >
                          {[5, 4, 3, 2, 1].map((n) => (
                            <option key={n} value={n}>
                              {n}★
                            </option>
                          ))}
                        </select>
                        <input
                          value={closeReview}
                          onChange={(ev) => setCloseReview(ev.target.value)}
                          placeholder="Short review"
                          style={{ flex: 1, minWidth: 140, borderRadius: 10, border: '1px solid var(--line)', padding: '0.35rem 0.55rem' }}
                        />
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ padding: '0.35rem 0.7rem' }}
                          disabled={busy}
                          onClick={() => rateMatter(e.id)}
                        >
                          Rate
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
