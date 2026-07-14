import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { useI18n } from './i18n.jsx';
import Landing from './pages/Landing.jsx';
import AuthPage from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import EstatePage from './pages/EstatePage.jsx';
import Pricing from './pages/Pricing.jsx';
import CounselDesk from './pages/CounselDesk.jsx';
import CareDesk from './pages/CareDesk.jsx';
import InvitePage from './pages/InvitePage.jsx';
import EmergencyPage from './pages/EmergencyPage.jsx';
import { LegalPrivacy, LegalTerms, LegalRefunds, LegalShipping, ContactPage } from './pages/Legal.jsx';
import { GuidesIndex, GuideArticle } from './pages/Guides.jsx';
import InstallBanner from './components/InstallBanner.jsx';
import NotificationBell from './components/NotificationBell.jsx';
import EnableAlertsBanner from './components/EnableAlertsBanner.jsx';
import GuideBot from './components/GuideBot.jsx';

function Shell({ children }) {
  const { user, logout } = useAuth();
  const { t, toggle } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  function goInvite(e) {
    e.preventDefault();
    setMenuOpen(false);
    if (location.pathname === '/app') {
      document.getElementById('grow')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    navigate('/app#grow');
  }

  const navLinks = (
    <>
      {user && (
        <>
          <Link className="nav-link" to="/app" onClick={() => setMenuOpen(false)}>
            {t('estates')}
          </Link>
          <a className="nav-link" href="/app#grow" onClick={goInvite}>
            {t('invite')}
          </a>
          <NotificationBell />
        </>
      )}
      {user?.accountType === 'lawyer' && (
        <Link className="nav-link" to="/app/counsel" onClick={() => setMenuOpen(false)}>
          {t('counselDesk')}
        </Link>
      )}
      {user?.accountType === 'care' && (
        <Link className="nav-link" to="/app/care" onClick={() => setMenuOpen(false)}>
          {t('careDesk')}
        </Link>
      )}
      <Link className="nav-link" to="/pricing" onClick={() => setMenuOpen(false)}>
        {t('pricing')}
      </Link>
      <button type="button" className="nav-link nav-link-btn" onClick={toggle} title={t('langHint')} aria-label={t('langHint')}>
        {t('lang')}
      </button>
      {user ? (
        <>
          <span className="nav-user small muted">
            {user.name}
            {user.accountType === 'lawyer' ? ' · counsel' : user.accountType === 'care' ? ' · care' : ''}
          </span>
          <button
            type="button"
            className="nav-link nav-link-btn"
            onClick={() => {
              setMenuOpen(false);
              logout();
              navigate('/');
            }}
          >
            {t('signOut')}
          </button>
        </>
      ) : (
        <Link className="btn btn-primary nav-signin" to="/auth" onClick={() => setMenuOpen(false)}>
          {t('signIn')}
        </Link>
      )}
    </>
  );

  return (
    <div className="layout-app">
      <div className="shell">
        <header className={`nav${menuOpen ? ' nav-open' : ''}`}>
          <Link to={user ? '/app' : '/'} className="brand" onClick={() => setMenuOpen(false)}>
            <span className="brand-mark" aria-hidden />
            HeirReady
          </Link>

          <div className="nav-desktop">{navLinks}</div>

          <div className="nav-mobile-bar">
            {!user && (
              <Link className="btn btn-primary nav-signin-compact" to="/auth" onClick={() => setMenuOpen(false)}>
                {t('signIn')}
              </Link>
            )}
            <button
              type="button"
              className="nav-toggle"
              aria-expanded={menuOpen}
              aria-controls="nav-menu"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>

          <nav id="nav-menu" className="nav-drawer" hidden={!menuOpen}>
            {navLinks}
          </nav>
        </header>
        {menuOpen && (
          <button
            type="button"
            className="nav-backdrop"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
        )}
        {children}
        {user && location.pathname.startsWith('/app') && <EnableAlertsBanner />}
        <footer className="site-footer">
          <span className="small muted">© {new Date().getFullYear()} HeirReady</span>
          <Link className="small muted" to="/pricing">
            {t('pricing')}
          </Link>
          <Link className="small muted" to="/guides">
            Guides
          </Link>
          <Link className="small muted" to="/terms">
            {t('terms')}
          </Link>
          <Link className="small muted" to="/privacy">
            {t('privacy')}
          </Link>
          <Link className="small muted" to="/refunds">
            {t('refunds')}
          </Link>
          <Link className="small muted" to="/shipping">
            {t('shipping')}
          </Link>
          <Link className="small muted" to="/contact">
            {t('contact')}
          </Link>
          <span className="small muted">{t('notLegalAdvice')}</span>
        </footer>
      </div>
      <InstallBanner />
    </div>
  );
}

function Private({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (!user) return <Navigate to="/auth" replace />;
  return children;
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Shell><Landing /></Shell>} />
        <Route path="/pricing" element={<Shell><Pricing /></Shell>} />
        <Route path="/guides" element={<Shell><GuidesIndex /></Shell>} />
        <Route path="/guides/:slug" element={<Shell><GuideArticle /></Shell>} />
        <Route path="/terms" element={<Shell><LegalTerms /></Shell>} />
        <Route path="/privacy" element={<Shell><LegalPrivacy /></Shell>} />
        <Route path="/refunds" element={<Shell><LegalRefunds /></Shell>} />
        <Route path="/shipping" element={<Shell><LegalShipping /></Shell>} />
        <Route path="/contact" element={<Shell><ContactPage /></Shell>} />
        <Route path="/grievance" element={<Shell><ContactPage /></Shell>} />
        <Route path="/auth" element={<Shell><AuthPage /></Shell>} />
        <Route path="/invite/:token" element={<Shell><InvitePage /></Shell>} />
        <Route path="/e/:token" element={<Shell><EmergencyPage /></Shell>} />
        <Route path="/app" element={<Private><Shell><Dashboard /></Shell></Private>} />
        <Route path="/app/counsel" element={<Private><Shell><CounselDesk /></Shell></Private>} />
        <Route path="/app/care" element={<Private><Shell><CareDesk /></Shell></Private>} />
        <Route path="/app/estates/:id" element={<Private><Shell><EstatePage /></Shell></Private>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <GuideBot />
    </>
  );
}
