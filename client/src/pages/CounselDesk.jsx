import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function CounselDesk() {
  const { api, toast, user } = useAuth();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await api('/api/counsel/desk');
    setData(res);
  }

  useEffect(() => {
    load().catch((e) => toast(e.message));
  }, []);

  async function accept(id) {
    setBusy(true);
    try {
      await api(`/api/counsel/engagements/${id}/accept`, {
        method: 'POST',
        body: { conflictCleared: true },
      });
      toast('Matter accepted — counsel brief generated');
      await load();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function decline(id) {
    const reason = prompt('Decline reason') || 'Unavailable';
    setBusy(true);
    try {
      await api(`/api/counsel/engagements/${id}/decline`, {
        method: 'POST',
        body: { reason },
      });
      toast('Declined');
      await load();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <p className="muted">Loading counsel desk…</p>;

  const { lawyer, engagements, stats } = data;

  return (
    <section style={{ paddingBottom: '2.5rem' }}>
      <p className="small muted" style={{ letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>
        Counsel desk
      </p>
      <h1 className="display" style={{ fontSize: '2.3rem', margin: '0.2rem 0 0.4rem' }}>
        {lawyer?.name || user.name}
      </h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {lawyer?.firm} · intake {lawyer?.retainerBand} · SLA {lawyer?.slaHours}h
      </p>

      <div className="panel-grid" style={{ margin: '1.25rem 0' }}>
        {[
          ['Incoming', stats.requested],
          ['Active matters', stats.active],
          ['Closed', stats.closed],
        ].map(([label, n]) => (
          <div key={label} className="card" style={{ padding: '1rem 1.15rem' }}>
            <div className="small muted">{label}</div>
            <div className="display" style={{ fontSize: '2rem' }}>
              {n}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ padding: '1rem 1.1rem' }}>
          <strong>Matters</strong>
        </div>
        {engagements.length === 0 ? (
          <div className="item-row muted">No engagements yet. Families will request you from an estate’s Counsel tab.</div>
        ) : (
          engagements.map((e) => (
            <div key={e.id} className="item-row">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <strong>{e.estateName}</strong>
                  <div className="small muted">
                    {e.status} · {e.urgency} · {(e.scopes || []).join(', ')}
                  </div>
                  <div className="small muted">
                    Family: {e.familyLead?.name} · Estate {e.estateStatus}
                  </div>
                  {e.familyBrief && <p className="small" style={{ margin: '0.4rem 0 0' }}>{e.familyBrief}</p>}
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'start' }}>
                  {e.status === 'requested' && (
                    <>
                      <button className="btn btn-primary" style={{ padding: '0.4rem 0.85rem' }} disabled={busy} onClick={() => accept(e.id)}>
                        Accept + generate brief
                      </button>
                      <button className="btn btn-ghost" style={{ padding: '0.4rem 0.85rem' }} disabled={busy} onClick={() => decline(e.id)}>
                        Decline
                      </button>
                    </>
                  )}
                  {['engaged', 'active'].includes(e.status) && (
                    <Link className="btn btn-primary" style={{ padding: '0.4rem 0.85rem' }} to={`/app/estates/${e.estateId}?tab=counsel`}>
                      Open matter
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
