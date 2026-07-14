import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import CounselPanel from '../components/CounselPanel.jsx';
import CarePanel from '../components/CarePanel.jsx';
import FamilyThread from '../components/FamilyThread.jsx';
import HousewarmingGuide from '../components/HousewarmingGuide.jsx';
import HousewarmingDone, { SiblingInviteCard } from '../components/HousewarmingDone.jsx';
import UpgradeGate, { isPlanLimitError, upgradeReasonFromError } from '../components/UpgradeGate.jsx';
import { useI18n } from '../i18n.jsx';
import { track } from '../analytics.js';
import { shareEmergencyText, shareLightReviewText, whatsappShareUrl } from '../whatsapp.js';

const TABS = [
  'housewarming',
  'map',
  'family',
  'interview',
  'findcare',
  'rules',
  'unlock',
  'execute',
  'counsel',
  'emergency',
  'audit',
];

function statusBadge(status, t) {
  if (status === 'unlocked') return <span className="badge badge-unlocked">{t('unlocked')}</span>;
  if (status === 'unlock_pending') return <span className="badge badge-pending">{t('unlockPending')}</span>;
  return <span className="badge badge-locked">{t('locked')}</span>;
}

function fileAbsoluteUrl(file) {
  if (!file?.path) return '';
  if (/^https?:\/\//i.test(file.path)) return file.path;
  return `${window.location.origin}${file.path}`;
}

/** Digits for tel: / WhatsApp — keeps leading country code if present. */
function phoneDigits(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const hasPlus = s.startsWith('+');
  const digits = s.replace(/\D/g, '');
  if (!digits || digits.length < 8) return '';
  return hasPlus ? digits : digits;
}

function callHref(raw) {
  const d = phoneDigits(raw);
  if (!d) return '';
  const num = d.length === 10 ? `91${d}` : d.replace(/^\+/, '');
  return `tel:+${num}`;
}

function whatsappChatHref(raw, name) {
  const d = phoneDigits(raw);
  if (!d) return '';
  const num = d.startsWith('0') && d.length === 11 ? `91${d.slice(1)}` : d.length === 10 ? `91${d}` : d;
  const text = name ? `Hi ${String(name).split(/\s+/)[0]}` : '';
  return `https://wa.me/${num}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
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
  const navigate = useNavigate();
  const { api, toast, user } = useAuth();
  const { t, lang } = useI18n();
  const [data, setData] = useState(null);
  const [vaultMeta, setVaultMeta] = useState({ number: null, total: 0 });
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
  const [proofType, setProofType] = useState('death');
  const [proofFile, setProofFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState({});
  const [scanCategory, setScanCategory] = useState('bank');
  const [scanFile, setScanFile] = useState(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState('items');
  const [justAddedId, setJustAddedId] = useState(null);

  function openUpgrade(reason = 'items') {
    setUpgradeReason(reason);
    setUpgradeOpen(true);
  }

  function handleLimitError(err, reason = 'items') {
    if (isPlanLimitError(err)) {
      openUpgrade(upgradeReasonFromError(err, reason));
      return true;
    }
    return false;
  }

  async function load() {
    const [res, list] = await Promise.all([
      api(`/api/estates/${id}`),
      api('/api/estates').catch(() => ({ estates: [] })),
    ]);
    setData(res);
    const estates = list.estates || [];
    const idx = estates.findIndex((e) => e.id === id);
    setVaultMeta({
      number: idx >= 0 ? idx + 1 : null,
      total: estates.length,
    });
  }

  async function startOwnLifeMap() {
    setBusy(true);
    try {
      const first = (user?.name || 'My').split(/\s+/)[0];
      const res = await api('/api/estates', {
        method: 'POST',
        body: {
          subjectName: `${first}'s Life Map`,
          subjectRelation: 'Self / household',
          countryPack: 'IN',
          notes: 'My own Life Map — invite my children here. Separate from the family parent vault.',
        },
      });
      const estateId = res.estate?.id || res.id;
      track('estate_created', { estateId, via: 'own_life_map' });
      toast('Your Life Map is ready — invite your children after Solo fridge QR');
      if (estateId) navigate(`/app/estates/${estateId}?tab=housewarming`);
    } catch (err) {
      if (!handleLimitError(err, 'estate')) toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  /** Keep Life Map health in sync when housewarming (fridge QR) progresses. */
  function applyHousewarming(res) {
    const hw = res?.housewarming || res;
    setData((d) => {
      if (!d) return d;
      return {
        ...d,
        housewarming: hw,
        estate: res?.health ? { ...d.estate, health: res.health } : d.estate,
      };
    });
  }

  useEffect(() => {
    load().catch((e) => toast(e.message));
  }, [id]);

  useEffect(() => {
    if (!justAddedId) return;
    const el = document.getElementById('vault-just-added');
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [justAddedId, data?.items?.length]);

  useEffect(() => {
    const limits = data?.limits;
    if (!limits || limits.paid) return;
    if (limits.itemCount < limits.freeMaxItems) return;
    const key = `hr_upgrade_full_${id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    openUpgrade('items');
  }, [data?.limits?.itemCount, data?.limits?.paid, data?.limits?.freeMaxItems, id]);

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && TABS.includes(t)) setTab(t);
  }, [searchParams]);

  const categories = data?.categories || [];
  const careRoles = data?.careRoles || [];
  const isCare = itemForm.category === 'care';
  const addFields = (() => {
    const c = itemForm.category;
    if (c === 'care') {
      return {
        title: 'Name',
        titlePh: 'Sunita',
        institution: 'Role',
        accountRef: 'Phone',
        accountRefPh: '+91-98XXXXXXXX',
        notesPh: 'Has spare keys; call before hospital discharge…',
        showExpiry: false,
        blurb: 'Nurse, attendant, maid, cook, driver — people who keep the house running.',
      };
    }
    if (c === 'contacts') {
      return {
        title: 'Person’s name',
        titlePh: 'Dr. Mehta',
        institution: 'Who they are',
        institutionPh: 'Family doctor · CA · neighbour · society secretary',
        accountRef: 'Phone / WhatsApp',
        accountRefPh: '+91-98XXXXXXXX',
        notesPh: 'When to call · has spare key · speaks Hindi…',
        showExpiry: false,
        blurb: 'People to call first — doctor, neighbour, CA, building secretary. Not bank account numbers.',
      };
    }
    if (c === 'bank') {
      return {
        title: 'Account nickname',
        titlePh: 'SBI joint savings',
        institution: 'Bank name',
        institutionPh: 'State Bank of India',
        accountRef: 'Account / IFSC (last digits ok)',
        accountRefPh: 'XXXX1234 · SBIN0XXXXX',
        notesPh: 'Nominee is spouse; passbook in steel cupboard…',
        showExpiry: true,
        blurb: 'Where money sits — nickname is fine; full number can wait.',
      };
    }
    if (c === 'insurance') {
      return {
        title: 'Policy nickname',
        titlePh: 'LIC Jeevan Anand',
        institution: 'Insurer',
        institutionPh: 'LIC / HDFC Life / …',
        accountRef: 'Policy number',
        accountRefPh: 'Policy no. or last 6 digits',
        notesPh: 'Nominee · agent name/phone · where papers are…',
        showExpiry: true,
        blurb: 'LIC and other policies — number + where the papers live.',
      };
    }
    if (c === 'investments') {
      return {
        title: 'Holding nickname',
        titlePh: 'NPS / demat / PPF',
        institution: 'Broker / fund house',
        institutionPh: 'Zerodha · SBI Mutual Fund · EPFO',
        accountRef: 'Folio / demat / PAN-linked ref',
        accountRefPh: 'Folio or client ID',
        notesPh: 'Who can access · nominee…',
        showExpiry: true,
        blurb: 'Demat, mutual funds, PF, NPS — enough to find the account later.',
      };
    }
    if (c === 'property') {
      return {
        title: 'Property / document',
        titlePh: 'Flat 4B · sale deed',
        institution: 'Location / registry',
        institutionPh: 'Mumbai · society name · locker bank',
        accountRef: 'Survey / doc / locker no. (optional)',
        accountRefPh: 'Flat no. · locker 12',
        notesPh: 'Who has keys · lawyer name…',
        showExpiry: false,
        blurb: 'Flat, land, locker — papers and who holds the keys.',
      };
    }
    if (c === 'digital') {
      return {
        title: 'Device / login',
        titlePh: 'Papa’s iPhone / Gmail',
        institution: 'Provider',
        institutionPh: 'Airtel · Gmail · DigiLocker',
        accountRef: 'Number / email / username',
        accountRefPh: '+91… or name@gmail.com',
        notesPh: 'PIN hint with spouse · recovery contact…',
        showExpiry: false,
        blurb: 'Phone, email, DigiLocker — how to reach accounts, not passwords.',
      };
    }
    if (c === 'subscriptions') {
      return {
        title: 'Subscription',
        titlePh: 'Electricity · Netflix · club',
        institution: 'Company',
        institutionPh: 'BEST · Tata Power · …',
        accountRef: 'Customer / CA number',
        accountRefPh: 'Consumer no.',
        notesPh: 'Auto-pay card · whose UPI…',
        showExpiry: true,
        blurb: 'Bills and memberships that keep charging if nobody knows.',
      };
    }
    if (c === 'wishes') {
      return {
        title: 'Topic',
        titlePh: 'Burial wish · donation · letters',
        institution: 'Optional context',
        institutionPh: 'Family only · temple · …',
        accountRef: null,
        notesPh: 'Write what they said in their words…',
        showExpiry: false,
        blurb: 'Soft notes and wishes — not money or phone numbers.',
      };
    }
    return {
      title: 'Title',
      titlePh: '',
      institution: 'Institution',
      institutionPh: '',
      accountRef: 'Reference',
      accountRefPh: '',
      notesPh: '',
      showExpiry: true,
      blurb: '',
    };
  })();
  const itemsByCat = useMemo(() => {
    const map = {};
    for (const c of categories) map[c.id] = [];
    for (const item of data?.items || []) {
      if (!map[item.category]) map[item.category] = [];
      map[item.category].push(item);
    }
    return map;
  }, [data, categories]);

  function mergeItemIntoData(item) {
    if (!item?.id) return;
    setData((d) => {
      if (!d) return d;
      const exists = (d.items || []).some((i) => i.id === item.id);
      const items = exists
        ? d.items.map((i) => (i.id === item.id ? item : i))
        : [...(d.items || []), item];
      const limits = d.limits
        ? { ...d.limits, itemCount: items.length }
        : d.limits;
      return { ...d, items, limits };
    });
    setJustAddedId(item.id);
    window.setTimeout(() => setJustAddedId((cur) => (cur === item.id ? null : cur)), 2500);
  }

  async function addItem(e) {
    e.preventDefault();
    const lim = data?.limits;
    if (lim && !lim.paid && lim.itemCount >= lim.freeMaxItems) {
      openUpgrade('items');
      return;
    }
    const addedCategory = itemForm.category;
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(itemForm).forEach(([k, v]) => fd.append(k, v));
      if (files) [...files].forEach((f) => fd.append('files', f));
      const res = await api(`/api/estates/${id}/items`, { method: 'POST', body: fd });
      mergeItemIntoData(res.item);
      setItemForm({
        category: addedCategory === 'care' ? 'care' : 'bank',
        title: '',
        institution: addedCategory === 'care' ? itemForm.institution || 'Attendant / ayah' : '',
        accountRef: '',
        notes: '',
        expiresOn: '',
        shift: '',
        paidBy: '',
        backupContact: '',
      });
      setFiles(null);
      toast(
        addedCategory === 'care'
          ? 'Attendant / care contact added — showing in Care at home'
          : 'Item added to Life Map'
      );
      setTab('map');
      // Refresh in background; list already updated
      load().catch(() => {});
    } catch (err) {
      if (!handleLimitError(err, 'items')) toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function seedDemo() {
    const lim = data?.limits;
    if (lim && !lim.paid && lim.itemCount >= lim.freeMaxItems) {
      openUpgrade('items');
      return;
    }
    setBusy(true);
    try {
      const res = await api(`/api/estates/${id}/seed-sample`, { method: 'POST', body: {} });
      toast(res.message || `Loaded ${res.added || ''} sample items`);
      await load();
    } catch (err) {
      if (!handleLimitError(err, 'items')) toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitInterview(e) {
    e.preventDefault();
    const lim = data?.limits;
    if (lim && !lim.paid && lim.itemCount >= lim.freeMaxItems) {
      openUpgrade('items');
      return;
    }
    setBusy(true);
    try {
      const res = await api(`/api/estates/${id}/interview`, { method: 'POST', body: { answers } });
      setAnswers({});
      toast(`Interview added ${res.added} Life Map items`);
      setTab('map');
      await load();
    } catch (err) {
      if (!handleLimitError(err, 'items')) toast(err.message);
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
    const diaspora =
      (user?.plan === 'diaspora' || user?.plan === 'diaspora_care') && user?.planActive !== false;
    if ((countryPack === 'IN_US' || countryPack === 'IN_UK') && !diaspora) {
      openUpgrade('diaspora');
      e.target.countryPack.value = data?.estate?.countryPack || data?.estate?.country || 'IN';
      return;
    }
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
      if (!handleLimitError(err, 'diaspora')) toast(err.message);
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
    const lim = data?.limits;
    if (lim && !lim.paid && lim.itemCount >= lim.freeMaxItems) {
      openUpgrade('items');
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('photo', scanFile);
      fd.append('category', scanCategory);
      const res = await api(`/api/estates/${id}/items/scan`, { method: 'POST', body: fd });
      mergeItemIntoData(res.item);
      setScanFile(null);
      toast(
        res.draftSource === 'openai_vision'
          ? 'Photo scanned — review the draft item'
          : 'Photo saved as draft — edit title & details'
      );
      setTab('map');
      load().catch(() => {});
    } catch (err) {
      if (!handleLimitError(err, 'items')) toast(err.message);
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
    return <p className="muted">{t('loadingEstate')}</p>;
  }

  const { estate, items, members, tasks, audit, unlockRequests, interviewQuestions, expiringSoon, expired, limits, countryPacks, housewarming } = data;
  const done = tasks.filter((t) => t.status === 'done').length;
  const tabLabel = {
    housewarming: t('housewarming'),
    map: `${t('vault')} · ${items.length}`,
    interview: t('interview'),
    findcare: t('findCare'),
    rules: t('unlockRules'),
    unlock: t('unlock'),
    execute: t('execution'),
    counsel: t('counsel'),
    family: t('familyChat'),
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
  const hwDone = Boolean(housewarming?.progress?.completedAt);
  const lifeMapHealth = (() => {
    const h = estate.health;
    if (!h?.checks || !hwDone) return h;
    if (h.checks.every((c) => c.id !== 'qr' || c.ok)) return h;
    const checks = h.checks.map((c) => (c.id === 'qr' ? { ...c, ok: true } : c));
    const doneCount = checks.filter((c) => c.ok).length;
    const total = checks.length;
    return {
      ...h,
      checks,
      done: doneCount,
      total,
      percent: Math.round((doneCount / total) * 100),
      scoreLabel: `${doneCount}/${total}`,
      next: checks.find((c) => !c.ok) || null,
      ready: doneCount === total,
    };
  })();
  const visibleTabs = TABS.filter((key) => {
    if (hwDone) return true;
    return key !== 'findcare' && key !== 'counsel';
  });

  return (
    <section style={{ paddingBottom: '2.5rem' }}>
      <Link to="/app" className="small muted">
        {t('allEstates')}
      </Link>
      <div className="vault-identity">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'start' }}>
          <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start', minWidth: 0 }}>
            {vaultMeta.number != null ? (
              <span className="vault-identity-num" aria-label={`Vault ${vaultMeta.number}`}>
                {vaultMeta.number}
              </span>
            ) : null}
            <div style={{ minWidth: 0 }}>
              <p
                className="small"
                style={{
                  margin: 0,
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--sage-deep, #2f6b52)',
                }}
              >
                {t('vault')}
                {vaultMeta.number != null
                  ? vaultMeta.total > 1
                    ? ` ${vaultMeta.number} of ${vaultMeta.total}`
                    : ` ${vaultMeta.number}`
                  : ''}
              </p>
              <h1 className="display" style={{ fontSize: '2.05rem', margin: '0.2rem 0 0.3rem' }}>
                {estate.subjectName}
              </h1>
              <p className="muted" style={{ margin: 0 }}>
                {estate.subjectRelation} · {packLabel} · {items.length} {t('vaultItems')}
                {estate.nextReviewAt
                  ? ` · ${t('review')}: ${new Date(estate.nextReviewAt).toLocaleDateString()}`
                  : ''}
              </p>
              {lifeMapHealth && (
                <p className="small" style={{ margin: '0.45rem 0 0', lineHeight: 1.5 }}>
                  <strong>Life Map {lifeMapHealth.scoreLabel}</strong>
                  <span className="muted">
                    {' — '}
                    {lifeMapHealth.checks.map((c) => `${c.label} ${c.ok ? '✓' : '✗'}`).join(' · ')}
                  </span>
                  {lifeMapHealth.next ? (
                    <span className="muted"> · Next: {lifeMapHealth.next.hint}</span>
                  ) : (
                    <span style={{ color: 'var(--forest, #2f6b52)' }}> · Ready</span>
                  )}
                </p>
              )}
            </div>
          </div>
          {statusBadge(estate.status, t)}
        </div>
      </div>
      {limits && !limits.paid && (
        <div className="upgrade-limit-banner">
          <p className="small">
            {limits.itemCount >= limits.freeMaxItems ? (
              <>
                <strong>Vault full</strong> — free plan uses {limits.itemCount}/{limits.freeMaxItems} items.
                {!limits.iAmOwner && limits.ownerName
                  ? ` Gift Family to ${limits.ownerName}, or start your own Life Map.`
                  : ' Upgrade to keep mapping banks, LIC, and property.'}
              </>
            ) : (
              <>
                Free plan: {limits.itemCount}/{limits.freeMaxItems} items used
                {limits.itemCount >= limits.freeMaxItems - 1
                  ? ' — one slot left before upgrade.'
                  : '.'}
                {!limits.iAmOwner && limits.ownerName ? ` (owner: ${limits.ownerName})` : ''}
              </>
            )}
          </p>
          <button type="button" className="btn btn-primary" style={{ padding: '0.45rem 0.95rem' }} onClick={() => openUpgrade(limits.itemCount >= limits.freeMaxItems ? 'items' : 'near')}>
            {limits.iAmOwner ? 'Upgrade' : 'Gift / upgrade'}
          </button>
        </div>
      )}
      <UpgradeGate
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        reason={upgradeReason}
        gift={{
          estateId: id,
          estateName: estate.subjectName,
          ownerName: limits?.ownerName || 'the owner',
          iAmOwner: Boolean(limits?.iAmOwner),
        }}
        onStartOwnMap={startOwnLifeMap}
      />
      {(!limits?.iAmOwner || Boolean(housewarming?.progress?.completedAt)) && (
        <div
          className="card"
          style={{
            padding: '1rem 1.15rem',
            marginTop: '0.85rem',
            borderColor: 'rgba(47, 107, 82, 0.35)',
            background: 'rgba(220, 232, 225, 0.4)',
          }}
        >
          <strong>{limits?.iAmOwner ? 'Also map yourself / your kids' : 'Start your own Life Map'}</strong>
          <p className="small muted" style={{ margin: '0.35rem 0 0.75rem', lineHeight: 1.5 }}>
            {limits?.iAmOwner
              ? `Separate from ${estate.subjectName}. Create a Life Map you own and invite your children. Free covers one owned file — upgrade if you already used it.`
              : `Separate from ${estate.subjectName}. Invite your children. You own it — you can upgrade it yourself. Mum/Dad’s vault stays as-is.`}
          </p>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={startOwnLifeMap}>
            {busy ? 'Creating…' : limits?.iAmOwner ? 'Create another Life Map' : 'Create my Life Map'}
          </button>
        </div>
      )}
      {(() => {
        const lightDue = estate.nextLightReviewAt && new Date(estate.nextLightReviewAt).getTime() <= Date.now() + 14 * 24 * 60 * 60 * 1000;
        const showLight =
          Boolean(housewarming?.progress?.completedAt) &&
          (lightDue || searchParams.get('review') === '1');
        if (!showLight) return null;
        const mapLink = `${window.location.origin}/app/estates/${id}?tab=map`;
        const wa = whatsappShareUrl(
          shareLightReviewText({
            estateName: estate.subjectName,
            link: mapLink,
            inviterName: user?.name,
            lang,
          })
        );
        return (
          <div
            className="card"
            style={{
              padding: '0.95rem 1.15rem',
              marginTop: '0.85rem',
              borderColor: 'rgba(47, 107, 82, 0.4)',
              background: 'rgba(220, 232, 225, 0.45)',
            }}
          >
            <strong>90-day check-in</strong>
            <p className="small muted" style={{ margin: '0.35rem 0 0.75rem', lineHeight: 1.5 }}>
              Same maid/nurse phone? Same LIC/bank? Ping a sibling on WhatsApp, then update the Life Map.
              {estate.nextLightReviewAt
                ? ` Due ${new Date(estate.nextLightReviewAt).toLocaleDateString()}.`
                : ''}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <a
                className="btn"
                style={{
                  background: '#128C7E',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 700,
                  textDecoration: 'none',
                  padding: '0.55rem 0.95rem',
                  borderRadius: 12,
                }}
                href={wa}
                target="_blank"
                rel="noreferrer"
              >
                WhatsApp siblings
              </a>
              <button type="button" className="btn btn-ghost" onClick={() => setTab('map')}>
                Open Life Map
              </button>
            </div>
          </div>
        );
      })()}
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
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: '0.4rem 0.85rem' }}
          onClick={() => setTab('family')}
        >
          {t('familyChat')}
        </button>
        <button type="button" className="btn btn-ghost" style={{ padding: '0.4rem 0.85rem' }} onClick={exportZip}>
          {t('exportZip')}
        </button>
        <button type="button" className="btn btn-ghost" style={{ padding: '0.4rem 0.85rem' }} onClick={completeReview} disabled={busy}>
          Mark {t('review')} done
        </button>
      </div>

      <div className="tabs">
        {visibleTabs.map((key) => (
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
          {hwDone && (
            <HousewarmingDone
              estateId={id}
              subjectName={estate.subjectName}
              emergencyUrl={emergencyUrl}
              inviterName={user?.name}
              completedAt={housewarming?.progress?.completedAt}
              onOpenTab={(next) => setTab(next)}
            />
          )}
          <HousewarmingGuide
            estateId={id}
            guide={housewarming}
            onUpdated={applyHousewarming}
            onOpenTab={(next) => setTab(next)}
            onCompleted={async (res) => {
              applyHousewarming(res);
              setTab('housewarming');
              try {
                await load();
              } catch (err) {
                toast(err.message);
              }
            }}
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
                  applyHousewarming(res);
                } catch (err) {
                  toast(err.message);
                }
              }}
            >
              Resume Digital Housewarming
            </button>
          )}
          {hwDone && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={async () => {
                try {
                  const res = await api(`/api/estates/${id}/housewarming`, {
                    method: 'POST',
                    body: { reopen: true },
                  });
                  applyHousewarming(res);
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
          <div className="card vault-panel">
            <div className="vault-panel-head">
              <div>
                <p
                  className="small"
                  style={{
                    margin: 0,
                    fontWeight: 800,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--sage-deep, #2f6b52)',
                  }}
                >
                  {vaultMeta.number != null ? `${t('vault')} ${vaultMeta.number}` : t('vault')}
                </p>
                <strong style={{ fontSize: '1.2rem' }}>
                  {estate.subjectName}
                  <span className="muted" style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                    {' '}
                    · {items.length} {t('vaultItems')}
                  </span>
                </strong>
              </div>
              {estate.status !== 'unlocked' && (
                <button type="button" className="btn btn-ghost" style={{ padding: '0.35rem 0.8rem' }} onClick={seedDemo} disabled={busy}>
                  Load sample items
                </button>
              )}
            </div>
            {(() => {
              let itemNo = 0;
              return categories.map((cat) => (
              <div key={cat.id}>
                <div style={{ padding: '0.65rem 1.1rem', background: 'var(--mist)', fontWeight: 700, fontSize: '0.82rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {cat.label}
                </div>
                {(itemsByCat[cat.id] || []).length === 0 ? (
                  <div className="item-row small muted">Nothing here yet</div>
                ) : (
                  (itemsByCat[cat.id] || []).map((item) => {
                    itemNo += 1;
                    const n = itemNo;
                    const isPerson =
                      item.category === 'care' || item.category === 'contacts';
                    const callUrl = isPerson ? callHref(item.accountRef) : '';
                    const waUrl = isPerson ? whatsappChatHref(item.accountRef, item.title) : '';
                    return (
                    <div
                      key={item.id}
                      className="item-row"
                      id={item.id === justAddedId ? 'vault-just-added' : undefined}
                      style={
                        item.id === justAddedId
                          ? {
                              background: 'rgba(220, 232, 225, 0.85)',
                              outline: '2px solid rgba(47, 107, 82, 0.45)',
                            }
                          : undefined
                      }
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'flex-start', minWidth: 0, flex: 1 }}>
                          <span className="vault-item-num" aria-hidden="true">
                            {n}
                          </span>
                          <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              alignItems: 'center',
                              gap: '0.45rem 0.55rem',
                            }}
                          >
                            <strong style={{ marginRight: '0.15rem' }}>{item.title}</strong>
                            {isPerson && (callUrl || waUrl) ? (
                              <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                {callUrl ? (
                                  <a
                                    href={callUrl}
                                    className="btn btn-ghost"
                                    style={{
                                      padding: '0.28rem 0.7rem',
                                      fontSize: '0.78rem',
                                      fontWeight: 700,
                                    }}
                                  >
                                    Call
                                  </a>
                                ) : null}
                                {waUrl ? (
                                  <a
                                    href={waUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn"
                                    style={{
                                      padding: '0.28rem 0.7rem',
                                      fontSize: '0.78rem',
                                      fontWeight: 700,
                                      background: '#128C7E',
                                      color: '#fff',
                                      border: 'none',
                                    }}
                                  >
                                    WhatsApp
                                  </a>
                                ) : null}
                              </span>
                            ) : isPerson && !item.accountRef ? (
                              <span className="small muted">Add phone to call / WhatsApp</span>
                            ) : null}
                          </div>
                          <div className="small muted">
                            {item.category === 'care' || item.category === 'contacts'
                              ? [
                                  item.institution,
                                  item.accountRef ? `Phone ${item.accountRef}` : null,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')
                              : item.category === 'insurance'
                                ? [
                                    item.institution,
                                    item.accountRef ? `Policy ${item.accountRef}` : null,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')
                                : [item.institution, item.accountRef].filter(Boolean).join(' · ')}
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
                        </div>
                        {estate.myRole !== 'viewer' && estate.status !== 'unlocked' && (
                          <button type="button" className="btn btn-danger" style={{ padding: '0.3rem 0.7rem' }} onClick={() => deleteItem(item.id)}>
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                    );
                  })
                )}
              </div>
              ));
            })()}
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
                Add to vault
              </p>
              {addFields.blurb ? (
                <p className="small muted" style={{ marginTop: '-0.35rem', marginBottom: '0.85rem', lineHeight: 1.45 }}>
                  {addFields.blurb}
                </p>
              ) : null}
              <div className="field">
                <label>What kind?</label>
                <select
                  value={itemForm.category}
                  onChange={(e) => {
                    const next = e.target.value;
                    setItemForm({
                      ...itemForm,
                      category: next,
                      institution:
                        next === 'care'
                          ? itemForm.institution &&
                            careRoles.some((r) => r.label === itemForm.institution)
                            ? itemForm.institution
                            : 'Attendant / ayah'
                          : '',
                      accountRef: '',
                      shift: '',
                      paidBy: '',
                      backupContact: '',
                      expiresOn: '',
                    });
                  }}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{addFields.title}</label>
                <input
                  required
                  value={itemForm.title}
                  onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })}
                  placeholder={addFields.titlePh}
                />
              </div>
              <div className="field">
                <label>{addFields.institution}</label>
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
                    placeholder={addFields.institutionPh}
                  />
                )}
              </div>
              {addFields.accountRef ? (
              <div className="field">
                <label>{addFields.accountRef}</label>
                <input
                  value={itemForm.accountRef}
                  onChange={(e) => setItemForm({ ...itemForm, accountRef: e.target.value })}
                  placeholder={addFields.accountRefPh}
                />
              </div>
              ) : null}
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
                  placeholder={addFields.notesPh}
                />
              </div>
              {addFields.showExpiry && (
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
                    shareEmergencyText({ subjectName: estate.subjectName, url: emergencyUrl, lang })
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
            <select
              name="countryPack"
              defaultValue={estate.countryPack || estate.country || 'IN'}
              onChange={(e) => {
                const v = e.target.value;
                const diaspora =
      (user?.plan === 'diaspora' || user?.plan === 'diaspora_care') && user?.planActive !== false;
                if ((v === 'IN_US' || v === 'IN_UK') && !diaspora) {
                  e.target.value = estate.countryPack || estate.country || 'IN';
                  openUpgrade('diaspora');
                }
              }}
            >
              {(countryPacks || [
                { id: 'IN', label: 'India' },
                { id: 'IN_US', label: 'India + US' },
                { id: 'IN_UK', label: 'India + UK' },
              ]).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                  {p.needsDiaspora ? ' — Diaspora plan' : ''}
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

      {tab === 'findcare' && (
        <CarePanel estateId={id} onSaved={() => load().then(() => setTab('map'))} />
      )}

      {tab === 'counsel' && <CounselPanel estateId={id} onToast={toast} />}

      {tab === 'family' && (
        <div>
          {searchParams.get('welcome') === '1' && (
            <div
              className="card"
              style={{
                padding: '1rem 1.15rem',
                marginBottom: '1rem',
                borderColor: 'rgba(47, 107, 82, 0.4)',
                background: 'rgba(220, 232, 225, 0.5)',
              }}
            >
              <strong>You’re in — keep the loop going</strong>
              <p className="small muted" style={{ margin: '0.35rem 0 0' }}>
                Forward the same family WhatsApp link to another sibling. One link, many joins.
              </p>
            </div>
          )}
          <FamilyThread estateId={id} estateName={estate.subjectName} />
          <div className="split">
            <div className="card">
              <div style={{ padding: '1rem 1.1rem' }}>
                <strong>{t('peopleWithAccess')}</strong>
                <p className="small muted" style={{ margin: '0.35rem 0 0' }}>
                  {t('peopleAccessBlurb')}
                </p>
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
            <SiblingInviteCard
              estateId={id}
              subjectName={estate.subjectName}
              inviterName={user?.name}
              canInvite={estate.myRole === 'owner' || estate.myRole === 'manager'}
              onInvited={() => load().catch(() => {})}
            />
          </div>
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
