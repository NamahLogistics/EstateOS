export function whatsappShareUrl(text) {
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
}

/** First name only — reads better in WhatsApp */
function firstName(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  return n.split(/\s+/)[0];
}

export function shareInviteText({ estateName, link, inviterName }) {
  const who = firstName(inviterName) || 'A sibling';
  return (
    `${who} invited you to HeirReady for ${estateName}.\n\n` +
    `This is for siblings / family — shared vault for Mum/Dad’s banks, LIC, keys (not for inviting parents to the app).\n\n` +
    `Join here:\n${link}\n\n(Not legal advice)`
  );
}

export function shareEmergencyText({ subjectName, url }) {
  return `Emergency card for ${subjectName} (HeirReady).\n\nScan / open for unlockers + first steps:\n${url}\n\nDoes not show bank passwords.`;
}

export function shareReferralText({ link, inviterName, accountType }) {
  const who = firstName(inviterName);
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
export function shareFamilyOnboardText({ link, city, inviterName }) {
  const place = city?.trim();
  const who = firstName(inviterName);
  const where = place ? ` in ${place}` : '';
  return (
    `Hi${who ? ` — ${who} here` : ''}.\n\n` +
    `I’m setting up HeirReady so we siblings can share Mum/Dad’s life admin${where} — banks, LIC, property, keys, caregivers.\n\n` +
    `Parents don’t need an account — we map it for them.\n\n` +
    `Join free (2 mins) and add what you know:\n${link}`
  );
}

/** Soft outbound to nurses / maids / agencies */
export function shareCareOnboardText({ link, city, inviterName }) {
  const place = city?.trim();
  const who = firstName(inviterName);
  const where = place ? ` in ${place}` : '';
  return (
    `Hi${who ? ` — ${who} here` : ''}.\n\n` +
    `Families with parents${where} use HeirReady to find nurses, maids, and attendants.\n\n` +
    `List free — city, phone, rate:\n${link}\n\n` +
    `No fee to join.`
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
