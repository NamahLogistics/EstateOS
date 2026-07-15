/** Capture email-click attribution from /r/:code redirects (hr_ec query or cookie). */
export const EMAIL_CLICK_KEY = 'heirready_email_click';

function readCookie(name) {
  try {
    const raw = document.cookie || '';
    for (const part of raw.split(';')) {
      const [k, ...rest] = part.trim().split('=');
      if (k === name) return decodeURIComponent(rest.join('=') || '');
    }
  } catch {
    /* ignore */
  }
  return '';
}

/** Call once on boot and whenever landing with ?hr_ec= */
export function captureEmailClickAttribution() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = (params.get('hr_ec') || '').trim();
    const fromCookie = (readCookie('hr_ec') || '').trim();
    const code = fromUrl || fromCookie || '';
    if (code) {
      localStorage.setItem(EMAIL_CLICK_KEY, code);
    }
  } catch {
    /* ignore */
  }
}

export function getEmailClickCode() {
  try {
    return (localStorage.getItem(EMAIL_CLICK_KEY) || '').trim() || null;
  } catch {
    return null;
  }
}

export function clearEmailClickCode() {
  try {
    localStorage.removeItem(EMAIL_CLICK_KEY);
  } catch {
    /* ignore */
  }
}
