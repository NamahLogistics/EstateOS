import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import CounselPanel from '../components/CounselPanel.jsx';

const TABS = ['map', 'rules', 'unlock', 'execute', 'counsel', 'family', 'audit'];

function statusBadge(status) {
  if (status === 'unlocked') return <span className="badge badge-unlocked">Unlocked</span>;
  if (status === 'unlock_pending') return <span className="badge badge-pending">Unlock pending</span>;
  return <span className="badge badge-locked">Locked</span>;
}

export default function EstatePage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { api, toast, user } = useAuth();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState(searchParams.get('tab') || 'map');
  const [itemForm, setItemForm] = useState({
    category: 'bank',
    title: '',
    institution: '',
    accountRef: '',
    notes: '',
  });
  const [files, setFiles] = useState(null);
  const [invite, setInvite] = useState({ email: '', role: 'manager' });
  const [proofType, setProofType] = useState('death');
  const [proofFile, setProofFile] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await api(`/api/estates/${id}`);
    setData(res);
  }

  useEffect(() => {
    load().catch((e) => toast(e.message));
  }, [id]);

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && TABS.includes(t)) setTab(t);
  }, [searchParams]);

  const categories = data?.categories || [];
  const itemsByCat = useMemo(() => {
    const map = {};
    for (const c of categories) map[c.id] = [];
    for (const item of data?.items || []) {
      if (!map[item.category]) map[item.category] = [];
      map[item.category].push(item);
    }
    return map;
  }, [data, categories]);

  async function addItem(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(itemForm).forEach(([k, v]) => fd.append(k, v));
      if (files) [...files].forEach((f) => fd.append('files', f));
      await api(`/api/estates/${id}/items`, { method: 'POST', body: fd });
      setItemForm({ category: 'bank', title: '', institution: '', accountRef: '', notes: '' });
      setFiles(null);
      toast('Item added to Life Map');
      await load();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function seedDemo() {
    setBusy(true);
    try {
      await api(`/api/estates/${id}/seed-demo`, { method: 'POST', body: {} });
      toast('Demo India Life Map loaded');
      await load();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveRules(e) {
    e.preventDefault();
    const mode = e.target.mode.value;
    const requireProof = e.target.requireProof.checked;
    setBusy(true);
    try {
      await api(`/api/estates/${id}`, {
        method: 'PATCH',
        body: {
          unlockRules: {
            ...data.estate.unlockRules,
            mode,
            requireProof,
          },
        },
      });
      toast('Unlock rules saved');
      await load();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function requestUnlock(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('proofType', proofType);
      if (proofFile) fd.append('proof', proofFile);
      const res = await api(`/api/estates/${id}/unlock/request`, { method: 'POST', body: fd });
      toast(res.unlocked ? 'Estate unlocked — Execution Mode ready' : 'Unlock pending second approval');
      setTab(res.unlocked ? 'execute' : 'unlock');
      await load();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function approveUnlock() {
    setBusy(true);
    try {
      const res = await api(`/api/estates/${id}/unlock/approve`, { method: 'POST', body: {} });
      toast(res.unlocked ? 'Unlocked' : 'Approval recorded');
      if (res.unlocked) setTab('execute');
      await load();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function inviteMember(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/estates/${id}/members`, { method: 'POST', body: invite });
      toast('Member added');
      setInvite({ email: '', role: 'manager' });
      await load();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function setTaskStatus(taskId, status) {
    try {
      await api(`/api/estates/${id}/tasks/${taskId}`, { method: 'PATCH', body: { status } });
      await load();
    } catch (err) {
      toast(err.message);
    }
  }

  async function downloadLetter(taskId) {
    try {
      const res = await api(`/api/estates/${id}/tasks/${taskId}/letter`);
      const blob = new Blob([res.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast('Letter downloaded');
    } catch (err) {
      toast(err.message);
    }
  }

  async function deleteItem(itemId) {
    if (!confirm('Delete this item?')) return;
    try {
      await api(`/api/estates/${id}/items/${itemId}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      toast(err.message);
    }
  }

  if (!data) {
    return <p className="muted">Loading estate…</p>;
  }

  const { estate, items, members, tasks, audit, unlockRequests } = data;
  const done = tasks.filter((t) => t.status === 'done').length;

  return (
    <section style={{ paddingBottom: '2.5rem' }}>
      <Link to="/app" className="small muted">
        ← All estates
      </Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'start', marginTop: '0.6rem' }}>
        <div>
          <h1 className="display" style={{ fontSize: '2.2rem', margin: '0 0 0.35rem' }}>
            {estate.subjectName}
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            {estate.subjectRelation} · India pack · {items.length} vault items
          </p>
        </div>
        {statusBadge(estate.status)}
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={`tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'map'
              ? 'Life Map'
              : t === 'rules'
                ? 'Unlock rules'
                : t === 'unlock'
                  ? 'Unlock'
                  : t === 'execute'
                    ? 'Execution'
                    : t === 'counsel'
                      ? 'Counsel'
                      : t === 'family'
                        ? 'Family'
                        : 'Audit'}
          </button>
        ))}
      </div>

      {tab === 'map' && (
        <div className="split">
          <div className="card">
            <div style={{ padding: '1rem 1.1rem', display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
              <strong>Vault</strong>
              {estate.status !== 'unlocked' && (
                <button type="button" className="btn btn-ghost" style={{ padding: '0.35rem 0.8rem' }} onClick={seedDemo} disabled={busy}>
                  Load India demo items
                </button>
              )}
            </div>
            {categories.map((cat) => (
              <div key={cat.id}>
                <div style={{ padding: '0.65rem 1.1rem', background: 'var(--mist)', fontWeight: 700, fontSize: '0.82rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {cat.label}
                </div>
                {(itemsByCat[cat.id] || []).length === 0 ? (
                  <div className="item-row small muted">Nothing here yet</div>
                ) : (
                  (itemsByCat[cat.id] || []).map((item) => (
                    <div key={item.id} className="item-row">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                        <div>
                          <strong>{item.title}</strong>
                          <div className="small muted">
                            {[item.institution, item.accountRef].filter(Boolean).join(' · ')}
                          </div>
                          {item.notes && <p className="small" style={{ margin: '0.35rem 0 0' }}>{item.notes}</p>}
                          {item.files?.length > 0 && (
                            <div className="small" style={{ marginTop: '0.35rem' }}>
                              {item.files.map((f) => (
                                <a key={f.path} href={f.path} target="_blank" rel="noreferrer" style={{ marginRight: '0.6rem', color: 'var(--sage-deep)' }}>
                                  {f.name}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                        {estate.myRole !== 'viewer' && estate.status !== 'unlocked' && (
                          <button type="button" className="btn btn-danger" style={{ padding: '0.3rem 0.7rem' }} onClick={() => deleteItem(item.id)}>
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>

          {estate.status !== 'unlocked' && (
            <form className="card" style={{ padding: '1.2rem' }} onSubmit={addItem}>
              <p className="display" style={{ fontSize: '1.3rem', marginTop: 0 }}>
                Add item
              </p>
              <div className="field">
                <label>Category</label>
                <select
                  value={itemForm.category}
                  onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Title</label>
                <input required value={itemForm.title} onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })} placeholder="SBI Savings" />
              </div>
              <div className="field">
                <label>Institution</label>
                <input value={itemForm.institution} onChange={(e) => setItemForm({ ...itemForm, institution: e.target.value })} placeholder="State Bank of India" />
              </div>
              <div className="field">
                <label>Account / policy ref</label>
                <input value={itemForm.accountRef} onChange={(e) => setItemForm({ ...itemForm, accountRef: e.target.value })} placeholder="XXXX1234" />
              </div>
              <div className="field">
                <label>Notes</label>
                <textarea rows={3} value={itemForm.notes} onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })} placeholder="Nominee is spouse; passbook in steel cupboard…" />
              </div>
              <div className="field">
                <label>Photos / PDFs</label>
                <input type="file" multiple onChange={(e) => setFiles(e.target.files)} />
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
                Save to Life Map
              </button>
            </form>
          )}
        </div>
      )}

      {tab === 'rules' && (
        <form className="card" style={{ padding: '1.25rem', maxWidth: 560 }} onSubmit={saveRules}>
          <p className="display" style={{ fontSize: '1.4rem', marginTop: 0 }}>
            Who gets the keys
          </p>
          <p className="muted">
            Owner decides in advance. The app releases the map and playbook — banks still run their own nominee process.
          </p>
          <div className="field">
            <label>Unlock mode</label>
            <select name="mode" defaultValue={estate.unlockRules?.mode || 'single'}>
              <option value="single">Single unlocker (appointed person)</option>
              <option value="dual">Dual approval (2 unlockers must approve)</option>
            </select>
          </div>
          <label className="small" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
            <input name="requireProof" type="checkbox" defaultChecked={estate.unlockRules?.requireProof !== false} />
            Require death certificate / incapacity letter upload
          </label>
          <p className="small muted">
            Appointed unlockers: add siblings under Family as managers — they become unlockers.
            Current unlocker IDs: {(estate.unlockRules?.unlockerUserIds || []).join(', ') || user.id}
          </p>
          <button className="btn btn-primary" disabled={busy || estate.myRole === 'viewer'}>
            Save rules
          </button>
        </form>
      )}

      {tab === 'unlock' && (
        <div className="split">
          <div className="card" style={{ padding: '1.25rem' }}>
            <p className="display" style={{ fontSize: '1.4rem', marginTop: 0 }}>
              Request unlock
            </p>
            {estate.status === 'unlocked' ? (
              <p className="muted">This estate is already unlocked. Go to Execution.</p>
            ) : (
              <form onSubmit={requestUnlock}>
                <div className="field">
                  <label>Proof type</label>
                  <select value={proofType} onChange={(e) => setProofType(e.target.value)}>
                    <option value="death">Death certificate</option>
                    <option value="incapacity">Medical incapacity letter</option>
                  </select>
                </div>
                <div className="field">
                  <label>Upload proof</label>
                  <input type="file" onChange={(e) => setProofFile(e.target.files?.[0] || null)} />
                </div>
                <button className="btn btn-primary" disabled={busy}>
                  {busy ? 'Submitting…' : 'Submit unlock request'}
                </button>
              </form>
            )}
            {estate.status === 'unlock_pending' && (
              <div style={{ marginTop: '1rem' }}>
                <p className="muted">Waiting for a second appointed unlocker.</p>
                <button type="button" className="btn btn-ghost" onClick={approveUnlock} disabled={busy}>
                  Approve as second unlocker
                </button>
              </div>
            )}
          </div>
          <div className="card">
            <div style={{ padding: '1rem 1.1rem' }}>
              <strong>Unlock requests</strong>
            </div>
            {(unlockRequests || []).length === 0 ? (
              <div className="item-row muted small">None yet</div>
            ) : (
              unlockRequests
                .slice()
                .reverse()
                .map((r) => (
                  <div key={r.id} className="item-row small">
                    <div>
                      <strong>{r.status}</strong> · {r.proofType} · {new Date(r.createdAt).toLocaleString()}
                    </div>
                    {r.proofPath && (
                      <a href={r.proofPath} target="_blank" rel="noreferrer" style={{ color: 'var(--sage-deep)' }}>
                        View proof
                      </a>
                    )}
                  </div>
                ))
            )}
          </div>
        </div>
      )}

      {tab === 'execute' && (
        <div>
          {estate.status !== 'unlocked' ? (
            <div className="card" style={{ padding: '1.25rem' }}>
              <p className="display" style={{ fontSize: '1.4rem', marginTop: 0 }}>
                Execution Mode is locked
              </p>
              <p className="muted">
                Unlock with proof first. Until then, keep building the Life Map quietly.
              </p>
            </div>
          ) : (
            <>
              <div className="card" style={{ padding: '1rem 1.2rem', marginBottom: '1rem' }}>
                <strong>
                  {done}/{tasks.length} tasks done
                </strong>
                <div style={{ marginTop: '0.55rem', height: 8, borderRadius: 999, background: 'var(--mist)', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${tasks.length ? (done / tasks.length) * 100 : 0}%`,
                      height: '100%',
                      background: 'var(--sage)',
                    }}
                  />
                </div>
              </div>
              <div className="card">
                {tasks.map((task) => (
                  <div key={task.id} className="task-row">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1 }}>
                        <strong>{task.title}</strong>
                        <p className="small muted" style={{ margin: '0.35rem 0' }}>
                          {task.detail}
                        </p>
                        {task.documents?.length > 0 && (
                          <p className="small" style={{ margin: 0 }}>
                            Docs: {task.documents.join(' · ')}
                          </p>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'start', flexWrap: 'wrap' }}>
                        <select
                          value={task.status}
                          onChange={(e) => setTaskStatus(task.id, e.target.value)}
                          style={{ borderRadius: 10, border: '1px solid var(--line)', padding: '0.4rem 0.55rem' }}
                        >
                          <option value="todo">To do</option>
                          <option value="doing">In progress</option>
                          <option value="blocked">Blocked</option>
                          <option value="done">Done</option>
                        </select>
                        {task.letterKey && (
                          <button type="button" className="btn btn-ghost" style={{ padding: '0.4rem 0.75rem' }} onClick={() => downloadLetter(task.id)}>
                            Letter
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'counsel' && <CounselPanel estateId={id} onToast={toast} />}

      {tab === 'family' && (
        <div className="split">
          <div className="card">
            <div style={{ padding: '1rem 1.1rem' }}>
              <strong>People with access</strong>
            </div>
            {members.map((m) => (
              <div key={m.id} className="item-row">
                <strong>{m.name}</strong>
                <div className="small muted">
                  {m.email} · {m.role}
                </div>
              </div>
            ))}
          </div>
          {estate.myRole === 'owner' && (
            <form className="card" style={{ padding: '1.2rem' }} onSubmit={inviteMember}>
              <p className="display" style={{ fontSize: '1.3rem', marginTop: 0 }}>
                Invite sibling
              </p>
              <p className="small muted">They must already have an Estate OS account with this email.</p>
              <div className="field">
                <label>Email</label>
                <input required type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
              </div>
              <div className="field">
                <label>Role</label>
                <select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
                  <option value="manager">Manager (can unlock / edit)</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              <button className="btn btn-primary" disabled={busy} style={{ width: '100%' }}>
                Invite
              </button>
            </form>
          )}
        </div>
      )}

      {tab === 'audit' && (
        <div className="card">
          {(audit || []).length === 0 ? (
            <div className="item-row muted">No activity yet</div>
          ) : (
            audit.map((a) => (
              <div key={a.id} className="item-row small">
                <strong>{a.action}</strong>
                <div className="muted">
                  {a.detail} · {new Date(a.at).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
