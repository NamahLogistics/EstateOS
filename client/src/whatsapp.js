export function whatsappShareUrl(text) {
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
}

export function shareInviteText({ estateName, link, inviterName }) {
  return `${inviterName || 'Family'} invited you to HeirReady for ${estateName}.\n\nJoin here:\n${link}\n\n(Not legal advice — family continuity vault)`;
}

export function shareEmergencyText({ subjectName, url }) {
  return `Emergency card for ${subjectName} (HeirReady).\n\nScan / open for unlockers + first steps:\n${url}\n\nDoes not show bank passwords.`;
}

export function shareReferralText({ link, inviterName, accountType }) {
  if (accountType === 'lawyer') {
    return (
      `Hi — I’m ${inviterName || 'an advocate'} on HeirReady Counsel desk (city leads + matter briefs).\n\n` +
      `Join as counsel here:\n${link}`
    );
  }
  if (accountType === 'care') {
    return (
      `Hi — I’m ${inviterName || 'listed'} on HeirReady. Families abroad look for nurses / maids here.\n\n` +
      `Join free and set your city:\n${link}`
    );
  }
  return (
    `Hi — I’m using HeirReady to map our parents’ life admin (banks, LIC, who has the keys).\n\n` +
    `Join free with my link:\n${link}`
  );
}

/** Soft outbound to NRI / adult children — city-focused */
export function shareFamilyOnboardText({ link, city, inviterName }) {
  const place = city?.trim() || 'India';
  const who = inviterName?.trim() || 'I';
  return (
    `Hi — ${who} here.\n\n` +
    `I’m setting up HeirReady for our parents in ${place} — banks, LIC, property papers, who has the keys, and caregivers in one place.\n\n` +
    `Join free (takes a couple of minutes):\n${link}\n\n` +
    `Would love if you can add what you know too.`
  );
}

/** Soft outbound to nurses / maids / agencies — free join */
export function shareCareOnboardText({ link, city, inviterName }) {
  const place = city?.trim() || 'your city';
  const who = inviterName?.trim() || 'I';
  return (
    `Hi — ${who} here.\n\n` +
    `Families with parents in ${place} use HeirReady to find nurses, maids, and attendants.\n\n` +
    `You can list free — just city, phone, and your rate:\n${link}\n\n` +
    `No fee to join. Families on Care plans can find you.`
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
