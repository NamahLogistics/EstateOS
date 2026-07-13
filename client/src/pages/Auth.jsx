import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const REF_KEY = 'estate_os_ref';

export default function AuthPage() {
  const { user, login, register, toast } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState(params.get('mode') === 'login' ? 'login' : 'register');
  const refFromUrl = (params.get('ref') || '').trim().toUpperCase();
  const [referralCode, setReferralCode] = useState(() => {
    if (refFromUrl) {
      localStorage.setItem(REF_KEY, refFromUrl);
      return refFromUrl;
    }
    return localStorage.getItem(REF_KEY) || '';
  });
  const [form, setForm] = useState({ name: '', email: '', password: '', accountType: 'family' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (refFromUrl) {
      localStorage.setItem(REF_KEY, refFromUrl);
      setReferralCode(refFromUrl);
    }
  }, [refFromUrl]);

  if (user) return <Navigate to={user.accountType === 'lawyer' ? '/app/counsel' : '/app'} replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload =
        mode === 'register'
          ? { ...form, ref: referralCode || undefined }
          : form;
      const data = mode === 'register' ? await register(payload) : await login(form);
      if (mode === 'register') localStorage.removeItem(REF_KEY);
      toast('Welcome to Estate OS');
      navigate(data.user?.accountType === 'lawyer' ? '/app/counsel' : '/app');
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '2rem auto 3rem' }}>
      <div className="card" style={{ padding: '1.5rem' }}>
        <h1 className="display" style={{ fontSize: '1.8rem', marginTop: 0 }}>
          {mode === 'register' ? 'Create account' : 'Sign in'}
        </h1>
        <p className="muted" style={{ marginTop: '-0.3rem' }}>
          Families map estates. Counsel runs the legal matter.
        </p>
        {mode === 'register' && referralCode && (
          <p className="small" style={{ marginTop: 0 }}>
            Referral code applied: <strong>{referralCode}</strong>
          </p>
        )}
        <form onSubmit={submit}>
          {mode === 'register' && (
            <>
              <div className="field">
                <label>I am</label>
                <select
                  value={form.accountType}
                  onChange={(e) => setForm({ ...form, accountType: e.target.value })}
                >
                  <option value="family">Family / adult child</option>
                  <option value="lawyer">Lawyer / counsel</option>
                </select>
              </div>
              <div className="field">
                <label>Your name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder="Priya Sharma"
                />
              </div>
              <div className="field">
                <label>Referral code (optional)</label>
                <input
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.trim().toUpperCase())}
                  placeholder="From a friend’s link"
                />
              </div>
            </>
          )}
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              placeholder="you@email.com"
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={6}
              placeholder="At least 6 characters"
            />
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
            {busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <p className="small muted" style={{ marginTop: '1rem', marginBottom: 0 }}>
          {mode === 'register' ? 'Already have an account?' : 'New here?'}{' '}
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: '0.2rem 0.5rem' }}
            onClick={() => setMode(mode === 'register' ? 'login' : 'register')}
          >
            {mode === 'register' ? 'Sign in' : 'Create account'}
          </button>
        </p>
      </div>
    </div>
  );
}
