import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';

export default function EmergencyPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/public/emergency/${token}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Not found');
        setData(d);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  if (error) {
    return (
      <div className="card" style={{ padding: '1.5rem', maxWidth: 520, margin: '2rem auto' }}>
        <h1 className="display">Emergency card</h1>
        <p className="muted">{error}</p>
        <Link to="/">Home</Link>
      </div>
    );
  }
  if (!data) return <p className="muted">Loading…</p>;

  return (
    <div className="card" style={{ padding: '1.5rem', maxWidth: 560, margin: '1.5rem auto 3rem' }}>
      <p className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
        Emergency card · limited info
      </p>
      <h1 className="display" style={{ fontSize: '1.8rem', margin: '0.3rem 0' }}>
        {data.subjectName}
      </h1>
      <p className="muted">{data.subjectRelation} · map status: {data.status}</p>

      <h2 className="display" style={{ fontSize: '1.2rem' }}>
        Who can unlock
      </h2>
      <ul>
        {data.unlockers.map((u) => (
          <li key={u.email}>
            <strong>{u.name}</strong> — {u.email}
          </li>
        ))}
      </ul>
      <p className="small muted">
        Mode: {data.unlockMode}
        {data.requireProof ? ' · proof required (death certificate / doctor letter)' : ''}
      </p>

      <h2 className="display" style={{ fontSize: '1.2rem' }}>
        First steps
      </h2>
      <ol>
        {data.firstSteps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>

      {data.contacts?.length > 0 && (
        <>
          <h2 className="display" style={{ fontSize: '1.2rem' }}>
            Key contacts
          </h2>
          <ul>
            {data.contacts.map((c) => (
              <li key={c.title}>
                <strong>{c.title}</strong>
                {c.notes ? ` — ${c.notes}` : ''}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="small muted" style={{ marginTop: '1.2rem' }}>
        This page does <strong>not</strong> show bank passwords or full vault. Managed by {data.ownerName} on Estate
        OS. Not legal advice.
      </p>
      <Link to="/auth">Sign in to Estate OS</Link>
    </div>
  );
}
