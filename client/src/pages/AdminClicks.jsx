import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function AdminClicks() {
  const { user, api, toast } = useAuth();
  const [campaign, setCampaign] = useState('');
  const [data, setData] = useState({ links: [], events: [] });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const qs = campaign.trim()
        ? `?campaign=${encodeURIComponent(campaign.trim())}`
        : '';
      const res = await api(`/api/admin/clicks${qs}`);
      setData({ links: res.links || [], events: res.events || [] });
    } catch (err) {
      toast(err.message || 'Could not load clicks');
    } finally {
      setBusy(false);
    }
  }, [api, campaign, toast]);

  useEffect(() => {
    if (user?.isAdmin) load().catch(() => {});
  }, [user?.isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return <Navigate to="/auth" replace />;
  if (!user.isAdmin) {
    return (
      <section style={{ padding: '1.5rem 0 3rem', maxWidth: 640 }}>
        <h1 className="display" style={{ fontSize: '1.8rem' }}>
          Admin
        </h1>
        <p className="muted">This page is only for app admins.</p>
        <Link className="btn btn-ghost" to="/app">
          Back to vaults
        </Link>
      </section>
    );
  }

  const clicked = (data.links || []).filter((l) => (l.clickCount || 0) > 0);
  const waiting = (data.links || []).filter((l) => !(l.clickCount > 0));

  return (
    <section style={{ padding: '1.5rem 0 3rem', maxWidth: 800 }}>
      <p
        className="small muted"
        style={{ margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}
      >
        Admin
      </p>
      <h1 className="display" style={{ fontSize: '2rem', margin: '0.35rem 0 0.5rem' }}>
        Email clicks
      </h1>
      <p className="muted" style={{ marginTop: 0, maxWidth: 560 }}>
        Exact who clicked tracked links (<code>/r/…</code>). Resend’s click subdomain only shows rates —
        this list is per person.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '1rem 0 1.25rem' }}>
        <input
          className="input"
          style={{ flex: '1 1 14rem', minWidth: 0 }}
          placeholder="Filter campaign (e.g. mishra_own_map)"
          value={campaign}
          onChange={(e) => setCampaign(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') load();
          }}
        />
        <button type="button" className="btn btn-primary" disabled={busy} onClick={load}>
          {busy ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div className="card" style={{ padding: '1rem 1.15rem', marginBottom: '1rem' }}>
        <strong>Clicked ({clicked.length})</strong>
        {clicked.length === 0 ? (
          <p className="small muted" style={{ margin: '0.5rem 0 0' }}>
            No clicks yet for this filter.
          </p>
        ) : (
          <ul style={{ margin: '0.65rem 0 0', paddingLeft: '1.1rem', lineHeight: 1.55 }}>
            {clicked.map((l) => (
              <li key={l.code}>
                <strong>{l.email || l.userId || '—'}</strong>
                {' · '}
                {l.clickCount} click{l.clickCount === 1 ? '' : 's'}
                {l.lastClickAt
                  ? ` · last ${new Date(l.lastClickAt).toLocaleString()}`
                  : ''}
                <br />
                <span className="small muted">
                  {l.campaign} → {l.destination}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card" style={{ padding: '1rem 1.15rem', marginBottom: '1rem' }}>
        <strong>Sent, no click yet ({waiting.length})</strong>
        {waiting.length === 0 ? (
          <p className="small muted" style={{ margin: '0.5rem 0 0' }}>
            No unclicked tracked links.
          </p>
        ) : (
          <ul style={{ margin: '0.65rem 0 0', paddingLeft: '1.1rem', lineHeight: 1.55 }}>
            {waiting.map((l) => (
              <li key={l.code}>
                {l.email || '—'}
                <span className="small muted"> · {l.campaign}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card" style={{ padding: '1rem 1.15rem' }}>
        <strong>Recent click events ({(data.events || []).length})</strong>
        {(data.events || []).length === 0 ? (
          <p className="small muted" style={{ margin: '0.5rem 0 0' }}>
            No events logged yet.
          </p>
        ) : (
          <ul style={{ margin: '0.65rem 0 0', paddingLeft: '1.1rem', lineHeight: 1.55 }}>
            {data.events.slice(0, 40).map((e) => (
              <li key={e.id}>
                <strong>{e.email || '—'}</strong>
                {' · '}
                {e.at ? new Date(e.at).toLocaleString() : '—'}
                <br />
                <span className="small muted">{e.campaign}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
