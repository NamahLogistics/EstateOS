import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function CounselDesk() {
  const { api, toast, user } = useAuth();
  const [data, setData] = useState(null);
  const [leads, setLeads] = useState(null);
  const [leadsError, setLeadsError] = useState(null);
  const [cityFilter, setCityFilter] = useState('');
  const [pitch, setPitch] = useState({});
  const [busy, setBusy] = useState(false);

  async function loadDesk() {
    const res = await api('/api/counsel/desk');
    setData(res);
    return res;
  }

  async function loadLeads(city = cityFilter) {
    setLeadsError(null);
    try {
      const q = city ? `?city=${encodeURIComponent(city)}` : '';
      const res = await api(`/api/counsel/leads${q}`);
      setLeads(res);
    } catch (err) {
      if (err.status === 402 || /upgrade|payment|counsel pro/i.test(err.message || '')) {
        setLeadsError({ needsPayment: true, message: err.message });
        setLeads(null);
      } else {
        setLeadsError({ message: err.message });
        setLeads(null);
      }
    }
  }

  useEffect(() => {
    loadDesk()
      .then((desk) => {
        if (desk.leadsUnlocked) return loadLeads();
        setLeadsError({
          needsPayment: true,
          message: 'Upgrade to Counsel Pro to see families looking for counsel in your cities',
        });
      })
      .catch((e) => toast(e.message));
  }, []);

  async function accept(id) {
    setBusy(true);
    try {
      await api(`/api/counsel/engagements/${id}/accept`, {
        method: 'POST',
        body: { conflictCleared: true },
      });
      toast('Matter accepted — counsel brief generated');
      await loadDesk();
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
      await loadDesk();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function approach(listingId) {
    setBusy(true);
    try {
      await api(`/api/counsel/leads/${listingId}/approach`, {
        method: 'POST',
        body: {
          conflictCleared: true,
          message: pitch[listingId] || '',
        },
      });
      toast('Approach sent — waiting for family to accept');
      await Promise.all([loadDesk(), loadLeads()]);
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <p className="muted">Loading counsel desk…</p>;

  const { lawyer, engagements, stats, leadsUnlocked, plan } = data;

  return (
    <section style={{ paddingBottom: '2.5rem' }}>
      <p className="small muted" style={{ letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>
        Counsel desk
      </p>
      <h1 className="display" style={{ fontSize: '2.3rem', margin: '0.2rem 0 0.4rem' }}>
        {lawyer?.name || user.name}
      </h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {lawyer?.firm} · intake {lawyer?.retainerBand} · SLA {lawyer?.slaHours}h · plan {plan || 'free'}
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

      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ padding: '1rem 1.1rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <strong>City leads</strong>
            <p className="small muted" style={{ margin: '0.25rem 0 0' }}>
              Families who opted in to be found. Vault contents stay private until they retain you.
            </p>
          </div>
          {leadsUnlocked && (
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <input
                placeholder="Filter city"
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                style={{ borderRadius: 10, border: '1px solid var(--line)', padding: '0.45rem 0.65rem' }}
              />
              <button type="button" className="btn btn-ghost" style={{ padding: '0.4rem 0.75rem' }} onClick={() => loadLeads(cityFilter)}>
                Filter
              </button>
            </div>
          )}
        </div>

        {leadsError?.needsPayment ? (
          <div className="item-row" style={{ display: 'grid', gap: '0.75rem' }}>
            <p style={{ margin: 0 }}>
              Lead board unlocks after payment. Counsel Pro is ₹1,499/yr — see families in your cities and approach them.
            </p>
            <p className="small muted" style={{ margin: 0 }}>
              {leadsError.message}
            </p>
            <Link className="btn btn-primary" to="/pricing" style={{ width: 'fit-content' }}>
              Upgrade to Counsel Pro
            </Link>
          </div>
        ) : leadsError ? (
          <div className="item-row muted">{leadsError.message}</div>
        ) : !leads ? (
          <div className="item-row muted">Loading leads…</div>
        ) : leads.leads?.length === 0 ? (
          <div className="item-row muted">
            No open family listings in {cityFilter || (leads.lawyerCities || []).join(' / ') || 'your cities'} yet.
          </div>
        ) : (
          leads.leads.map((lead) => (
            <div key={lead.id} className="item-row">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <strong>
                    {lead.subjectName} · {lead.city}
                  </strong>
                  <div className="small muted">
                    {lead.urgency} · {(lead.scopes || []).join(', ')} · estate {lead.estateStatus}
                  </div>
                  <p className="small" style={{ margin: '0.4rem 0 0' }}>
                    {lead.blurb}
                  </p>
                  {lead.alreadyApproached && (
                    <p className="small muted" style={{ margin: '0.35rem 0 0' }}>
                      Already engaged ({lead.engagementStatus})
                    </p>
                  )}
                  {!lead.alreadyApproached && (
                    <textarea
                      rows={2}
                      placeholder="Short pitch to the family…"
                      value={pitch[lead.id] || ''}
                      onChange={(e) => setPitch({ ...pitch, [lead.id]: e.target.value })}
                      style={{
                        width: '100%',
                        marginTop: '0.5rem',
                        borderRadius: 10,
                        border: '1px solid var(--line)',
                        padding: '0.5rem 0.65rem',
                      }}
                    />
                  )}
                </div>
                <div>
                  {!lead.alreadyApproached && (
                    <button
                      className="btn btn-primary"
                      style={{ padding: '0.4rem 0.85rem' }}
                      disabled={busy}
                      onClick={() => approach(lead.id)}
                    >
                      Approach family
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <div style={{ padding: '1rem 1.1rem' }}>
          <strong>Matters</strong>
        </div>
        {engagements.length === 0 ? (
          <div className="item-row muted">
            No engagements yet. Families request you from Counsel, or you approach open city leads after upgrading.
          </div>
        ) : (
          engagements.map((e) => (
            <div key={e.id} className="item-row">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <strong>{e.estateName}</strong>
                  <div className="small muted">
                    {e.status} · {e.urgency} · {(e.scopes || []).join(', ')}
                    {e.initiatedBy === 'lawyer' ? ' · you approached' : ''}
                  </div>
                  <div className="small muted">
                    Family: {e.familyLead?.name} · Estate {e.estateStatus}
                  </div>
                  {e.familyBrief && (
                    <p className="small" style={{ margin: '0.4rem 0 0' }}>
                      {e.familyBrief}
                    </p>
                  )}
                  {e.lawyerPitch && (
                    <p className="small muted" style={{ margin: '0.25rem 0 0' }}>
                      Your pitch: {e.lawyerPitch}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'start' }}>
                  {e.status === 'requested' && (
                    <>
                      <button
                        className="btn btn-primary"
                        style={{ padding: '0.4rem 0.85rem' }}
                        disabled={busy}
                        onClick={() => accept(e.id)}
                      >
                        Accept + generate brief
                      </button>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '0.4rem 0.85rem' }}
                        disabled={busy}
                        onClick={() => decline(e.id)}
                      >
                        Decline
                      </button>
                    </>
                  )}
                  {e.status === 'approached' && (
                    <span className="badge badge-pending">Awaiting family</span>
                  )}
                  {['engaged', 'active'].includes(e.status) && (
                    <Link
                      className="btn btn-primary"
                      style={{ padding: '0.4rem 0.85rem' }}
                      to={`/app/estates/${e.estateId}?tab=counsel`}
                    >
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
