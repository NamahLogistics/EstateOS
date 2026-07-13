export function whatsappShareUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function shareInviteText({ estateName, link, inviterName }) {
  return `${inviterName || 'Family'} invited you to Estate OS for ${estateName}.\n\nJoin here:\n${link}\n\n(Not legal advice — family continuity vault)`;
}

export function shareEmergencyText({ subjectName, url }) {
  return `Emergency card for ${subjectName} (Estate OS).\n\nScan / open for unlockers + first steps:\n${url}\n\nDoes not show bank passwords.`;
}

export function shareReferralText({ link, inviterName }) {
  return `${inviterName || 'I'} use Estate OS to map our parents’ life admin.\n\nSign up with my link — when you take a paid plan, I get 50% off my next year:\n${link}`;
}
