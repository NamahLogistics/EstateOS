import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { requestSoftPushPrompt } from '../push.js';

export default function InvitePage() {
  const { token } = useParams();
  const { user, api, toast, login, register, logout, completeMfaLogin } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [mfaPending, setMfaPending] = useState(null);
  const [mfaCode, setMfaCode] = useState('');

  useEffect(() => {
    fetch(`/api/invites/${token}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Invalid invite');
        setInfo(d);
        setForm((f) => ({ ...f, email: d.email || f.email || '' }));
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
      toast(res.message || 'Invite accepted');
      requestSoftPushPrompt('invite');
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
      const email = (info.openInvite ? form.email : info.email || form.email).trim().toLowerCase();
      if (!email) throw new Error('Email required');
      const session = await register({ ...form, email, accountType: 'family' });
      const res = await acceptWithToken(session.token);
      toast(res.message || 'Welcome — invite accepted');
      requestSoftPushPrompt('invite');
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
      const email = (form.email || info.email || '').trim().toLowerCase();
      const session = await login({ email, password: form.password });
      if (session.mfaRequired) {
        setMfaPending({ mfaToken: session.mfaToken, email });
        setMfaCode('');
        toast('Enter your authenticator code');
        return;
      }
      const res = await acceptWithToken(session.token);
      toast(res.message || 'Invite accepted');
      requestSoftPushPrompt('invite');
      navigate(`/app/estates/${res.estateId}`);
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitMfa(e) {
    e.preventDefault();
    if (!mfaPending?.mfaToken) return;
    setBusy(true);
    try {
      const session = await completeMfaLogin({
        mfaToken: mfaPending.mfaToken,
        code: mfaCode,
      });
      setMfaPending(null);
      const res = await acceptWithToken(session.token);
      toast(res.message || 'Invite accepted');
      requestSoftPushPrompt('invite');
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

  const openInvite = Boolean(info.openInvite);
  const canAcceptLoggedIn =
    user && (openInvite || user.email === info.email);

  return (
    <div className="card" style={{ padding: '1.5rem', maxWidth: 480, margin: '2rem auto' }}>
      <h1 className="display" style={{ fontSize: '1.7rem', marginTop: 0 }}>
        Join {info.estateName}
      </h1>
      <p className="muted">
        You’re invited as <strong>{info.role}</strong>
        {openInvite
          ? info.multiUse
            ? ` — this family link works for multiple siblings (${info.memberCount || '?'} already on the map). Create your account with any email.`
            : ' — create your account with any email to join this family vault.'
          : ` (${info.email}).`}
      </p>

      {user ? (
        canAcceptLoggedIn ? (
          <button className="btn btn-primary" disabled={busy} onClick={accept}>
            Accept invite
          </button>
        ) : (
          <div>
            <p className="muted">
              Signed in as {user.email}. This invite is for {info.email}.
            </p>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                logout?.();
                navigate(`/invite/${token}`);
              }}
            >
              Sign out to accept
            </button>
          </div>
        )
      ) : mfaPending ? (
        <form onSubmit={submitMfa}>
          <p className="muted">Enter your authenticator code for {mfaPending.email}</p>
          <div className="field">
            <label>Authenticator code</label>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              required
              autoFocus
            />
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
            Verify & accept
          </button>
        </form>
      ) : (
        <>
          <form onSubmit={registerAndAccept}>
            <div className="field">
              <label>Your name</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                required
                value={openInvite ? form.email : info.email || form.email}
                disabled={!openInvite}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@email.com"
              />
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
            {openInvite && (
              <div className="field">
                <label>Email</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
            )}
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
