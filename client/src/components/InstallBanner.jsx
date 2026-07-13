import { useEffect, useState } from 'react';
import {
  isIosSafari,
  isStandaloneDisplay,
  promptPwaInstall,
  subscribeInstallPrompt,
} from '../pwa.js';

const DISMISS_KEY = 'estate_os_pwa_dismiss';

export default function InstallBanner() {
  const [canInstall, setCanInstall] = useState(false);
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (isStandaloneDisplay() || localStorage.getItem('estate_os_pwa_installed') === '1') return;
    if (localStorage.getItem(DISMISS_KEY) === '1') return;

    setIos(isIosSafari());
    const unsub = subscribeInstallPrompt((evt) => {
      setCanInstall(Boolean(evt));
      if (evt) setVisible(true);
    });

    // iOS never fires beforeinstallprompt — show tip after a short delay
    const t = setTimeout(() => {
      if (isIosSafari() && !isStandaloneDisplay()) setVisible(true);
    }, 1800);

    return () => {
      unsub();
      clearTimeout(t);
    };
  }, []);

  if (!visible || isStandaloneDisplay()) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  }

  async function install() {
    const res = await promptPwaInstall();
    if (res.ok) setVisible(false);
    else if (res.reason === 'unavailable') {
      // Fall through to tip
      setIos(true);
    }
  }

  return (
    <div className="install-banner" role="dialog" aria-label="Install Estate OS">
      <div className="install-banner-copy">
        <strong>Install Estate OS</strong>
        <span className="small muted">
          {ios && !canInstall
            ? 'On iPhone: Share → Add to Home Screen — open like an app from abroad.'
            : 'Add to your phone home screen for one-tap access to your parents’ Life Map.'}
        </span>
      </div>
      <div className="install-banner-actions">
        {canInstall && (
          <button type="button" className="btn btn-primary" style={{ padding: '0.45rem 0.9rem' }} onClick={install}>
            Install
          </button>
        )}
        <button type="button" className="btn btn-ghost" style={{ padding: '0.45rem 0.9rem' }} onClick={dismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
