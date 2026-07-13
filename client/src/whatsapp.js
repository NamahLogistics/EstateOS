export function whatsappShareUrl(text) {
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
}

/** First name only — reads better in WhatsApp */
function firstName(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  return n.split(/\s+/)[0];
}

export function shareInviteText({ estateName, link, inviterName, lang = 'en' }) {
  const who = firstName(inviterName);
  if (lang === 'hi') {
    return (
      `${who || 'परिवार'} ने आपको HeirReady पर ${estateName} के लिए बुलाया है।\n\n` +
      `यह भाई-बहन / परिवार के लिए है — माँ-पापा के बैंक, एलआईसी, चाबियों की साझा तिजोरी (माता-पिता को ऐप पर नहीं बुलाते)।\n\n` +
      `यहाँ जुड़ें:\n${link}\n\n(कानूनी सलाह नहीं)`
    );
  }
  const whoEn = who || 'A sibling';
  return (
    `${whoEn} invited you to HeirReady for ${estateName}.\n\n` +
    `This is for siblings / family — shared vault for Mum/Dad’s banks, LIC, keys (not for inviting parents to the app).\n\n` +
    `Join here:\n${link}\n\n(Not legal advice)`
  );
}

/** After housewarming — ask sibling to add what they know */
export function shareHousewarmingDoneText({ estateName, link, inviterName, lang = 'en' }) {
  const who = firstName(inviterName);
  if (lang === 'hi') {
    return (
      `${who ? `नमस्ते — मैं ${who} हूँ।\n\n` : 'नमस्ते।\n\n'}` +
      `मैंने ${estateName} के लिए HeirReady पर घर का सेटअप कर लिया है (बैंक / देखभाल / कागज़)।\n\n` +
      `जुड़ो और जो तुम्हें पता हो जोड़ दो:\n${link}`
    );
  }
  return (
    `Hi${who ? ` — ${who} here` : ''}.\n\n` +
    `I’ve finished the HeirReady housewarming setup for ${estateName} (banks / care / papers).\n\n` +
    `Join and add what you know:\n${link}`
  );
}

export function shareEmergencyText({ subjectName, url, lang = 'en' }) {
  if (lang === 'hi') {
    return (
      `${subjectName} का आपातकालीन कार्ड (HeirReady)।\n\n` +
      `खोलने वाले और पहले कदम:\n${url}\n\n` +
      `बैंक पासवर्ड नहीं दिखते।`
    );
  }
  return `Emergency card for ${subjectName} (HeirReady).\n\nScan / open for unlockers + first steps:\n${url}\n\nDoes not show bank passwords.`;
}

export function shareReferralText({ link, inviterName, accountType, lang = 'en' }) {
  const who = firstName(inviterName);
  if (lang === 'hi') {
    const hiOpen = who ? `नमस्ते — मैं ${who} हूँ।\n\n` : 'नमस्ते।\n\n';
    if (accountType === 'lawyer') {
      return (
        hiOpen +
        `मैं HeirReady वकील डेस्क पर हूँ (शहर लीड + उत्तराधिकार मामले)।\n\n` +
        `वकील के रूप में जुड़ें (शुरुआत मुफ़्त):\n${link}`
      );
    }
    if (accountType === 'care') {
      return (
        hiOpen +
        `विदेश में रहने वाले परिवार HeirReady से नर्स / आया ढूँढते हैं।\n\n` +
        `मुफ़्त में अपना नाम लिखें:\n${link}`
      );
    }
    return (
      hiOpen +
      `मैं HeirReady इस्तेमाल कर रहा/रही हूँ ताकि भाई-बहन माता-पिता के कागज़ (बैंक, एलआईसी, चाबियाँ) साथ संभाल सकें।\n\n` +
      `मुफ़्त जुड़ें — माता-पिता का खाता ज़रूरी नहीं:\n${link}`
    );
  }
  if (accountType === 'lawyer') {
    return (
      `Hi —${who ? ` ${who} here.` : ''}\n\n` +
      `I’m on HeirReady Counsel desk (city leads + matter briefs for succession).\n\n` +
      `Join as counsel (free to start):\n${link}`
    );
  }
  if (accountType === 'care') {
    return (
      `Hi —${who ? ` ${who} here.` : ''}\n\n` +
      `Families abroad use HeirReady to find nurses / maids.\n\n` +
      `List yourself free:\n${link}`
    );
  }
  return (
    `Hi —${who ? ` ${who} here.` : ''}\n\n` +
    `I’m using HeirReady so siblings can share our parents’ life admin (banks, LIC, keys).\n\n` +
    `Join free — parents don’t need an account:\n${link}`
  );
}

