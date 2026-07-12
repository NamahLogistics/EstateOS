import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function InvitePage() {
  const { token } = useParams();
  const { user, api, toast, login, register } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/invites/${token}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Invalid invite');
        setInfo(d);
        setForm((f) => ({ ...f, email: d.email || '' }));
      })
      .catch((e) => setError(e.message));
  }, [token]);

  async function acceptWithToken(bearer) {
    const res = await fetch(`/api/invites/${token}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Accept failed');
    return data;
  }

  async function accept() {
    setBusy(true);
    try {
      const res = await api(`/api/invites/${token}/accept`, { method: 'POST', body: {} });
      toast('Invite accepted');
      navigate(`/app/estates/${res.estateId}`);
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function registerAndAccept(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const session = await register({ ...form, email: info.email, accountType: 'family' });
      const res = await acceptWithToken(session.token);
      toast('Welcome — invite accepted');
      navigate(`/app/estates/${res.estateId}`);
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function loginAndAccept(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const session = await login({ email: form.email || info.email, password: form.password });
      const res = await acceptWithToken(session.token);
      toast('Invite accepted');
      navigate(`/app/estates/${res.estateId}`);
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="card" style={{ padding: '1.5rem', maxWidth: 480, margin: '2rem auto' }}>
        <h1 className="display" style={{ fontSize: '1.6rem' }}>
          Invite unavailable
        </h1>
        <p className="muted">{error}</p>
        <Link to="/">Go home</Link>
      </div>
    );
  }

  if (!info) return <p className="muted">Loading invite…</p>;

  return (
    <div className="card" style={{ padding: '1.5rem', maxWidth: 480, margin: '2rem auto' }}>
      <h1 className="display" style={{ fontSize: '1.7rem', marginTop: 0 }}>
        Join {info.estateName}
      </h1>
      <p className="muted">
        You’re invited as <strong>{info.role}</strong> ({info.email}).
      </p>

      {user ? (
        user.email === info.email ? (
          <button className="btn btn-primary" disabled={busy} onClick={accept}>
            Accept invite
          </button>
        ) : (
          <p className="muted">
            Signed in as {user.email}. Sign out and use {info.email} to accept.
          </p>
        )
      ) : (
        <>
          <form onSubmit={registerAndAccept}>
            <div className="field">
              <label>Your name</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={info.email} disabled />
            </div>
            <div className="field">
              <label>Create password</label>
              <input
                required
                type="password"
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
              Create account & accept
            </button>
          </form>
          <p className="small muted" style={{ marginTop: '1rem' }}>
            Already registered?
          </p>
          <form onSubmit={loginAndAccept}>
            <div className="field">
              <label>Password</label>
              <input
                required
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <button className="btn btn-ghost" style={{ width: '100%' }} disabled={busy}>
              Sign in & accept
            </button>
          </form>
        </>
      )}
    </div>
  );
}
