import crypto from 'crypto';

export const INTERVIEW_QUESTIONS = [
  {
    id: 'banks',
    category: 'bank',
    en: 'Which banks does the parent use? (one per line: Bank name — account hint)',
    hi: 'माता/पिता किन बैंकों का इस्तेमाल करते हैं? (हर लाइन: बैंक नाम — खाता संकेत)',
    placeholder: 'SBI — salary\nHDFC — savings',
  },
  {
    id: 'insurance',
    category: 'insurance',
    en: 'Any insurance policies? (LIC / health / term — policy no. if known)',
    hi: 'कोई बीमा पॉलिसी? (LIC / स्वास्थ्य / टर्म — पॉलिसी नंबर अगर पता हो)',
    placeholder: 'LIC Jeevan Anand — POL-123',
  },
  {
    id: 'investments',
    category: 'investments',
    en: 'Demat, PF, PPF, mutual funds?',
    hi: 'डीमैट, PF, PPF, म्यूचुअल फंड?',
    placeholder: 'Zerodha demat\nEPF',
  },
  {
    id: 'property',
    category: 'property',
    en: 'Property / flat / land — where are papers kept?',
    hi: 'जायदाद / फ्लैट / ज़मीन — कागज़ कहाँ रखे हैं?',
    placeholder: 'Andheri flat — steel cupboard',
  },
  {
    id: 'digital',
    category: 'digital',
    en: 'Primary phone number / SIM (for OTP during claims)?',
    hi: 'मुख्य फ़ोन / सिम (क्लेम के OTP के लिए)?',
    placeholder: '+91-98XXXXXX — Airtel',
  },
  {
    id: 'subscriptions',
    category: 'subscriptions',
    en: 'Recurring payments to cancel later? (Netflix, SIPs…)',
    hi: 'बाद में बंद करने वाले ऑटो-पेमेंट? (Netflix, SIP…)',
    placeholder: 'Netflix\nSpotify',
  },
  {
    id: 'contacts',
    category: 'contacts',
    en: 'CA / family lawyer / trusted relative contact?',
    hi: 'CA / पारिवारिक वकील / भरोसेमंद रिश्तेदार?',
    placeholder: 'Sharma CA — 98XXXX',
  },
  {
    id: 'wishes',
    category: 'wishes',
    en: 'Funeral / organ donation / special wishes?',
    hi: 'अंतिम संस्कार / अंगदान / विशेष इच्छाएँ?',
    placeholder: 'Simple cremation; inform village relatives',
  },
  {
    id: 'will',
    category: 'wishes',
    en: 'Is there a will? Where is it?',
    hi: 'वसीयत है? कहाँ रखी है?',
    placeholder: 'Will with family lawyer — envelope in cupboard',
  },
  {
    id: 'nominees',
    category: 'contacts',
    en: 'Known nominees on banks / LIC? (names)',
    hi: 'बैंक / LIC पर नॉमिनी? (नाम)',
    placeholder: 'Spouse on SBI; son on LIC',
  },
];

export function answersToItems(answers, estateId, userId) {
  const items = [];
  const now = new Date().toISOString();
  for (const q of INTERVIEW_QUESTIONS) {
    const raw = (answers[q.id] || '').trim();
    if (!raw) continue;
    const lines = raw.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const [titlePart, ...rest] = line.split(/[—\-–]/);
      const title = (titlePart || line).trim().slice(0, 120);
      const notes = rest.join('-').trim() || (q.id === 'will' ? line : '');
      items.push({
        id: crypto.randomUUID(),
        estateId,
        category: q.category,
        title: title || q.id,
        institution: '',
        accountRef: '',
        notes: notes || (lines.length === 1 && rest.length === 0 ? '' : notes),
        expiresOn: null,
        files: [],
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
        source: 'interview',
      });
    }
  }
  return items;
}
