import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';

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

function modeFromParams(params) {
  const m = params.get('mode');
  if (m === 'login' || m === 'forgot' || m === 'reset') return m;
  return 'register';
}

export default function AuthPage() {
  const { user, login, register, toast } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const resetToken = (params.get('token') || '').trim();
  const [mode, setMode] = useState(() => {
    if (resetToken) return 'reset';
    return modeFromParams(params);
  });
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
    passwordConfirm: '',
    accountType: typeFromUrl || 'family',
    city: cityFromUrl || '',
    role: 'maid',
    phone: '',
  });
  const [busy, setBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  useEffect(() => {
    try {
      localStorage.removeItem('heirready_invite_city');
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
    if (resetToken) setMode('reset');
    else if (params.get('mode') === 'forgot') setMode('forgot');
    else if (params.get('mode') === 'login') setMode('login');
  }, [refFromUrl, typeFromUrl, cityFromUrl, resetToken, params]);

  if (user) return <Navigate to={homeFor(user.accountType)} replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'forgot') {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: form.email }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not send reset email');
        setForgotSent(true);
        toast(data.message || 'Check your email for a reset link');
        return;
      }

      if (mode === 'reset') {
        if (form.password !== form.passwordConfirm) {
          throw new Error('Passwords do not match');
        }
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: resetToken,
            password: form.password,
            passwordConfirm: form.passwordConfirm,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not reset password');
        toast(data.message || 'Password updated — sign in');
        setMode('login');
        setForm((f) => ({ ...f, password: '', passwordConfirm: '' }));
        navigate('/auth?mode=login', { replace: true });
        return;
      }

      if (mode === 'register') {
        if (form.password !== form.passwordConfirm) {
          throw new Error('Passwords do not match');
        }
        const data = await register({
          ...form,
          passwordConfirm: form.passwordConfirm,
          ref: referralCode || undefined,
          city: form.city || undefined,
          role: form.role || undefined,
          phone: form.phone || undefined,
        });
        localStorage.removeItem(REF_KEY);
        if (form.city) localStorage.setItem(CITY_KEY, form.city);
        toast(t('welcome'));
        navigate(homeFor(data.user?.accountType));
        return;
      }

      const data = await login({ email: form.email, password: form.password });
      toast(t('welcome'));
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

  const title =
    mode === 'forgot'
      ? t('forgotTitle')
      : mode === 'reset'
        ? t('resetTitle')
        : mode === 'register'
          ? isLawyer
            ? t('joinCounsel')
            : isCare
              ? t('joinCare')
              : t('createAccount')
          : t('signIn');

  const subtitle =
    mode === 'forgot'
      ? t('forgotBlurb')
      : mode === 'reset'
        ? t('resetBlurb')
        : mode === 'register'
          ? isLawyer
            ? t('authCounselBlurb')
            : isCare
              ? t('authCareBlurb')
              : t('authFamilyBlurb')
          : t('welcomeBack');

  return (
    <div style={{ maxWidth: 420, margin: '2rem auto 3rem' }}>
      <div className="card" style={{ padding: '1.5rem' }}>
        <h1 className="display" style={{ fontSize: '1.8rem', marginTop: 0 }}>
          {title}
        </h1>
        <p className="muted" style={{ marginTop: '-0.3rem' }}>
          {subtitle}
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

        {mode === 'forgot' && forgotSent ? (
          <div>
            <p style={{ lineHeight: 1.55 }}>
              If <strong>{form.email}</strong> is registered, a reset link is on its way. Check spam
              too.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={() => {
                setMode('login');
                setForgotSent(false);
              }}
            >
              {t('backSignIn')}
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            {mode === 'register' && (
              <>
                <div className="field">
                  <label>{t('iAm')}</label>
                  <select
                    value={form.accountType}
                    onChange={(e) => setForm({ ...form, accountType: e.target.value })}
                  >
                    <option value="family">{t('familyAdult')}</option>
                    <option value="lawyer">{t('lawyerCounsel')}</option>
                    <option value="care">{t('nurseCare')}</option>
                  </select>
                </div>
                <div className="field">
                  <label>{t('yourName')}</label>
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
                      <label>{t('primaryCity')}</label>
                      <input
                        value={form.city}
                        onChange={(e) => setForm({ ...form, city: e.target.value })}
                        required
                        placeholder={t('yourCity')}
                      />
                    </div>
                    <div className="field">
                      <label>{t('role')}</label>
                      <select
                        value={form.role}
                        onChange={(e) => setForm({ ...form, role: e.target.value })}
                      >
                        <option value="nurse">Nurse</option>
                        <option value="attendant">Attendant / ayah</option>
                        <option value="maid">Maid / domestic help</option>
                        <option value="cook">Cook</option>
                        <option value="driver">Driver</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>{t('phone')}</label>
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
                    <label>{t('parentsCity')}</label>
                    <input
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      placeholder={t('yourCity')}
                    />
                  </div>
                )}
                <div className="field">
                  <label>{t('referralOptional')}</label>
                  <input
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.trim().toUpperCase())}
                    placeholder="From a friend’s link"
                  />
                </div>
              </>
            )}

            {(mode === 'register' || mode === 'login' || mode === 'forgot') && (
              <div className="field">
                <label>{t('email')}</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  placeholder="you@email.com"
                  autoComplete="email"
                />
              </div>
            )}

            {(mode === 'register' || mode === 'login' || mode === 'reset') && (
              <div className="field">
                <label>{mode === 'reset' ? t('newPassword') : t('password')}</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  minLength={6}
                  placeholder="At least 6 characters"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </div>
            )}

            {(mode === 'register' || mode === 'reset') && (
              <div className="field">
                <label>{t('confirmPassword')}</label>
                <input
                  type="password"
                  value={form.passwordConfirm}
                  onChange={(e) => setForm({ ...form, passwordConfirm: e.target.value })}
                  required
                  minLength={6}
                  placeholder="Type it again"
                  autoComplete="new-password"
                />
              </div>
            )}

            <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
              {busy
                ? t('pleaseWait')
                : mode === 'forgot'
                  ? t('emailResetLink')
                  : mode === 'reset'
                    ? t('updatePassword')
                    : mode === 'register'
                      ? t('createAccount')
                      : t('signIn')}
            </button>
          </form>
        )}

        {mode === 'login' && (
          <p className="small" style={{ marginTop: '0.85rem', marginBottom: 0 }}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '0.2rem 0.5rem' }}
              onClick={() => {
                setMode('forgot');
                setForgotSent(false);
              }}
            >
              {t('forgotPassword')}
            </button>
          </p>
        )}

        {mode !== 'reset' && (
          <p className="small muted" style={{ marginTop: '1rem', marginBottom: 0 }}>
            {mode === 'register' ? t('alreadyAccount') : mode === 'forgot' ? t('remembered') : t('newHere')}{' '}
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '0.2rem 0.5rem' }}
              onClick={() => {
                setForgotSent(false);
                setMode(mode === 'register' ? 'login' : mode === 'forgot' ? 'login' : 'register');
              }}
            >
              {mode === 'register' || mode === 'forgot' ? t('signIn') : t('createAccount')}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
