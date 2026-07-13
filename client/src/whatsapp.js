export function whatsappShareUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function shareInviteText({ estateName, link, inviterName }) {
  return `${inviterName || 'Family'} invited you to HeirReady for ${estateName}.\n\nJoin here:\n${link}\n\n(Not legal advice — family continuity vault)`;
}

export function shareEmergencyText({ subjectName, url }) {
  return `Emergency card for ${subjectName} (HeirReady).\n\nScan / open for unlockers + first steps:\n${url}\n\nDoes not show bank passwords.`;
}

export function shareReferralText({ link, inviterName, accountType }) {
  if (accountType === 'lawyer') {
    return `${inviterName || 'I'} use HeirReady Counsel desk for succession matters.\n\nJoin with my link as counsel — when you take Counsel Pro (city leads), I get 50% off my next year:\n${link}`;
  }
  if (accountType === 'care') {
    return `${inviterName || 'I'} list care work on HeirReady — families abroad looking for nurses/maids.\n\nJoin free with my link and set your city:\n${link}`;
  }
  return `${inviterName || 'I'} use HeirReady to map our parents’ life admin.\n\nSign up with my link — when you take a paid plan, I get 50% off my next year:\n${link}`;
}

/** Soft outbound to NRI / adult children — city-focused */
export function shareFamilyOnboardText({ link, city, inviterName }) {
  const place = city?.trim() || 'their city';
  return `${inviterName || 'I'}’m setting up HeirReady for parents in ${place} — banks, LIC, who has the keys, caregivers.\n\nTakes ~20 min on a call. Join here (free to start):\n${link}\n\nWhen you take Family / Care later, I get 50% off my next year.`;
}

/** Soft outbound to nurses / maids / agencies */
export function shareCareOnboardText({ link, city, inviterName }) {
  const place = city?.trim() || 'your city';
  return `Hi — families with parents in ${place} use HeirReady and look for nurses / maids / attendants.\n\n${inviterName || 'I'} invited you to list free (city + phone + rate). Families on Care plans can find you:\n${link}\n\nNo fee to join.`;
}

export function buildInviteUrl({ origin, ref, type, city }) {
  const base = String(origin || '').replace(/\/$/, '');
  const params = new URLSearchParams({ mode: 'register' });
  if (ref) params.set('ref', String(ref).toUpperCase());
  if (type && type !== 'family') params.set('type', type);
  if (city?.trim()) params.set('city', city.trim());
  return `${base}/auth?${params.toString()}`;
}
