import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const REF_KEY = 'estate_os_ref';
const CITY_KEY = 'heirready_invite_city_v2';

function typeFromParam(raw) {
  if (raw === 'lawyer') return 'lawyer';
  if (raw === 'care') return 'care';
  return null;
}

function homeFor(accountType) {
  if (accountType === 'lawyer') return '/app/counsel';
  if (accountType === 'care') return '/app/care';
  return '/app';
}

export default function AuthPage() {
  const { user, login, register, toast } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState(params.get('mode') === 'login' ? 'login' : 'register');
  const refFromUrl = (params.get('ref') || '').trim().toUpperCase();
  const typeFromUrl = typeFromParam(params.get('type'));
  const cityFromUrl = (params.get('city') || '').trim();
  const [referralCode, setReferralCode] = useState(() => {
    if (refFromUrl) {
      localStorage.setItem(REF_KEY, refFromUrl);
      return refFromUrl;
    }
    return localStorage.getItem(REF_KEY) || '';
  });
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    accountType: typeFromUrl || 'family',
    city: cityFromUrl || '',
    role: 'maid',
    phone: '',
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      localStorage.removeItem('heirready_invite_city'); // drop old Pune default
    } catch {
      /* ignore */
    }
    if (refFromUrl) {
      localStorage.setItem(REF_KEY, refFromUrl);
      setReferralCode(refFromUrl);
    }
    if (typeFromUrl) {
      setForm((f) => ({ ...f, accountType: typeFromUrl }));
    }
    if (cityFromUrl) {
      localStorage.setItem(CITY_KEY, cityFromUrl);
      setForm((f) => ({ ...f, city: cityFromUrl }));
    } else {
      const saved = localStorage.getItem(CITY_KEY) || '';
      if (saved) setForm((f) => (f.city ? f : { ...f, city: saved }));
    }
  }, [refFromUrl, typeFromUrl, cityFromUrl]);

  if (user) return <Navigate to={homeFor(user.accountType)} replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload =
        mode === 'register'
          ? {
              ...form,
              ref: referralCode || undefined,
              city: form.city || undefined,
              role: form.role || undefined,
              phone: form.phone || undefined,
            }
          : form;
      const data = mode === 'register' ? await register(payload) : await login(form);
      if (mode === 'register') {
        localStorage.removeItem(REF_KEY);
        if (form.city) localStorage.setItem(CITY_KEY, form.city);
      }
      toast('Welcome to HeirReady');
      navigate(homeFor(data.user?.accountType));
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  const isLawyer = form.accountType === 'lawyer' || typeFromUrl === 'lawyer';
  const isCare = form.accountType === 'care' || typeFromUrl === 'care';
  const cityHint = form.city || cityFromUrl;

  return (
    <div style={{ maxWidth: 420, margin: '2rem auto 3rem' }}>
      <div className="card" style={{ padding: '1.5rem' }}>
        <h1 className="display" style={{ fontSize: '1.8rem', marginTop: 0 }}>
          {mode === 'register'
            ? isLawyer
              ? 'Join as counsel'
              : isCare
                ? 'Join as caregiver'
                : 'Create account'
            : 'Sign in'}
        </h1>
        <p className="muted" style={{ marginTop: '-0.3rem' }}>
          {isLawyer
            ? 'Counsel desk, city leads, and matter briefs — for advocates.'
            : isCare
              ? 'List your cities and role free — families will find you when city care launches.'
              : 'Families map estates. Counsel and care network when you need them.'}
        </p>
        {mode === 'register' && cityHint && !isLawyer && (
          <p className="small" style={{ marginTop: 0 }}>
            Invite city: <strong>{cityHint}</strong>
          </p>
        )}
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
                  <option value="care">Nurse / maid / caregiver</option>
                </select>
              </div>
              <div className="field">
                <label>Your name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder={isCare ? 'Sunita' : 'Priya Sharma'}
                />
              </div>
              {isCare && (
                <>
                  <div className="field">
                    <label>Primary city</label>
                    <input
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      required
                      placeholder="Your city"
                    />
                  </div>
                  <div className="field">
                    <label>Role</label>
                    <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                      <option value="nurse">Nurse</option>
                      <option value="attendant">Attendant / ayah</option>
                      <option value="maid">Maid / domestic help</option>
                      <option value="cook">Cook</option>
                      <option value="driver">Driver</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Phone</label>
                    <input
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="+91…"
                    />
                  </div>
                </>
              )}
              {!isCare && !isLawyer && (
                <div className="field">
                  <label>Parent’s city (optional)</label>
                  <input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    placeholder="Your city"
                  />
                </div>
              )}
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
