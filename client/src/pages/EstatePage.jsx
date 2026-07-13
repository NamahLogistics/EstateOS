import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import CounselPanel from '../components/CounselPanel.jsx';
import HousewarmingGuide from '../components/HousewarmingGuide.jsx';
import { useI18n } from '../i18n.jsx';
import { shareEmergencyText, shareInviteText, whatsappShareUrl } from '../whatsapp.js';

const TABS = [
  'housewarming',
  'map',
  'interview',
  'rules',
  'unlock',
  'execute',
  'counsel',
  'family',
  'emergency',
  'audit',
];

function statusBadge(status) {
  if (status === 'unlocked') return <span className="badge badge-unlocked">Unlocked</span>;
  if (status === 'unlock_pending') return <span className="badge badge-pending">Unlock pending</span>;
  return <span className="badge badge-locked">Locked</span>;
}

function fileAbsoluteUrl(file) {
  if (!file?.path) return '';
  if (/^https?:\/\//i.test(file.path)) return file.path;
  return `${window.location.origin}${file.path}`;
}

async function downloadVaultFile(file) {
  const a = document.createElement('a');
  a.href = `${file.path}${file.path.includes('?') ? '&' : '?'}download=1`;
  a.download = file.name || 'document';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function printVaultFile(file) {
  const res = await fetch(file.path);
  if (!res.ok) throw new Error('Could not open file');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (!w) {
    URL.revokeObjectURL(url);
    throw new Error('Allow pop-ups to print');
  }
  const trigger = () => {
    try {
      w.focus();
      w.print();
    } catch {
      /* browser may block until load */
    }
  };
  w.addEventListener('load', trigger);
  setTimeout(trigger, 900);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function shareVaultFile(file) {
  const absolute = fileAbsoluteUrl(file);
  const title = file.name || 'HeirReady document';
  if (navigator.share) {
    try {
      const res = await fetch(file.path);
      if (res.ok) {
        const blob = await res.blob();
        const shareFile = new File([blob], file.name || 'document', {
          type: blob.type || file.mime || 'application/octet-stream',
        });
        if (navigator.canShare?.({ files: [shareFile] })) {
          await navigator.share({ files: [shareFile], title, text: `HeirReady — ${title}` });
          return 'shared';
        }
      }
      await navigator.share({ title, text: `HeirReady document: ${title}`, url: absolute });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  window.open(
    whatsappShareUrl(`HeirReady document: ${title}\n\n${absolute}`),
    '_blank',
    'noopener,noreferrer'
  );
  return 'whatsapp';
}

export default function EstatePage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { api, toast, user } = useAuth();
  const { t, lang } = useI18n();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState(searchParams.get('tab') || 'housewarming');
  const [itemForm, setItemForm] = useState({
    category: 'bank',
    title: '',
    institution: '',
    accountRef: '',
    notes: '',
    expiresOn: '',
    shift: '',
    paidBy: '',
    backupContact: '',
  });
  const [files, setFiles] = useState(null);
  const [invite, setInvite] = useState({ email: '', role: 'manager' });
  const [proofType, setProofType] = useState('death');
  const [proofFile, setProofFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState({});
  const [scanCategory, setScanCategory] = useState('bank');
  const [scanFile, setScanFile] = useState(null);
  const [lastInviteLink, setLastInviteLink] = useState('');

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
  const careRoles = data?.careRoles || [];
  const isCare = itemForm.category === 'care';
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
      setItemForm({
        category: 'bank',
        title: '',
        institution: '',
        accountRef: '',
        notes: '',
        expiresOn: '',
        shift: '',
        paidBy: '',
        backupContact: '',
      });
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
      const res = await api(`/api/estates/${id}/seed-sample`, { method: 'POST', body: {} });
      toast(res.message || `Loaded ${res.added || ''} sample items`);
      await load();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitInterview(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api(`/api/estates/${id}/interview`, { method: 'POST', body: { answers } });
      setAnswers({});
      toast(`Interview added ${res.added} Life Map items`);
      setTab('map');
      await load();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function completeReview() {
    setBusy(true);
    try {
      const res = await api(`/api/estates/${id}/review/complete`, { method: 'POST', body: {} });
      toast(`Review done. Next: ${new Date(res.nextReviewAt).toLocaleDateString()}`);
      await load();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function rotateEmergency() {
    if (!window.confirm('Rotate emergency QR? Old printed cards stop working.')) return;
    setBusy(true);
    try {
      await api(`/api/estates/${id}/emergency/rotate`, { method: 'POST', body: {} });
      toast('Emergency token rotated');
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
    const countryPack = e.target.countryPack?.value;
    setBusy(true);
    try {
      await api(`/api/estates/${id}`, {
        method: 'PATCH',
        body: {
          countryPack,
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

  async function scanPhoto(e) {
    e.preventDefault();
    if (!scanFile) {
      toast('Choose a photo first');
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('photo', scanFile);
      fd.append('category', scanCategory);
      const res = await api(`/api/estates/${id}/items/scan`, { method: 'POST', body: fd });
      setScanFile(null);
      toast(
        res.draftSource === 'openai_vision'
          ? 'Photo scanned — review the draft item'
          : 'Photo saved as draft — edit title & details'
      );
      setTab('map');
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
      const res = await api(`/api/estates/${id}/members`, { method: 'POST', body: invite });
      const link =
        res.invite?.token
          ? `${window.location.origin}/invite/${res.invite.token}`
          : res.invite?.link || '';
      if (link) {
        setLastInviteLink(link);
        await navigator.clipboard.writeText(link).catch(() => {});
        const emailed =
          res.invite?.emailStatus === 'resend'
            ? 'Email sent + link copied'
            : res.invite?.emailStatus === 'logged'
              ? 'Invite logged + link copied (add RESEND_API_KEY to send email)'
              : 'Invite link copied — send it on WhatsApp';
        toast(emailed);
      } else {
        toast('Member added');
      }
      setInvite({ email: '', role: 'manager' });
      await load();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function exportZip() {
    try {
      const res = await fetch(`/api/estates/${id}/export`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('estate_os_session') ? JSON.parse(localStorage.getItem('estate_os_session')).token : ''}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `EstateOS_${(data?.estate?.subjectName || 'estate').replace(/\s+/g, '_')}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Export downloaded');
    } catch (err) {
      toast(err.message);
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

  const { estate, items, members, tasks, audit, unlockRequests, interviewQuestions, expiringSoon, expired, limits, countryPacks, housewarming } = data;
  const done = tasks.filter((t) => t.status === 'done').length;
  const tabLabel = {
    housewarming: t('housewarming'),
    map: t('lifeMap'),
    interview: t('interview'),
    rules: t('unlockRules'),
    unlock: t('unlock'),
    execute: t('execution'),
    counsel: t('counsel'),
    family: t('family'),
    emergency: t('emergency'),
    audit: t('audit'),
  };
  const emergencyUrl =
    estate.emergencyUrl ||
    `${typeof window !== 'undefined' ? window.location.origin : ''}/e/${estate.emergencyToken}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(emergencyUrl)}`;
  const packLabel =
    (countryPacks || []).find((p) => p.id === (estate.countryPack || estate.country))?.label ||
    estate.countryPack ||
    'India';

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
            {estate.subjectRelation} · {packLabel} · {items.length} vault items
            {estate.nextReviewAt
              ? ` · ${t('review')}: ${new Date(estate.nextReviewAt).toLocaleDateString()}`
              : ''}
          </p>
        </div>
        {statusBadge(estate.status)}
      </div>
      {limits && !limits.paid && (
        <p className="small muted" style={{ marginTop: '0.65rem' }}>
          Free plan: {limits.itemCount}/{limits.freeMaxItems} items used.{' '}
          <Link to="/pricing">Upgrade</Link> for unlimited vault + cross-border packs.
        </p>
      )}
      {(expired?.length > 0 || expiringSoon?.length > 0) && (
        <div className="card" style={{ padding: '0.85rem 1.1rem', marginTop: '0.85rem', borderColor: 'var(--terracotta, #b45309)' }}>
          {expired?.length > 0 && (
            <p className="small" style={{ margin: '0 0 0.35rem' }}>
              <strong>Expired:</strong> {expired.map((i) => i.title).join(', ')}
            </p>
          )}
          {expiringSoon?.length > 0 && (
            <p className="small" style={{ margin: 0 }}>
              <strong>Expiring soon:</strong> {expiringSoon.map((i) => `${i.title} (${i.expiresOn})`).join(', ')}
            </p>
          )}
        </div>
      )}
      <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost" style={{ padding: '0.4rem 0.85rem' }} onClick={exportZip}>
          Export ZIP
        </button>
        <button type="button" className="btn btn-ghost" style={{ padding: '0.4rem 0.85rem' }} onClick={completeReview} disabled={busy}>
          Mark {t('review')} done
        </button>
      </div>

      <div className="tabs">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            className={`tab ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            {tabLabel[key] || key}
          </button>
        ))}
      </div>

      {tab === 'housewarming' && (
        <>
          <HousewarmingGuide
            estateId={id}
            guide={housewarming}
            onUpdated={(hw) => setData({ ...data, housewarming: hw })}
            onOpenTab={(next) => setTab(next)}
          />
          {housewarming?.progress?.dismissed && !housewarming?.progress?.completedAt && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                try {
                  const res = await api(`/api/estates/${id}/housewarming`, {
                    method: 'POST',
                    body: { reopen: true },
                  });
                  setData({ ...data, housewarming: res.housewarming });
                } catch (err) {
                  toast(err.message);
                }
              }}
            >
              Resume Digital Housewarming
            </button>
          )}
          {housewarming?.progress?.completedAt && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={async () => {
                try {
                  const res = await api(`/api/estates/${id}/housewarming`, {
                    method: 'POST',
                    body: { reopen: true },
                  });
                  setData({ ...data, housewarming: res.housewarming });
                } catch (err) {
                  toast(err.message);
                }
              }}
            >
              Run housewarming again
            </button>
          )}
        </>
      )}

      {tab === 'map' && (
        <div className="split">
          <div className="card">
            <div style={{ padding: '1rem 1.1rem', display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
              <strong>Vault</strong>
              {estate.status !== 'unlocked' && (
                <button type="button" className="btn btn-ghost" style={{ padding: '0.35rem 0.8rem' }} onClick={seedDemo} disabled={busy}>
                  Load sample items
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
                          {item.category === 'care' && (
                            <div className="small muted" style={{ marginTop: '0.25rem' }}>
                              {[
                                item.shift && `Shift: ${item.shift}`,
                                item.paidBy && `Paid by: ${item.paidBy}`,
                                item.backupContact && `Backup: ${item.backupContact}`,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                          )}
                          {item.notes && <p className="small" style={{ margin: '0.35rem 0 0' }}>{item.notes}</p>}
                          {item.expiresOn && (
                            <p className="small muted" style={{ margin: '0.25rem 0 0' }}>
                              {t('expiry')}: {item.expiresOn}
                            </p>
                          )}
                          {item.files?.length > 0 && (
                            <div style={{ marginTop: '0.55rem', display: 'grid', gap: '0.45rem' }}>
                              {item.files.map((f) => (
                                <div
                                  key={f.path || f.id}
                                  style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                  }}
                                >
                                  <a
                                    href={f.path}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="small"
                                    style={{ color: 'var(--sage-deep)', fontWeight: 600, marginRight: '0.25rem' }}
                                  >
                                    {f.name}
                                  </a>
                                  <button
                                    type="button"
                                    className="btn btn-ghost"
                                    style={{ padding: '0.25rem 0.65rem', fontSize: '0.78rem' }}
                                    onClick={async () => {
                                      try {
                                        await downloadVaultFile(f);
                                        toast('Download started');
                                      } catch (err) {
                                        toast(err.message || 'Download failed');
                                      }
                                    }}
                                  >
                                    Download
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost"
                                    style={{ padding: '0.25rem 0.65rem', fontSize: '0.78rem' }}
                                    onClick={async () => {
                                      try {
                                        await printVaultFile(f);
                                      } catch (err) {
                                        toast(err.message || 'Print failed');
                                      }
                                    }}
                                  >
                                    Print
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost"
                                    style={{ padding: '0.25rem 0.65rem', fontSize: '0.78rem' }}
                                    onClick={async () => {
                                      try {
                                        const mode = await shareVaultFile(f);
                                        if (mode === 'shared') toast('Shared');
                                        else if (mode === 'whatsapp') toast('Opening WhatsApp…');
                                      } catch (err) {
                                        toast(err.message || 'Share failed');
                                      }
                                    }}
                                  >
                                    Share
                                  </button>
                                </div>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <form className="card" style={{ padding: '1.2rem' }} onSubmit={scanPhoto}>
                <p className="display" style={{ fontSize: '1.3rem', marginTop: 0 }}>
                  Scan photo
                </p>
                <p className="small muted">
                  Passbook / policy / deed photo → draft vault item (edit details after).
                </p>
                <div className="field">
                  <label>Likely category</label>
                  <select value={scanCategory} onChange={(e) => setScanCategory(e.target.value)}>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Photo</label>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => setScanFile(e.target.files?.[0] || null)}
                  />
                </div>
                <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
                  {busy ? 'Scanning…' : 'Add from photo'}
                </button>
              </form>
              <form className="card" style={{ padding: '1.2rem' }} onSubmit={addItem}>
              <p className="display" style={{ fontSize: '1.3rem', marginTop: 0 }}>
                Add item
              </p>
              <div className="field">
                <label>Category</label>
                <select
                  value={itemForm.category}
                  onChange={(e) =>
                    setItemForm({
                      ...itemForm,
                      category: e.target.value,
                      institution:
                        e.target.value === 'care' && !itemForm.institution
                          ? 'Nurse'
                          : itemForm.institution,
                    })
                  }
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{isCare ? 'Name' : 'Title'}</label>
                <input
                  required
                  value={itemForm.title}
                  onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })}
                  placeholder={isCare ? 'Sunita' : 'SBI Savings'}
                />
              </div>
              <div className="field">
                <label>{isCare ? 'Role' : 'Institution'}</label>
                {isCare && careRoles.length > 0 ? (
                  <select
                    value={itemForm.institution}
                    onChange={(e) => setItemForm({ ...itemForm, institution: e.target.value })}
                  >
                    {careRoles.map((r) => (
                      <option key={r.id} value={r.label}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={itemForm.institution}
                    onChange={(e) => setItemForm({ ...itemForm, institution: e.target.value })}
                    placeholder="State Bank of India"
                  />
                )}
              </div>
              <div className="field">
                <label>{isCare ? 'Phone' : 'Account / policy ref'}</label>
                <input
                  value={itemForm.accountRef}
                  onChange={(e) => setItemForm({ ...itemForm, accountRef: e.target.value })}
                  placeholder={isCare ? '+91-98XXXXXXXX' : 'XXXX1234'}
                />
              </div>
              {isCare && (
                <>
                  <div className="field">
                    <label>Shift / hours</label>
                    <input
                      value={itemForm.shift}
                      onChange={(e) => setItemForm({ ...itemForm, shift: e.target.value })}
                      placeholder="Night · 8pm–8am"
                    />
                  </div>
                  <div className="field">
                    <label>Who pays them</label>
                    <input
                      value={itemForm.paidBy}
                      onChange={(e) => setItemForm({ ...itemForm, paidBy: e.target.value })}
                      placeholder="Son abroad via UPI to neighbour"
                    />
                  </div>
                  <div className="field">
                    <label>Backup person</label>
                    <input
                      value={itemForm.backupContact}
                      onChange={(e) => setItemForm({ ...itemForm, backupContact: e.target.value })}
                      placeholder="Building watchman — phone"
                    />
                  </div>
                </>
              )}
              <div className="field">
                <label>Notes</label>
                <textarea
                  rows={3}
                  value={itemForm.notes}
                  onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })}
                  placeholder={
                    isCare
                      ? 'Has spare keys; call before hospital discharge…'
                      : 'Nominee is spouse; passbook in steel cupboard…'
                  }
                />
              </div>
              {!isCare && (
              <div className="field">
                <label>{t('expiry')} (optional)</label>
                <input
                  type="date"
                  value={itemForm.expiresOn}
                  onChange={(e) => setItemForm({ ...itemForm, expiresOn: e.target.value })}
                />
              </div>
              )}
              <div className="field">
                <label>Photos / PDFs</label>
                <input type="file" multiple onChange={(e) => setFiles(e.target.files)} />
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
                Save to Life Map
              </button>
            </form>
            </div>
          )}
        </div>
      )}

      {tab === 'interview' && (
        <form className="card" style={{ padding: '1.25rem', maxWidth: 640 }} onSubmit={submitInterview}>
          <p className="display" style={{ fontSize: '1.4rem', marginTop: 0 }}>
            Digital Housewarming interview
          </p>
          <p className="muted">
            You type; parent talks. Frame it as bills, caregivers, and house logistics — not a will.
            Answers become Life Map items automatically.
          </p>
          <p className="small muted">
            Script opener: “I want a simple digital checklist for the house so I can help from abroad. Twenty minutes. No lawyers today.”
          </p>
          {(interviewQuestions || []).map((q) => (
            <div className="field" key={q.id}>
              <label>{lang === 'hi' ? q.hi : q.en}</label>
              <textarea
                rows={3}
                placeholder={q.placeholder}
                value={answers[q.id] || ''}
                onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
              />
            </div>
          ))}
          <button className="btn btn-primary" disabled={busy || estate.myRole === 'viewer'}>
            {busy ? 'Saving…' : 'Build Life Map from answers'}
          </button>
        </form>
      )}

      {tab === 'emergency' && (
        <div className="card" style={{ padding: '1.25rem', maxWidth: 560 }}>
          <p className="display" style={{ fontSize: '1.4rem', marginTop: 0 }}>
            {t('emergency')}
          </p>
          <p className="muted">
            Print this QR for a wallet / fridge. It opens a public card with unlockers and first steps — not bank passwords.
          </p>
          {estate.emergencyToken ? (
            <>
              <img src={qrSrc} alt="Emergency QR" width={220} height={220} style={{ display: 'block', margin: '0.75rem 0' }} />
              <p className="small">
                <a href={emergencyUrl} target="_blank" rel="noreferrer">
                  {emergencyUrl}
                </a>
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                <a
                  className="btn btn-primary"
                  href={whatsappShareUrl(
                    shareEmergencyText({ subjectName: estate.subjectName, url: emergencyUrl })
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  Share on WhatsApp
                </a>
                {estate.myRole === 'owner' && (
                  <button type="button" className="btn btn-ghost" onClick={rotateEmergency} disabled={busy}>
                    Rotate QR token
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="muted">Emergency token missing — refresh the page.</p>
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
            <label>Country pack</label>
            <select name="countryPack" defaultValue={estate.countryPack || estate.country || 'IN'}>
              {(countryPacks || [
                { id: 'IN', label: 'India' },
                { id: 'IN_US', label: 'India + US' },
                { id: 'IN_UK', label: 'India + UK' },
              ]).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                  {p.needsDiaspora ? ' (Diaspora plan)' : ''}
                </option>
              ))}
            </select>
          </div>
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
              <p className="small muted">
                We’ll create a shareable invite link. They can register with that email and join.
              </p>
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
              {lastInviteLink && (
                <a
                  className="btn btn-ghost"
                  style={{ width: '100%', marginTop: '0.65rem', textAlign: 'center' }}
                  href={whatsappShareUrl(
                    shareInviteText({
                      estateName: estate.subjectName,
                      link: lastInviteLink,
                      inviterName: user?.name,
                    })
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  Share invite on WhatsApp
                </a>
              )}
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
