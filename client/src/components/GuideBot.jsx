import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { track } from '../analytics.js';
import { shareInviteText, whatsappShareUrl } from '../whatsapp.js';
import {
  CARE_CHIPS,
  COUNSEL_CHIPS,
  FAMILY_CHIPS,
  L,
  SLOT_PROMPTS,
  disclaimer,
  legalRefuse,
  looksLikeLegalAdvice,
  welcome,
} from '../guideBot/copy.js';

const SEEN_KEY = 'hr_guide_opened_v1';

function msg(role, text, chips) {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, role, text, chips };
}

function estateIdFromPath(pathname) {
  const m = pathname.match(/\/app\/estates\/([^/?#]+)/);
  return m?.[1] || null;
}

export default function GuideBot() {
  const { user, api, toast } = useAuth();
  const { lang, isHi } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState(null);
  const [estateCtx, setEstateCtx] = useState(null);
  const bottomRef = useRef(null);

  const accountType = user?.accountType || 'family';
  const pathEstateId = estateIdFromPath(location.pathname);
  const chips = useMemo(() => {
    if (accountType === 'lawyer') return COUNSEL_CHIPS(lang);
    if (accountType === 'care') return CARE_CHIPS(lang);
    return FAMILY_CHIPS(lang);
  }, [accountType, lang]);

  useEffect(() => {
    if (!user) return;
    if (!location.pathname.startsWith('/app')) return;
    try {
      if (!localStorage.getItem(SEEN_KEY)) {
        localStorage.setItem(SEEN_KEY, '1');
        setOpen(true);
      }
    } catch {
      /* ignore */
    }
  }, [user?.id, location.pathname]);

  useEffect(() => {
    if (!open || messages.length) return;
    pushBot(welcome(lang, user?.name, accountType), chips);
    track('guide_bot_open', { accountType });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, open, busy]);

  useEffect(() => {
    if (!open || !pathEstateId || accountType !== 'family') return;
    let cancelled = false;
    api(`/api/estates/${pathEstateId}`)
      .then((res) => {
        if (cancelled) return;
        setEstateCtx({
          id: pathEstateId,
          name: res.estate?.subjectName,
          health: res.estate?.health,
          housewarming: res.housewarming,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, pathEstateId, accountType, api]);

  function pushBot(text, nextChips) {
    setMessages((m) => [...m, msg('bot', text, nextChips)]);
  }

  function pushUser(text) {
    setMessages((m) => [...m, msg('user', text)]);
  }

  async function ensureEstateId() {
    if (pathEstateId) return pathEstateId;
    if (estateCtx?.id) return estateCtx.id;
    const list = await api('/api/estates');
    const first = (list.estates || [])[0];
    if (first?.id) {
      setEstateCtx((c) => ({ ...(c || {}), id: first.id, name: first.subjectName }));
      return first.id;
    }
    return null;
  }

  async function refreshHealth(estateId) {
    try {
      const res = await api(`/api/estates/${estateId}`);
      setEstateCtx({
        id: estateId,
        name: res.estate?.subjectName,
        health: res.estate?.health,
        housewarming: res.housewarming,
      });
      return res.estate?.health;
    } catch {
      return null;
    }
  }

  function startSlots(action, slotKeys, seed = {}) {
    const slots = { ...seed };
    const next = slotKeys.find((k) => !slots[k]);
    setPending({ action, slotKeys, slots });
    if (next) pushBot(SLOT_PROMPTS[next]?.(lang) || next);
  }

  async function dispatch(id, typed) {
    if (looksLikeLegalAdvice(typed || id)) {
      pushBot(legalRefuse(lang), chips);
      return;
    }

    track('guide_bot_action', { action: id, accountType });

    if (id === 'where_am_i') {
      await adviseNext();
      return;
    }
    if (id === 'create_parent') {
      startSlots('create_parent', ['subjectName', 'subjectRelation']);
      return;
    }
    if (id === 'add_bank') {
      const eid = await ensureEstateId();
      if (!eid) {
        pushBot(
          L(
            lang,
            'Create a parent file first — tap that chip.',
            'पहले माता-पिता की फ़ाइल बनाएँ — वह विकल्प चुनें।'
          ),
          chips
        );
        return;
      }
      startSlots('add_bank', ['bankTitle', 'bankInstitution', 'bankRef'], { estateId: eid });
      return;
    }
    if (id === 'add_care') {
      const eid = await ensureEstateId();
      if (!eid) {
        pushBot(L(lang, 'Create a parent file first.', 'पहले माता-पिता की फ़ाइल बनाएँ।'), chips);
        return;
      }
      startSlots('add_care', ['careTitle', 'careRole', 'carePhone'], { estateId: eid });
      return;
    }
    if (id === 'solo_qr') {
      await doSoloQr();
      return;
    }
    if (id === 'invite') {
      await doInvite();
      return;
    }
    if (id === 'care_profile' || id === 'care_city') {
      startSlots('care_profile', ['careCity', 'carePhoneSelf']);
      return;
    }
    if (id === 'care_invite') {
      pushBot(
        L(
          lang,
          'Families unlock city care when density is ready. Finish your profile with city + phone, stay accepting work, and share your referral link from Care desk.',
          'शहर घनत्व तैयार होने पर परिवार देखभाल खोलेंगे। शहर + फ़ोन वाली प्रोफ़ाइल पूरा करें, काम स्वीकार रखें, और Care डेस्क से रेफ़रल लिंक बाँटें।'
        ),
        chips
      );
      navigate('/app/care');
      return;
    }
    if (id === 'counsel_profile' || id === 'counsel_cities') {
      startSlots('counsel_profile', ['counselCities', 'counselBar']);
      return;
    }
    if (id === 'counsel_leads') {
      pushBot(
        L(
          lang,
          'Complete profile → take Counsel Pro → approach families in your cities who opted in. Vault stays locked until they accept. Soft WhatsApp intros only — no cold spam.',
          'प्रोफ़ाइल पूरा करें → Counsel Pro लें → अपने शहरों के परिवारों तक पहुँचें जिन्होंने ऑप्ट-इन किया। वे स्वीकार करें तब तक वॉल्ट लॉक। नरम WhatsApp — स्पैम नहीं।'
        ),
        chips
      );
      navigate('/app/counsel');
      return;
    }

    const t = String(typed || '').toLowerCase();
    if (/bank|बैंक|sbi|hdfc|lic/.test(t)) return dispatch('add_bank');
    if (/maid|nurse|नौकर|नर्स|care phone|आया/.test(t)) return dispatch('add_care');
    if (/invite|sibling|भाई|बहन|whatsapp/.test(t)) return dispatch('invite');
    if (/qr|fridge|फ्रिज|solo|अकेल/.test(t)) return dispatch('solo_qr');
    if (/create|parent|माता|पिता|फ़ाइल|file/.test(t) && accountType === 'family') {
      return dispatch('create_parent');
    }

    pushBot(
      L(
        lang,
        'Pick a chip below — I can fill the form for you step by step.',
        'नीचे विकल्प चुनें — मैं फ़ॉर्म कदम-दर-कदम भर दूँगा।'
      ),
      chips
    );
  }

  async function runAction(id, typed) {
    setBusy(true);
    try {
      await dispatch(id, typed);
    } catch (err) {
      pushBot(err.message || L(lang, 'Something failed.', 'कुछ गलत हो गया।'), chips);
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function adviseNext() {
    if (accountType === 'care') {
      pushBot(
        L(
          lang,
          'Next: finish city + phone on Care desk, mark accepting work, share referral when families ask.',
          'आगे: Care डेस्क पर शहर + फ़ोन, काम स्वीकार, परिवार पूछें तो रेफ़रल बाँटें।'
        ),
        chips
      );
      return;
    }
    if (accountType === 'lawyer') {
      pushBot(
        L(
          lang,
          'Next: cities + bar ID on Counsel desk, then Counsel Pro for leads. No free-form legal Q&A here.',
          'आगे: Counsel डेस्क पर शहर + बार आईडी, फिर लीड के लिए Counsel Pro। यहाँ खुली कानूनी Q&A नहीं।'
        ),
        chips
      );
      return;
    }

    const eid = await ensureEstateId();
    if (!eid) {
      pushBot(
        L(
          lang,
          'You have no parent file yet — create one, then Solo fridge QR, then invite a sibling.',
          'अभी कोई फ़ाइल नहीं — बनाएँ, फिर Solo फ्रिज QR, फिर भाई-बहन बुलाएँ।'
        ),
        chips
      );
      return;
    }
    const health = estateCtx?.health || (await refreshHealth(eid));
    const next = health?.next;
    if (next?.id === 'qr') {
      pushBot(L(lang, 'Next: Solo — fridge QR (one tap).', 'आगे: Solo — फ्रिज QR (एक टैप)।'), chips);
      return;
    }
    if (next?.id === 'bank') {
      pushBot(L(lang, 'Next: add at least one bank.', 'आगे: कम से कम एक बैंक जोड़ें।'), chips);
      return;
    }
    if (next?.id === 'care') {
      pushBot(
        L(lang, 'Next: add maid/nurse with a phone.', 'आगे: नौकरानी/नर्स का फ़ोन जोड़ें।'),
        chips
      );
      return;
    }
    if (next?.id === 'unlocker') {
      pushBot(
        L(lang, 'Next: invite a sibling as manager.', 'आगे: भाई-बहन को मैनेजर बुलाएँ।'),
        chips
      );
      return;
    }
    pushBot(
      L(
        lang,
        `Life Map looks solid (${health?.scoreLabel || 'ready'}). Invite another sibling or upgrade when you need more than one parent.`,
        `Life Map अच्छा है (${health?.scoreLabel || 'तैयार'})। और भाई-बहन बुलाएँ या दूसरा अभिभावक चाहिए तो अपग्रेड करें।`
      ),
      chips
    );
  }

  async function commitPending(value) {
    if (!pending) return;
    const text = String(value || '').trim();
    if (!text) return;
    if (looksLikeLegalAdvice(text)) {
      pushBot(legalRefuse(lang), chips);
      setPending(null);
      return;
    }

    pushUser(text);
    const slots = { ...pending.slots };
    const nextKey = pending.slotKeys.find((k) => !slots[k]);
    if (!nextKey) return;
    slots[nextKey] = text;
    const remaining = pending.slotKeys.filter((k) => !slots[k]);

    if (remaining.length) {
      setPending({ ...pending, slots });
      pushBot(SLOT_PROMPTS[remaining[0]]?.(lang) || remaining[0]);
      return;
    }

    setPending(null);
    setBusy(true);
    try {
      if (pending.action === 'create_parent') await finishCreateParent(slots);
      else if (pending.action === 'add_bank') await finishAddBank(slots);
      else if (pending.action === 'add_care') await finishAddCare(slots);
      else if (pending.action === 'care_profile') await finishCareProfile(slots);
      else if (pending.action === 'counsel_profile') await finishCounselProfile(slots);
    } catch (err) {
      pushBot(err.message, chips);
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function finishCreateParent(slots) {
    const res = await api('/api/estates', {
      method: 'POST',
      body: {
        subjectName: slots.subjectName,
        subjectRelation: slots.subjectRelation || 'Parent',
        countryPack: 'IN',
        notes: '',
      },
    });
    const estateId = res.estate?.id || res.id;
    track('estate_created', { estateId, via: 'guide_bot' });
    track('guide_bot_action', { action: 'create_parent_done', accountType });
    setEstateCtx({ id: estateId, name: slots.subjectName });
    pushBot(
      L(
        lang,
        `Created ${slots.subjectName}. Opening housewarming — tap Solo for fridge QR, or I’ll add a bank next.`,
        `${slots.subjectName} बन गया। हाउसवार्मिंग खोल रहा हूँ — Solo से फ्रिज QR, या आगे बैंक जोड़ें।`
      ),
      chips
    );
    if (estateId) navigate(`/app/estates/${estateId}?tab=housewarming`);
  }

  async function finishAddBank(slots) {
    const estateId = slots.estateId || (await ensureEstateId());
    const fd = new FormData();
    fd.append('category', 'bank');
    fd.append('title', slots.bankTitle);
    fd.append('institution', slots.bankInstitution || slots.bankTitle);
    fd.append('accountRef', slots.bankRef || '');
    fd.append('notes', L(lang, 'Added via HeirReady guide', 'HeirReady गाइड से जोड़ा'));
    await api(`/api/estates/${estateId}/items`, { method: 'POST', body: fd });
    await refreshHealth(estateId);
    pushBot(
      L(
        lang,
        `Bank “${slots.bankTitle}” saved on the Life Map. Want maid/nurse phone next, or invite a sibling?`,
        `बैंक “${slots.bankTitle}” Life Map पर सेव। आगे नौकरानी/नर्स फ़ोन, या भाई-बहन बुलाएँ?`
      ),
      chips
    );
    navigate(`/app/estates/${estateId}?tab=map`);
  }

  async function finishAddCare(slots) {
    const estateId = slots.estateId || (await ensureEstateId());
    const role = String(slots.careRole || 'maid').toLowerCase();
    const fd = new FormData();
    fd.append('category', 'care');
    fd.append('title', slots.careTitle);
    fd.append('institution', role);
    fd.append('accountRef', slots.carePhone);
    fd.append('notes', L(lang, 'Added via HeirReady guide', 'HeirReady गाइड से जोड़ा'));
    await api(`/api/estates/${estateId}/items`, { method: 'POST', body: fd });
    await refreshHealth(estateId);
    pushBot(
      L(
        lang,
        `Saved ${slots.careTitle} (${role}) with phone. Invite a sibling so you’re not the only unlocker?`,
        `${slots.careTitle} (${role}) फ़ोन के साथ सेव। भाई-बहन बुलाएँ ताकि अकेले अनलॉकर न हों?`
      ),
      chips
    );
    navigate(`/app/estates/${estateId}?tab=map`);
  }

  async function finishCareProfile(slots) {
    await api('/api/care/me', {
      method: 'PATCH',
      body: {
        cities: slots.careCity,
        phone: slots.carePhoneSelf,
        acceptingWork: true,
      },
    });
    pushBot(
      L(
        lang,
        `Profile updated for ${slots.careCity}. Keep accepting work on — families open city browse when density is ready.`,
        `${slots.careCity} के लिए प्रोफ़ाइल अपडेट। काम स्वीकार रखें — घनत्व पर परिवार ब्राउज़ खोलेंगे।`
      ),
      chips
    );
    navigate('/app/care');
  }

  async function finishCounselProfile(slots) {
    await api('/api/lawyers/me', {
      method: 'PATCH',
      body: {
        cities: slots.counselCities,
        barId: slots.counselBar,
        acceptingMatters: true,
      },
    });
    pushBot(
      L(
        lang,
        'Counsel profile saved. Open Counsel desk for Pro leads — I won’t invent legal strategy.',
        'वकील प्रोफ़ाइल सेव। Pro लीड के लिए Counsel डेस्क खोलें — मैं कानूनी रणनीति नहीं बनाऊँगा।'
      ),
      chips
    );
    navigate('/app/counsel');
  }

  async function doSoloQr() {
    const estateId = await ensureEstateId();
    if (!estateId) {
      pushBot(L(lang, 'Create a parent file first.', 'पहले फ़ाइल बनाएँ।'), chips);
      return;
    }
    const res = await api(`/api/estates/${estateId}/housewarming`, {
      method: 'POST',
      body: { stepId: 'qr', soloFastTrack: true, completeAll: true },
    });
    track('housewarming_solo_or_finish', { estateId, solo: true, via: 'guide_bot' });
    await refreshHealth(estateId);
    pushBot(
      L(
        lang,
        'Housewarming done — fridge QR + family invite are ready on the Housewarming tab. Invite a sibling next.',
        'हाउसवार्मिंग पूरा — फ्रिज QR + परिवार आमंत्रण Housewarming टैब पर। आगे भाई-बहन बुलाएँ।'
      ),
      chips
    );
    navigate(`/app/estates/${estateId}?tab=housewarming`);
    if (res.health) {
      setEstateCtx((c) => ({ ...(c || {}), id: estateId, health: res.health }));
    }
  }

  async function doInvite() {
    const estateId = await ensureEstateId();
    if (!estateId) {
      pushBot(L(lang, 'Create a parent file first.', 'पहले फ़ाइल बनाएँ।'), chips);
      return;
    }
    const res = await api(`/api/estates/${estateId}/family-link?role=manager`);
    const link = res.invite?.link;
    if (!link) throw new Error(L(lang, 'Could not create invite link', 'आमंत्रण लिंक नहीं बना'));
    const wa = whatsappShareUrl(
      shareInviteText({
        estateName: estateCtx?.name || L(lang, 'our parent map', 'हमारा अभिभावक नक्शा'),
        link,
        inviterName: user?.name,
        lang,
      })
    );
    pushBot(
      L(
        lang,
        'Family link ready. Open WhatsApp and forward the same link to every sibling.',
        'परिवार लिंक तैयार। वही लिंक हर भाई-बहन को WhatsApp पर भेजें।'
      ),
      [
        { id: '__wa__', label: L(lang, 'Open WhatsApp invite', 'WhatsApp आमंत्रण खोलें'), href: wa },
        ...chips,
      ]
    );
    navigate(`/app/estates/${estateId}?tab=housewarming`);
  }

  async function onSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    if (pending) {
      await commitPending(text);
      return;
    }
    pushUser(text);
    await runAction('__text__', text);
  }

  async function onChip(chip) {
    if (busy) return;
    if (chip.href) {
      window.open(chip.href, '_blank', 'noopener,noreferrer');
      return;
    }
    if (chip.id === '__wa__') return;
    setPending(null);
    pushUser(chip.label);
    await runAction(chip.id);
  }

  if (!user || !location.pathname.startsWith('/app')) return null;

  return (
    <>
      <button
        type="button"
        className={`guide-bot-fab${open ? ' guide-bot-fab-open' : ''}`}
        aria-expanded={open}
        aria-label={isHi ? 'HeirReady गाइड' : 'HeirReady guide'}
        onClick={() => {
          setOpen((o) => !o);
          if (!open) track('guide_bot_open', { accountType, source: 'fab' });
        }}
      >
        {open ? '×' : isHi ? 'गाइड' : 'Guide'}
      </button>

      {open && (
        <div className="guide-bot-panel" role="dialog" aria-label="HeirReady guide">
          <header className="guide-bot-head">
            <div>
              <strong>{isHi ? 'आपका गाइड' : 'Your guide'}</strong>
              <p className="small muted" style={{ margin: 0 }}>
                {disclaimer(lang)}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '0.35rem 0.7rem' }}
              onClick={() => setOpen(false)}
            >
              {isHi ? 'बंद' : 'Close'}
            </button>
          </header>

          <div className="guide-bot-msgs">
            {messages.map((m) => (
              <div key={m.id} className={`guide-bot-bubble guide-bot-${m.role}`}>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{m.text}</p>
                {m.role === 'bot' && m.chips?.length > 0 && (
                  <div className="guide-bot-chips">
                    {m.chips.map((c) => (
                      <button
                        key={c.id + c.label}
                        type="button"
                        className="guide-bot-chip"
                        disabled={busy}
                        onClick={() => onChip(c)}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <p className="small muted" style={{ margin: '0.35rem 0' }}>
                {isHi ? 'कर रहा हूँ…' : 'Working…'}
              </p>
            )}
            <div ref={bottomRef} />
          </div>

          <form className="guide-bot-compose" onSubmit={onSubmit}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                pending
                  ? L(lang, 'Type your answer…', 'उत्तर लिखें…')
                  : L(lang, 'Ask or answer…', 'पूछें या उत्तर दें…')
              }
              disabled={busy}
              aria-label="Guide message"
            />
            <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()}>
              {isHi ? 'भेजें' : 'Send'}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
