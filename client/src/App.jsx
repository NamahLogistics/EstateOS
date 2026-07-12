import { Navigate, Route, Routes, Link, useNavigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Landing from './pages/Landing.jsx';
import AuthPage from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import EstatePage from './pages/EstatePage.jsx';
import Pricing from './pages/Pricing.jsx';
import CounselDesk from './pages/CounselDesk.jsx';

function Shell({ children, solid }) {
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
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            {user && (
              <Link className="btn btn-ghost" to="/app" style={{ padding: '0.45rem 0.9rem' }}>
                Estates
              </Link>
            )}
            {user?.accountType === 'lawyer' && (
              <Link className="btn btn-ghost" to="/app/counsel" style={{ padding: '0.45rem 0.9rem' }}>
                Counsel desk
              </Link>
            )}
            <Link className="btn btn-ghost" to="/pricing" style={{ padding: '0.45rem 0.9rem' }}>
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
                  style={{ padding: '0.45rem 0.9rem' }}
                  onClick={() => {
                    logout();
                    navigate('/');
                  }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link className="btn btn-primary" to="/auth" style={{ padding: '0.45rem 0.9rem' }}>
                Sign in
              </Link>
            )}
          </div>
        </header>
        {solid ? <div className="card" style={{ padding: '1.25rem' }}>{children}</div> : children}
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
      <Route
        path="/"
        element={
          <Shell>
            <Landing />
          </Shell>
        }
      />
      <Route
        path="/pricing"
        element={
          <Shell>
            <Pricing />
          </Shell>
        }
      />
      <Route
        path="/auth"
        element={
          <Shell>
            <AuthPage />
          </Shell>
        }
      />
      <Route
        path="/app"
        element={
          <Private>
            <Shell>
              <Dashboard />
            </Shell>
          </Private>
        }
      />
      <Route
        path="/app/counsel"
        element={
          <Private>
            <Shell>
              <CounselDesk />
            </Shell>
          </Private>
        }
      />
      <Route
        path="/app/estates/:id"
        element={
          <Private>
            <Shell>
              <EstatePage />
            </Shell>
          </Private>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
