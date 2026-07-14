/** Bilingual scripts for the HeirReady personal guide (deterministic coach). */

export function L(lang, en, hi) {
  return lang === 'hi' ? hi : en;
}

export function roleLabel(lang, accountType) {
  if (accountType === 'lawyer') return L(lang, 'counsel', 'वकील');
  if (accountType === 'care') return L(lang, 'caregiver', 'देखभाल');
  return L(lang, 'family', 'परिवार');
}

export function welcome(lang, name, accountType) {
  const who = name?.split(' ')[0] || L(lang, 'there', 'आप');
  if (accountType === 'lawyer') {
    return L(
      lang,
      `Hi ${who} — I’m your HeirReady guide. I help counsel finish profile, find families when unlocked, and stay out of open legal advice. What should we do?`,
      `नमस्ते ${who} — मैं आपका HeirReady गाइड हूँ। प्रोफ़ाइल पूरा करें, परिवार तक पहुँचें (जब अनलॉक हो), और खुली कानूनी सलाह नहीं दूँगा। क्या करेंगे?`
    );
  }
  if (accountType === 'care') {
    return L(
      lang,
      `Hi ${who} — I’m your guide for the care desk. We can finish your city profile and invite families when they’re ready. What next?`,
      `नमस्ते ${who} — मैं देखभाल डेस्क का गाइड हूँ। शहर प्रोफ़ाइल पूरा करें और परिवारों को बुलाएँ जब वे तैयार हों। आगे क्या?`
    );
  }
  return L(
    lang,
    `Hi ${who} — I’m your HeirReady guide. I can create a parent file, add bank/care details, finish fridge QR solo, and help invite siblings. Not legal advice — house admin only.`,
    `नमस्ते ${who} — मैं आपका HeirReady गाइड हूँ। माता-पिता की फ़ाइल बना सकता हूँ, बैंक/देखभाल जोड़ सकता हूँ, फ्रिज QR अकेले पूरा कर सकता हूँ, भाई-बहन बुला सकता हूँ। कानूनी सलाह नहीं — घर का प्रशासन।`
  );
}

export function legalRefuse(lang) {
  return L(
    lang,
    'I can’t give wills, succession, or claim strategy — that’s for licensed counsel. Use the Counsel tab when you’re ready, or keep mapping banks and care phones here.',
    'वसीयत, उत्तराधिकार या दावा-रणनीति मैं नहीं बता सकता — उसके लिए लाइसेंस प्राप्त वकील। जब तैयार हों Counsel टैब देखें, या यहाँ बैंक और देखभाल फ़ोन मैप करते रहें।'
  );
}

export function disclaimer(lang) {
  return L(lang, 'Not legal advice. Product coach only.', 'कानूनी सलाह नहीं। केवल उत्पाद मार्गदर्शक।');
}

export const FAMILY_CHIPS = (lang) => [
  { id: 'create_parent', label: L(lang, 'Create parent file', 'माता-पिता की फ़ाइल') },
  { id: 'add_bank', label: L(lang, 'Add a bank', 'बैंक जोड़ें') },
  { id: 'add_care', label: L(lang, 'Add maid/nurse phone', 'नौकरानी/नर्स फ़ोन') },
  { id: 'solo_qr', label: L(lang, 'Solo — fridge QR', 'अकेले — फ्रिज QR') },
  { id: 'invite', label: L(lang, 'Invite sibling', 'भाई-बहन बुलाएँ') },
  { id: 'where_am_i', label: L(lang, 'What should I do next?', 'अब क्या करें?') },
];

export const CARE_CHIPS = (lang) => [
  { id: 'care_profile', label: L(lang, 'Finish my profile', 'प्रोफ़ाइल पूरा करें') },
  { id: 'care_city', label: L(lang, 'Set my city', 'शहर सेट करें') },
  { id: 'care_invite', label: L(lang, 'How families find me', 'परिवार कैसे ढूँढ़ेंगे') },
  { id: 'where_am_i', label: L(lang, 'What should I do next?', 'अब क्या करें?') },
];

export const COUNSEL_CHIPS = (lang) => [
  { id: 'counsel_profile', label: L(lang, 'Finish my profile', 'प्रोफ़ाइल पूरा करें') },
  { id: 'counsel_cities', label: L(lang, 'Set my cities', 'शहर सेट करें') },
  { id: 'counsel_leads', label: L(lang, 'How leads work', 'लीड कैसे काम करती हैं') },
  { id: 'where_am_i', label: L(lang, 'What should I do next?', 'अब क्या करें?') },
];

export const SLOT_PROMPTS = {
  subjectName: (lang) =>
    L(lang, 'Parent’s name? (e.g. Ramesh Kumar)', 'माता/पिता का नाम? (जैसे रमेश कुमार)'),
  subjectRelation: (lang) =>
    L(lang, 'Relation? (Father / Mother / Parent)', 'रिश्ता? (पिता / माता / अभिभावक)'),
  bankTitle: (lang) => L(lang, 'Bank account nickname? (e.g. SBI salary)', 'बैंक का नाम? (जैसे SBI सैलरी)'),
  bankInstitution: (lang) => L(lang, 'Bank name? (e.g. SBI, HDFC)', 'बैंक संस्था? (जैसे SBI, HDFC)'),
  bankRef: (lang) =>
    L(
      lang,
      'Last 4 digits or branch hint? (no full password)',
      'आखिरी 4 अंक या शाखा संकेत? (पासवर्ड नहीं)'
    ),
  careTitle: (lang) => L(lang, 'Caregiver’s name?', 'देखभाल करने वाले का नाम?'),
  careRole: (lang) =>
    L(lang, 'Role? (maid / nurse / attendant / cook / driver)', 'भूमिका? (नौकरानी / नर्स / आया / रसोइया / ड्राइवर)'),
  carePhone: (lang) => L(lang, 'Their phone number? (10+ digits)', 'उनका फ़ोन नंबर? (10+ अंक)'),
  careCity: (lang) => L(lang, 'City you work in? (e.g. Pune)', 'आप किस शहर में काम करते हैं? (जैसे पुणे)'),
  carePhoneSelf: (lang) => L(lang, 'Your WhatsApp / phone?', 'आपका WhatsApp / फ़ोन?'),
  counselCities: (lang) =>
    L(lang, 'Cities you practise in? (comma-separated)', 'आप किन शहरों में प्रैक्टिस करते हैं? (कॉमा से)'),
  counselBar: (lang) => L(lang, 'Bar council ID / enrolment no.?', 'बार काउंसिल आईडी / नामांकन संख्या?'),
};

export function looksLikeLegalAdvice(text) {
  const t = String(text || '').toLowerCase();
  return /will|वसीयत|succession|उत्तराधिकार|probate|наслед|inheritance law|claim strategy|हक्क|वसीयतनामा|legal advice|कानूनी सलाह|how do i claim|कैसे दावा/.test(
    t
  );
}
