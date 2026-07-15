import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import ReferralCard from '../components/ReferralCard.jsx';

const DEFAULT_SPECIALTIES = [
  'succession',
  'property',
  'probate',
  'nri',
  'disputes',
  'insurance',
  'banking-claims',
  'family-settlement',
];

function profileFormFromLawyer(lawyer) {
  return {
    name: lawyer?.name || '',
    firm: lawyer?.firm || '',
    cities: (lawyer?.cities || []).join(', '),
    specialties: lawyer?.specialties || ['succession'],
    languages: (lawyer?.languages || []).join(', '),
    barId: lawyer?.barId || '',
    years: lawyer?.years ?? 1,
    retainerBand: lawyer?.retainerBand || '',
    slaHours: lawyer?.slaHours ?? 24,
    bio: lawyer?.bio || '',
    nriFriendly: lawyer?.nriFriendly !== false,
    acceptingMatters: lawyer?.acceptingMatters !== false,
  };
}

export default function CounselDesk() {
  const { api, toast, user } = useAuth();
  const [data, setData] = useState(null);
  const [leads, setLeads] = useState(null);
  const [leadsError, setLeadsError] = useState(null);
  const [cityFilter, setCityFilter] = useState('');
  const [pitch, setPitch] = useState({});
  const [feeNote, setFeeNote] = useState({});
  const [busy, setBusy] = useState(false);
  const [profileForm, setProfileForm] = useState(null);
  const [specialtyOptions, setSpecialtyOptions] = useState(DEFAULT_SPECIALTIES);

  async function loadDesk() {
    const res = await api('/api/counsel/desk');
    setData(res);
    if (res.specialtyOptions?.length) setSpecialtyOptions(res.specialtyOptions);
    setProfileForm(profileFormFromLawyer(res.lawyer));
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

  async function saveProfile(e) {
    e.preventDefault();
    if (!profileForm) return;
    setBusy(true);
    try {
      const res = await api('/api/lawyers/me', {
        method: 'PATCH',
        body: {
          ...profileForm,
          years: Number(profileForm.years),
          slaHours: Number(profileForm.slaHours),
        },
      });
      setData((d) => ({ ...d, lawyer: res.lawyer }));
      setProfileForm(profileFormFromLawyer(res.lawyer));
      toast('Profile saved — visible in family directory');
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function requestVerification() {
    setBusy(true);
    try {
      const res = await api('/api/lawyers/me/request-verification', { method: 'POST', body: {} });
      setData((d) => ({ ...d, lawyer: res.lawyer }));
      toast(res.message || 'Verification requested');
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

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
          feeNote: feeNote[listingId] || data?.lawyer?.retainerBand || '',
        },
      });
      toast('Approach sent — family notified by email');
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
        {lawyer?.verified ? (
          <span className="badge badge-unlocked" style={{ marginLeft: '0.65rem', verticalAlign: 'middle' }}>
            Verified
          </span>
        ) : (
          <span className="badge badge-pending" style={{ marginLeft: '0.65rem', verticalAlign: 'middle' }}>
            Unverified
          </span>
        )}
      </h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {lawyer?.firm} · {(lawyer?.cities || []).join(' / ') || 'Set cities'} · intake {lawyer?.retainerBand} ·
        SLA {lawyer?.slaHours}h · plan {plan || 'free'}
        {lawyer?.rating != null
          ? ` · ★ ${lawyer.rating}${lawyer.ratingCount ? ` (${lawyer.ratingCount})` : ''}`
          : ''}
        {lawyer?.mattersCompleted ? ` · ${lawyer.mattersCompleted} matters closed` : ''}
      </p>

      {profileForm && (
        <form className="card" style={{ padding: '1.15rem', margin: '1.25rem 0' }} onSubmit={saveProfile}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <strong>Your counsel profile</strong>
              <p className="small muted" style={{ margin: '0.25rem 0 0' }}>
                Families see this in the directory. Complete it before approaching leads.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {!lawyer?.verified && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: '0.4rem 0.75rem' }}
                  disabled={busy || !!lawyer?.verificationRequestedAt}
                  onClick={requestVerification}
                >
                  {lawyer?.verificationRequestedAt ? 'Verification pending' : 'Request verification'}
                </button>
              )}
              <button type="submit" className="btn btn-primary" style={{ padding: '0.4rem 0.85rem' }} disabled={busy}>
                Save profile
              </button>
            </div>
          </div>

          <div className="panel-grid" style={{ marginTop: '1rem' }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Display name</label>
              <input
                value={profileForm.name}
                onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                required
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Firm</label>
              <input
                value={profileForm.firm}
                onChange={(e) => setProfileForm({ ...profileForm, firm: e.target.value })}
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Cities (comma-separated)</label>
              <input
                value={profileForm.cities}
                onChange={(e) => setProfileForm({ ...profileForm, cities: e.target.value })}
                placeholder="Cities you practice in"
                required
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Bar / enrollment ID</label>
              <input
                value={profileForm.barId}
                onChange={(e) => setProfileForm({ ...profileForm, barId: e.target.value })}
                placeholder="e.g. MH/1234/2012"
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Years of practice</label>
              <input
                type="number"
                min={0}
                max={60}
                value={profileForm.years}
                onChange={(e) => setProfileForm({ ...profileForm, years: e.target.value })}
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Retainer band</label>
              <input
                value={profileForm.retainerBand}
                onChange={(e) => setProfileForm({ ...profileForm, retainerBand: e.target.value })}
                placeholder="₹25k–50k consult"
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Response SLA (hours)</label>
              <input
                type="number"
                min={1}
                max={168}
                value={profileForm.slaHours}
                onChange={(e) => setProfileForm({ ...profileForm, slaHours: e.target.value })}
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Languages</label>
              <input
                value={profileForm.languages}
                onChange={(e) => setProfileForm({ ...profileForm, languages: e.target.value })}
                placeholder="English, Hindi, Marathi"
              />
            </div>
          </div>

          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label>Specialties</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {specialtyOptions.map((s) => {
                const on = profileForm.specialties.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    className={`btn ${on ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem' }}
                    onClick={() =>
                      setProfileForm({
                        ...profileForm,
                        specialties: on
                          ? profileForm.specialties.filter((x) => x !== s)
                          : [...profileForm.specialties, s],
                      })
                    }
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="field">
            <label>Bio (shown to families)</label>
            <textarea
              rows={3}
              value={profileForm.bio}
              onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })}
              placeholder="Succession & NRI property matters…"
            />
          </div>

          <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
            <label className="small" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={profileForm.nriFriendly}
                onChange={(e) => setProfileForm({ ...profileForm, nriFriendly: e.target.checked })}
              />
              NRI-friendly
            </label>
            <label className="small" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={profileForm.acceptingMatters}
                onChange={(e) => setProfileForm({ ...profileForm, acceptingMatters: e.target.checked })}
              />
              Accepting new matters (show in directory)
            </label>
          </div>
        </form>
      )}

      <div style={{ margin: '1.25rem 0', maxWidth: 640 }}>
        <ReferralCard compact />
      </div>

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
              City leads unlock with <strong>Counsel Pro</strong> ($19/yr) — Family/Diaspora plans do not include the lead board.
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
                    {lead.exclusive ? (
                      <span className="badge badge-pending" style={{ marginLeft: '0.4rem' }}>
                        Exclusive
                      </span>
                    ) : null}
                  </strong>
                  <div className="small muted">
                    {lead.urgency} · match {lead.matchScore ?? '—'}
                    {lead.specialtyOverlap?.length
                      ? ` · overlap: ${lead.specialtyOverlap.join(', ')}`
                      : ' · no specialty overlap'}
                    {` · ${(lead.scopes || []).join(', ')} · estate ${lead.estateStatus}`}
                  </div>
                  <p className="small" style={{ margin: '0.4rem 0 0' }}>
                    {lead.blurb}
                  </p>
                  {lead.showContact && lead.familyLead?.email && (
                    <p className="small muted" style={{ margin: '0.35rem 0 0' }}>
                      Contact shared: {lead.familyLead.name} · {lead.familyLead.email}
                    </p>
                  )}
                  <p className="small muted" style={{ margin: '0.25rem 0 0' }}>
                    Approaches: {lead.openApproaches ?? 0}
                    {lead.approachSlotsLeft != null ? ` · ${lead.approachSlotsLeft} slots left` : ''}
                  </p>
                  {lead.alreadyApproached && (
                    <p className="small muted" style={{ margin: '0.35rem 0 0' }}>
                      Already engaged ({lead.engagementStatus})
                    </p>
                  )}
                  {lead.approachBlockedReason && (
                    <p className="small" style={{ margin: '0.35rem 0 0', color: 'var(--warn)' }}>
                      {lead.approachBlockedReason}
                    </p>
                  )}
                  {!lead.alreadyApproached && lead.canApproach !== false && (
                    <>
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
                      <input
                        placeholder={`Fee / retainer note (default: ${lawyer?.retainerBand || 'required'})`}
                        value={feeNote[lead.id] ?? ''}
                        onChange={(e) => setFeeNote({ ...feeNote, [lead.id]: e.target.value })}
                        style={{
                          width: '100%',
                          marginTop: '0.4rem',
                          borderRadius: 10,
                          border: '1px solid var(--line)',
                          padding: '0.5rem 0.65rem',
                        }}
                      />
                    </>
                  )}
                </div>
                <div>
                  {!lead.alreadyApproached && lead.canApproach !== false && (
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
