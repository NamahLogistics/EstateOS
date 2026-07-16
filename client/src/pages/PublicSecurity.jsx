import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import SecurityTrustProof from '../components/SecurityTrustProof.jsx';

/** Public trust page — readable before signup. */
export default function PublicSecurityPage() {
  const { token } = useAuth();

  return (
    <section style={{ padding: '1.5rem 0 3rem', maxWidth: 640 }}>
      <p
        className="small muted"
        style={{ margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}
      >
        Trust
      </p>
      <h1 className="display" style={{ fontSize: '2rem', margin: '0.35rem 0 0.5rem' }}>
        How we protect your data
      </h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Plain answers for families who are right to be careful before putting Life Map details in an
        app.
      </p>

      <SecurityTrustProof showRecoveryNote />

      <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
        {token ? (
          <Link className="btn btn-primary" to="/app/security">
            Open account Security
          </Link>
        ) : (
          <>
            <Link className="btn btn-primary" to="/auth?mode=register">
              Start free
            </Link>
            <Link className="btn btn-ghost" to="/auth?mode=login">
              Sign in
            </Link>
          </>
        )}
        <Link className="btn btn-ghost" to="/privacy">
          Privacy policy
        </Link>
      </div>
    </section>
  );
}
