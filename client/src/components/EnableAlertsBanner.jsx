import { useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { isStandaloneDisplay } from '../pwa.js';
import { enableWebPush, pushSupported } from '../push.js';

const DISMISS_KEY = 'heirready_push_prompt_dismissed';

/** Ask installed / returning users to enable lock-screen alerts + badge */
export default function EnableAlertsBanner() {
  const { user, api, toast } = useAuth();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (!pushSupported()) return;
    if (localStorage.getItem('heirready_push_enabled') === '1') return;
    if (localStorage.getItem(DISMISS_KEY) === '1') return;
    const installed =
      isStandaloneDisplay() || localStorage.getItem('estate_os_pwa_installed') === '1';
    // Show for installed PWA immediately; otherwise after a short delay on /app
    const delay = installed ? 800 : 4000;
    const t = window.setTimeout(() => setShow(true), delay);
    return () => window.clearTimeout(t);
  }, [user]);

  if (!show || !user) return null;

  async function enable() {
    setBusy(true);
    try {
      const res = await enableWebPush(api);
      if (res.ok) {
        toast('Alerts on — icon badge when something needs you');
        setShow(false);
      } else if (res.reason === 'denied') {
        toast('Blocked — allow notifications in browser settings');
      } else {
        toast('Alerts not available on this device yet');
      }
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setShow(false);
  }

  return (
    <div className="alerts-banner">
      <div>
        <strong>Get the badge</strong>
        <p className="small muted" style={{ margin: '0.2rem 0 0' }}>
          Turn on alerts so sibling notes and unlock requests show as 1 · 2 · 3 on the app icon.
        </p>
      </div>
      <div className="alerts-banner-actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={enable}>
          Enable alerts
        </button>
        <button type="button" className="btn btn-ghost" onClick={dismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
