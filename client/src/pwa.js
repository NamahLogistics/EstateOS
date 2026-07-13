/** PWA install: capture beforeinstallprompt + show banner (Chrome/Edge/Android). iOS gets Add to Home Screen tip. */

let deferredPrompt = null;
const listeners = new Set();

function emit() {
  for (const fn of listeners) fn(deferredPrompt);
}

export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    emit();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    localStorage.setItem('estate_os_pwa_installed', '1');
    emit();
  });

  // Register SW on localhost too so Chrome can offer install during testing
  const allowSw = import.meta.env.PROD || window.location.hostname === 'localhost';
  if (!allowSw) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('SW registration failed', err);
    });
  });
}

export function subscribeInstallPrompt(fn) {
  listeners.add(fn);
  fn(deferredPrompt);
  return () => listeners.delete(fn);
}

export async function promptPwaInstall() {
  if (!deferredPrompt) return { ok: false, reason: 'unavailable' };
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  emit();
  return { ok: choice.outcome === 'accepted', reason: choice.outcome };
}

export function isStandaloneDisplay() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

export function isIosSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua);
  const chrome = /CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && webkit && !chrome;
}
