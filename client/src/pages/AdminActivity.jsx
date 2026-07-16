import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const FILTERS = [
  { id: '', label: 'All' },
  { id: 'whatsapp_share', label: 'WhatsApp' },
  { id: 'signup', label: 'Signups' },
  { id: 'estate_created', label: 'Life Maps' },
  { id: 'invite_accepted', label: 'Joined vault' },
  { id: 'email_sent', label: 'Emails sent' },
  { id: 'email_click', label: 'Email clicks' },
  { id: 'email_signup', label: 'Email → signup' },
  { id: 'whatsapp_click', label: 'WA link clicks' },
  { id: 'whatsapp_signup', label: 'WA → signup' },
  { id: 'checkout', label: 'Checkout' },
  { id: 'copy_link', label: 'Copied links' },
];

function labelFor(e) {
  const kind = e.meta?.kind;
  switch (e.type) {
    case 'whatsapp_share':
      return `WhatsApp · ${kind || 'share'}`;
    case 'copy_link':
      return `Copied link · ${kind || 'link'}`;
    case 'signup':
      return `Signed up${e.meta?.accountType ? ` (${e.meta.accountType})` : ''}`;
    case 'estate_created':
      return `Created Life Map${e.meta?.estateName ? `: ${e.meta.estateName}` : ''}`;
    case 'invite_accepted':
      return `Joined vault${e.meta?.estateName ? `: ${e.meta.estateName}` : ''}`;
    case 'email_sent':
      return `Email sent${e.meta?.campaign ? ` · ${e.meta.campaign}` : ''}${
        e.meta?.subject ? `: ${e.meta.subject}` : ''
      }`;
    case 'email_click':
      return `Email click${e.meta?.campaign ? ` · ${e.meta.campaign}` : ''}`;
    case 'email_signup':
      return `Signed up from email${e.meta?.campaign ? ` · ${e.meta.campaign}` : ''}${
        e.meta?.differentEmail && e.meta?.mailedEmail ? ` (mailed ${e.meta.mailedEmail})` : ''
      }`;
    case 'whatsapp_click':
      return `WhatsApp link click${e.meta?.kind ? ` · ${e.meta.kind}` : ''}${
        e.meta?.campaign ? ` (${e.meta.campaign})` : ''
      }`;
    case 'whatsapp_signup':
      return `Signed up from WhatsApp${e.meta?.campaign ? ` · ${e.meta.campaign}` : ''}${
        e.meta?.sharedByName ? ` (shared by ${e.meta.sharedByName})` : ''
      }`;
    case 'checkout':
      return `Checkout · ${kind || e.meta?.plan || 'action'}`;
    default:
      return e.type;
  }
}

function detailLine(e) {
  const bits = [];
  if (e.meta?.city) bits.push(e.meta.city);
  if (e.meta?.estateId && !e.meta?.estateName) bits.push(`vault ${e.meta.estateId.slice(0, 8)}…`);
  if (e.meta?.destination) bits.push(e.meta.destination);
  if (e.meta?.plan) bits.push(e.meta.plan);
  if (e.meta?.referral) bits.push('via referral');
  if (e.path) bits.push(e.path);
  return bits.join(' · ');
}

export default function AdminActivity() {
  const { user, api, toast } = useAuth();
  const [type, setType] = useState('');
  const [events, setEvents] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const qs = type ? `?type=${encodeURIComponent(type)}` : '';
      const res = await api(`/api/admin/activity${qs}`);
      setEvents(res.events || []);
    } catch (err) {
      toast(err.message || 'Could not load activity');
    } finally {
      setBusy(false);
    }
  }, [api, type, toast]);

  useEffect(() => {
    if (user?.isAdmin) load().catch(() => {});
  }, [user?.isAdmin, type]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <section style={{ padding: '1.5rem 0 3rem', maxWidth: 800 }}>
      <p
        className="small muted"
        style={{ margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}
      >
        Admin
      </p>
      <h1 className="display" style={{ fontSize: '2rem', margin: '0.35rem 0 0.5rem' }}>
        Activity
      </h1>
      <p className="muted" style={{ marginTop: 0, maxWidth: 560 }}>
        Who shared on WhatsApp, signed up, created a Life Map, joined a vault, or clicked a tracked
        email. WhatsApp rows mean they <em>tapped</em> share — not that the message was sent.
      </p>
      <p className="small" style={{ margin: '0 0 1rem' }}>
        <Link to="/app/admin/clicks">Email clicks detail →</Link>
      </p>

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {FILTERS.map((f) => (
          <button
            key={f.id || 'all'}
            type="button"
            className={type === f.id ? 'btn btn-primary' : 'btn btn-ghost'}
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.9rem' }}
            onClick={() => setType(f.id)}
          >
            {f.label}
          </button>
        ))}
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={load}>
          {busy ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div className="card" style={{ padding: '1rem 1.15rem' }}>
        <strong>Recent ({events.length})</strong>
        {events.length === 0 ? (
          <p className="small muted" style={{ margin: '0.5rem 0 0' }}>
            No activity yet for this filter. Shares start logging after this deploy.
          </p>
        ) : (
          <ul style={{ margin: '0.65rem 0 0', paddingLeft: '1.1rem', lineHeight: 1.55 }}>
            {events.map((e) => (
              <li key={e.id} style={{ marginBottom: '0.55rem' }}>
                <strong>{e.name || e.email || '—'}</strong>
                {e.email && e.name ? (
                  <span className="small muted"> · {e.email}</span>
                ) : null}
                <br />
                {labelFor(e)}
                <br />
                <span className="small muted">
                  {e.at ? new Date(e.at).toLocaleString() : '—'}
                  {detailLine(e) ? ` · ${detailLine(e)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