/** Soft outbound to siblings / adult children — not inviting parents to the app */
export function shareFamilyOnboardText({ link, city, inviterName, lang = 'en' }) {
  const place = city?.trim();
  const who = firstName(inviterName);
  if (lang === 'hi') {
    const where = place ? ` (${place})` : '';
    const hiOpen = who ? `नमस्ते — मैं ${who} हूँ।\n\n` : 'नमस्ते।\n\n';
    return (
      hiOpen +
      `मैं HeirReady सेट कर रहा/रही हूँ ताकि हम भाई-बहन माँ-पापा के कागज़${where} साथ रख सकें — बैंक, एलआईसी, संपत्ति, चाबियाँ, देखभाल वाले।\n\n` +
      `माता-पिता का खाता नहीं चाहिए — हम उनके लिए मैप करते हैं।\n\n` +
      `मुफ़्त जुड़ें (२ मिनट) और जो जानते हो जोड़ें:\n${link}`
    );
  }
  const where = place ? ` in ${place}` : '';
  return (
    `Hi${who ? ` — ${who} here` : ''}.\n\n` +
    `I’m setting up HeirReady so we siblings can share Mum/Dad’s life admin${where} — banks, LIC, property, keys, caregivers.\n\n` +
    `Parents don’t need an account — we map it for them.\n\n` +
    `Join free (2 mins) and add what you know:\n${link}`
  );
}

/** Soft outbound to nurses / maids / agencies */
export function shareCareOnboardText({ link, city, inviterName, lang = 'en' }) {
  const place = city?.trim();
  const who = firstName(inviterName);
  if (lang === 'hi') {
    const where = place ? ` ${place} में` : '';
    const hiOpen = who ? `नमस्ते — मैं ${who} हूँ।\n\n` : 'नमस्ते।\n\n';
    return (
      hiOpen +
      `जिनके माता-पिता${where} हैं, वे परिवार HeirReady से नर्स, आया और अटेंडेंट ढूँढते हैं।\n\n` +
      `मुफ़्त लिखें — शहर, फ़ोन, रेट:\n${link}\n\n` +
      `जुड़ने का कोई शुल्क नहीं।`
    );
  }
  const where = place ? ` in ${place}` : '';
  return (
    `Hi${who ? ` — ${who} here` : ''}.\n\n` +
    `Families with parents${where} use HeirReady to find nurses, maids, and attendants.\n\n` +
    `List free — city, phone, rate:\n${link}\n\n` +
    `No fee to join.`
  );
}

export function shareFamilyNoteText({ estateName, authorName, body, link, lang = 'en' }) {
  const who = firstName(authorName);
  const preview = String(body || '').slice(0, 280);
  if (lang === 'hi') {
    return (
      `${who ? `${who}` : 'परिवार'} — ${estateName} पर नोट:\n\n` +
      `"${preview}"\n\n` +
      `HeirReady पर खोलें:\n${link}`
    );
  }
  return (
    `${who || 'Family'} posted on ${estateName}:\n\n` +
    `"${preview}"\n\n` +
    `Open on HeirReady:\n${link}`
  );
}

export function shareLightReviewText({ estateName, link, inviterName, lang = 'en' }) {
  const who = firstName(inviterName);
  if (lang === 'hi') {
    return (
      `${who ? `नमस्ते — मैं ${who} हूँ।\n\n` : 'नमस्ते।\n\n'}` +
      `${estateName} का हल्का चेक: वही आया/नर्स? वही एलआईसी/बैंक?\n\n` +
      `HeirReady पर अपडेट करें:\n${link}`
    );
  }
  return (
    `Hi${who ? ` — ${who} here` : ''}.\n\n` +
    `Quick check on ${estateName}: same maid/nurse phone? Same LIC/bank?\n\n` +
    `Update on HeirReady:\n${link}`
  );
}

export function buildInviteUrl({ origin, ref, type, city }) {
  const base = String(origin || '').replace(/\/$/, '');
  const params = new URLSearchParams({ mode: 'register' });
  if (ref) params.set('ref', String(ref).toUpperCase());
  if (type && type !== 'family') params.set('type', type);
  if (city?.trim()) params.set('city', city.trim());
  return `${base}/auth?${params.toString()}`;
}
