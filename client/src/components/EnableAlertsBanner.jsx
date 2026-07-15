import { useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import {
  enableWebPush,
  ensurePushSubscribed,
  pushSupported,
  notificationPermission,
  softPushDismissedThisSession,
  dismissSoftPushThisSession,
  deniedHelpDismissedThisSession,
  dismissDeniedHelpThisSession,
  consumeSoftPushReason,
} from '../push.js';

/**
 * Soft alerts prompt — never auto-calls the browser permission dialog.
 * Soft UI appears on high-intent events (not on every page load).
 * Native Allow/Block only runs when the user taps Enable.
 */
export default function EnableAlertsBanner() {
  const { user, api, toast } = useAuth();
  const [mode, setMode] = useState(null); // 'soft' | 'denied' | null
  const [reason, setReason] = useState('general');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || !pushSupported()) return undefined;

    const perm = notificationPermission();
    if (perm === 'granted') {
      ensurePushSubscribed(api).catch(() => {});
      return undefined;
    }
    if (perm === 'denied' && !deniedHelpDismissedThisSession()) {
      setMode('denied');
    }

    function onSoft(e) {
      if (notificationPermission() !== 'default') return;
      if (softPushDismissedThisSession()) return;
      setReason(e?.detail?.reason || consumeSoftPushReason() || 'general');
      setMode('soft');
    }
    window.addEventListener('heirready:soft-push', onSoft);
    return () => window.removeEventListener('heirready:soft-push', onSoft);
  }, [user?.id, api]);

  if (!mode || !user) return null;

  async function enable() {
    setBusy(true);
    try {
      const res = await enableWebPush(api);
      if (res.ok) {
        toast('Alerts on — you’ll get a badge when family updates');
        setMode(null);
      } else if (res.reason === 'denied') {
        toast('Blocked — allow HeirReady in browser settings');
        setMode('denied');
      } else {
        toast('Alerts not available on this device yet');
      }
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  function dismissSoft() {
    dismissSoftPushThisSession();
    setMode(null);
  }

  function dismissDenied() {
    dismissDeniedHelpThisSession();
    setMode(null);
  }

  const softCopy =
    reason === 'unread'
      ? 'You have family alerts waiting. Turn on lock-screen alerts so you don’t miss the next one.'
      : reason === 'invite'
        ? 'Sibling invites land better with lock-screen alerts — know when they join or add to the vault.'
        : reason === 'housewarming'
          ? 'Housewarming done. Enable alerts so sibling notes and unlock requests ping you.'
          : 'Turn on alerts so sibling notes and unlock requests show as 1 · 2 · 3 on the app icon.';

  if (mode === 'denied') {
    return (
      <div className="alerts-banner">
        <div>
          <strong>Alerts are blocked</strong>
          <p className="small muted" style={{ margin: '0.2rem 0 0' }}>
            The browser won’t ask again. Allow notifications for heirready.com in site settings, then
            reload and use Alerts → Enable.
          </p>
        </div>
        <div className="alerts-banner-actions">
          <button type="button" className="btn btn-ghost" onClick={dismissDenied}>
            Got it
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="alerts-banner">
      <div>
        <strong>Get lock-screen alerts</strong>
        <p className="small muted" style={{ margin: '0.2rem 0 0' }}>
          {softCopy}
        </p>
      </div>
      <div className="alerts-banner-actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={enable}>
          Enable alerts
        </button>
        <button type="button" className="btn btn-ghost" onClick={dismissSoft}>
          Not now
        </button>
      </div>
    </div>
  );
}
