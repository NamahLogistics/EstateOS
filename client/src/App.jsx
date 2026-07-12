import { Navigate, Route, Routes, Link, useNavigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Landing from './pages/Landing.jsx';
import AuthPage from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import EstatePage from './pages/EstatePage.jsx';
import Pricing from './pages/Pricing.jsx';
import CounselDesk from './pages/CounselDesk.jsx';
import InvitePage from './pages/InvitePage.jsx';
import { LegalPrivacy, LegalTerms, LegalRefunds, LegalShipping, ContactPage } from './pages/Legal.jsx';

function Shell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="layout-app">
      <div className="shell">
        <header className="nav">
          <Link to={user ? '/app' : '/'} className="brand">
            <span className="brand-mark" aria-hidden />
            Estate OS
          </Link>
          <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {user && (
              <Link className="btn btn-ghost" to="/app" style={{ padding: '0.45rem 0.85rem' }}>
                Estates
              </Link>
            )}
            {user?.accountType === 'lawyer' && (
              <Link className="btn btn-ghost" to="/app/counsel" style={{ padding: '0.45rem 0.85rem' }}>
                Counsel desk
              </Link>
            )}
            <Link className="btn btn-ghost" to="/pricing" style={{ padding: '0.45rem 0.85rem' }}>
              Pricing
            </Link>
            {user ? (
              <>
                <span className="small muted">
                  {user.name}
                  {user.accountType === 'lawyer' ? ' · counsel' : ''}
                </span>
                <button
                  className="btn btn-ghost"
                  style={{ padding: '0.45rem 0.85rem' }}
                  onClick={() => {
                    logout();
                    navigate('/');
                  }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link className="btn btn-primary" to="/auth" style={{ padding: '0.45rem 0.85rem' }}>
                Sign in
              </Link>
            )}
          </div>
        </header>
        {children}
        <footer
          style={{
            display: 'flex',
            gap: '1rem',
            flexWrap: 'wrap',
            padding: '2rem 0 2.5rem',
            borderTop: '1px solid var(--line)',
            marginTop: '1rem',
          }}
        >
          <span className="small muted">© {new Date().getFullYear()} Estate OS</span>
          <Link className="small muted" to="/pricing">
            Pricing
          </Link>
          <Link className="small muted" to="/terms">
            Terms
          </Link>
          <Link className="small muted" to="/privacy">
            Privacy
          </Link>
          <Link className="small muted" to="/refunds">
            Refunds
          </Link>
          <Link className="small muted" to="/shipping">
            Shipping
          </Link>
          <Link className="small muted" to="/contact">
            Contact
          </Link>
          <span className="small muted">Not legal advice</span>
        </footer>
      </div>
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
    <Routes>
      <Route path="/" element={<Shell><Landing /></Shell>} />
      <Route path="/pricing" element={<Shell><Pricing /></Shell>} />
      <Route path="/terms" element={<Shell><LegalTerms /></Shell>} />
      <Route path="/privacy" element={<Shell><LegalPrivacy /></Shell>} />
      <Route path="/refunds" element={<Shell><LegalRefunds /></Shell>} />
      <Route path="/shipping" element={<Shell><LegalShipping /></Shell>} />
      <Route path="/contact" element={<Shell><ContactPage /></Shell>} />
      <Route path="/auth" element={<Shell><AuthPage /></Shell>} />
      <Route path="/invite/:token" element={<Shell><InvitePage /></Shell>} />
      <Route path="/app" element={<Private><Shell><Dashboard /></Shell></Private>} />
      <Route path="/app/counsel" element={<Private><Shell><CounselDesk /></Shell></Private>} />
      <Route path="/app/estates/:id" element={<Private><Shell><EstatePage /></Shell></Private>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
