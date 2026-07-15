import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import {
  enableWebPush,
  ensurePushSubscribed,
  pushSupported,
  syncAppBadge,
  notificationPermission,
  isPushEnabledLocally,
  requestSoftPushPrompt,
} from '../push.js';

export default function NotificationBell() {
  const { user, api, toast, token } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [busy, setBusy] = useState(false);
  const [perm, setPerm] = useState(() => notificationPermission());
  const panelRef = useRef(null);

  const load = useCallback(async () => {
    if (!token || !user) return;
    try {
      const res = await api('/api/notifications');
      setItems(res.notifications || []);
      setUnread(res.unread || 0);
      syncAppBadge(res.unread || 0);
      setPerm(notificationPermission());
      if (notificationPermission() === 'granted') {
        ensurePushSubscribed(api).catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }, [api, token, user]);

  useEffect(() => {
    load().catch(() => {});
    const t = window.setInterval(() => load().catch(() => {}), 45_000);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    function onDoc(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!user) return null;

  async function markAllRead() {
    try {
      const res = await api('/api/notifications/read', { method: 'POST', body: {} });
      setUnread(res.unread || 0);
      setItems((list) => list.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
      syncAppBadge(res.unread || 0);
    } catch (err) {
      toast(err.message);
    }
  }

  async function openItem(n) {
    try {
      if (!n.readAt) {
        await api('/api/notifications/read', { method: 'POST', body: { ids: [n.id] } });
        setUnread((u) => Math.max(0, u - 1));
        setItems((list) =>
          list.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x))
        );
        syncAppBadge(Math.max(0, unread - 1));
      }
    } catch {
      /* ignore */
    }
    setOpen(false);
    navigate(n.url || '/app');
  }

  async function turnOnPush() {
    setBusy(true);
    try {
      const res = await enableWebPush(api);
      setPerm(notificationPermission());
      if (res.ok) toast('Alerts on — you’ll get a badge when family updates');
      else if (res.reason === 'denied') {
        toast('Blocked — allow notifications in browser / site settings');
      } else toast('Could not enable alerts on this device');
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  function openPanel() {
    const next = !open;
    setOpen(next);
    if (next) {
      load()
        .then((/* unread refreshed in state async */) => {})
        .catch(() => {});
      // High-intent: opening Alerts with unread → soft banner (native dialog only on Enable)
      if (notificationPermission() === 'default' && unread > 0) {
        requestSoftPushPrompt('unread');
      }
    }
  }

  const showEnable =
    pushSupported() && perm === 'default' && !isPushEnabledLocally();
  const showDeniedHint = pushSupported() && perm === 'denied';

  return (
    <div className="notif-bell-wrap" ref={panelRef}>
      <button
        type="button"
        className="nav-link nav-link-btn notif-bell-btn"
        aria-label={unread ? `${unread} unread notifications` : 'Notifications'}
        aria-expanded={open}
        onClick={openPanel}
      >
        <span className="notif-bell-icon" aria-hidden />
        <span className="notif-bell-label">Alerts</span>
        {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-panel-head">
            <strong>Notifications</strong>
            {unread > 0 && (
              <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.5rem' }} onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>
          {showEnable && (
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', marginBottom: '0.65rem', padding: '0.45rem 0.75rem' }}
              disabled={busy}
              onClick={turnOnPush}
            >
              Turn on lock-screen alerts
            </button>
          )}
          {showDeniedHint && (
            <p className="small muted" style={{ margin: '0 0 0.65rem', lineHeight: 1.45 }}>
              Alerts are blocked in this browser. Allow HeirReady in site settings, then reload.
            </p>
          )}
          <div className="notif-list">
            {items.length === 0 ? (
              <p className="small muted" style={{ margin: '0.5rem 0' }}>
                Nothing yet — family notes, sibling joins, and reviews show up here.
              </p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`notif-item${n.readAt ? '' : ' unread'}`}
                  onClick={() => openItem(n)}
                >
                  <strong>{n.title}</strong>
                  <span className="small muted">{n.body}</span>
                  <span className="small muted">{new Date(n.createdAt).toLocaleString()}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
