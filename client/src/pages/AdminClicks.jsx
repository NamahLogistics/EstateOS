import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function AdminClicks() {
  const { user, api, toast } = useAuth();
  const [campaign, setCampaign] = useState('');
  const [channel, setChannel] = useState('all');
  const [data, setData] = useState({
    links: [],
    events: [],
    waiting: [],
    abandoned: [],
    converted: [],
    signedUpSameEmail: [],
  });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (campaign.trim()) params.set('campaign', campaign.trim());
      if (channel && channel !== 'all') params.set('channel', channel);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await api(`/api/admin/clicks${qs}`);
      setData({
        links: res.links || [],
        events: res.events || [],
        waiting: res.waiting || [],
        abandoned: res.abandoned || [],
        converted: res.converted || [],
        signedUpSameEmail: res.signedUpSameEmail || [],
      });
    } catch (err) {
      toast(err.message || 'Could not load clicks');
    } finally {
      setBusy(false);
    }
  }, [api, campaign, channel, toast]);

  useEffect(() => {
    if (user?.isAdmin) load().catch(() => {});
  }, [user?.isAdmin, channel]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const waiting = data.waiting?.length
    ? data.waiting
    : (data.links || []).filter((l) => !(l.clickCount > 0));
  const abandoned = data.abandoned || [];
  const converted = data.converted || [];
  const signedUpSameEmail = data.signedUpSameEmail || [];

  return (
    <section style={{ padding: '1.5rem 0 3rem', maxWidth: 800 }}>
      <p
        className="small muted"
        style={{ margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}
      >
        Admin
      </p>
      <h1 className="display" style={{ fontSize: '2rem', margin: '0.35rem 0 0.5rem' }}>
        Link clicks
      </h1>
      <p className="muted" style={{ marginTop: 0, maxWidth: 560 }}>
        Tracked <code>/r/…</code> links from outreach email and WhatsApp shares — who clicked, who
        bounced, who signed up. WhatsApp rows show who shared; we still don’t know if they sent the
        message.{' '}
        <Link to="/app/admin/activity">Activity</Link>
      </p>

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', margin: '0 0 1rem' }}>
        {[
          { id: 'all', label: 'All' },
          { id: 'email', label: 'Email' },
          { id: 'whatsapp', label: 'WhatsApp' },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            className={channel === f.id ? 'btn btn-primary' : 'btn btn-ghost'}
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.9rem' }}
            onClick={() => setChannel(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '1rem 0 1.25rem' }}>
        <input
          className="input"
          style={{ flex: '1 1 14rem', minWidth: 0 }}
          placeholder="Filter campaign (e.g. abhiraj_lifemap)"
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

      <div
        className="card"
        style={{
          padding: '1rem 1.15rem',
          marginBottom: '1rem',
          borderColor: 'rgba(180, 83, 9, 0.45)',
          background: 'rgba(254, 243, 199, 0.35)',
        }}
      >
        <strong>
          {channel === 'whatsapp' ? 'Clicked link, no signup' : 'Clicked, no signup'} ({abandoned.length})
        </strong>
        <p className="small muted" style={{ margin: '0.35rem 0 0' }}>
          {channel === 'whatsapp'
            ? 'Someone opened a link from a WhatsApp share but has not registered yet.'
            : 'Opened the mail link and still have no HeirReady account on that address (and no attributed signup with another email).'}
        </p>
        {abandoned.length === 0 ? (
          <p className="small muted" style={{ margin: '0.5rem 0 0' }}>
            None right now.
          </p>
        ) : (
          <ul style={{ margin: '0.65rem 0 0', paddingLeft: '1.1rem', lineHeight: 1.55 }}>
            {abandoned.map((l) => (
              <li key={l.code}>
                {l.channel === 'whatsapp' ? (
                  <>
                    <strong>{l.sharedByName || l.sharedByEmail || '—'}</strong>
                    <span className="small muted"> shared · {l.kind || l.campaign}</span>
                  </>
                ) : (
                  <strong>{l.email || '—'}</strong>
                )}
                {l.lastClickAt ? ` · last click ${new Date(l.lastClickAt).toLocaleString()}` : ''}
                <br />
                <span className="small muted">
                  {l.campaign} · {l.clickCount} click{l.clickCount === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card" style={{ padding: '1rem 1.15rem', marginBottom: '1rem' }}>
        <strong>Converted after click ({converted.length})</strong>
        <p className="small muted" style={{ margin: '0.35rem 0 0' }}>
          Signed up after the tracked link (includes different signup email when attributed via{' '}
          <code>hr_ec</code>).
        </p>
        {converted.length === 0 ? (
          <p className="small muted" style={{ margin: '0.5rem 0 0' }}>
            No attributed conversions yet.
          </p>
        ) : (
          <ul style={{ margin: '0.65rem 0 0', paddingLeft: '1.1rem', lineHeight: 1.55 }}>
            {converted.map((l) => (
              <li key={l.code}>
                <strong>{l.convertedEmail || l.email || '—'}</strong>
                {l.email && l.convertedEmail && l.email !== l.convertedEmail ? (
                  <span className="small muted"> (mailed {l.email})</span>
                ) : null}
                {l.convertedAt ? ` · ${new Date(l.convertedAt).toLocaleString()}` : ''}
                <br />
                <span className="small muted">{l.campaign}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {signedUpSameEmail.length > 0 && (
        <div className="card" style={{ padding: '1rem 1.15rem', marginBottom: '1rem' }}>
          <strong>Same email already registered ({signedUpSameEmail.length})</strong>
          <p className="small muted" style={{ margin: '0.35rem 0 0' }}>
            Clicked as a known account — not “abandoned”. (Attribution stamp may be missing if they
            clicked before this feature.)
          </p>
          <ul style={{ margin: '0.65rem 0 0', paddingLeft: '1.1rem', lineHeight: 1.55 }}>
            {signedUpSameEmail.map((l) => (
              <li key={l.code}>
                <strong>{l.email}</strong>
                {l.userName ? ` · ${l.userName}` : ''}
                <br />
                <span className="small muted">{l.campaign}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card" style={{ padding: '1rem 1.15rem', marginBottom: '1rem' }}>
        <strong>All clicked ({clicked.length})</strong>
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
                {l.convertedAt ? ' · converted' : ''}
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
