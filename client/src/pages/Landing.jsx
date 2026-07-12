import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Landing() {
  const { user } = useAuth();
  return (
    <>
      <section className="hero">
        <div>
          <p
            className="small muted"
            style={{
              marginBottom: '0.8rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            Family continuity software
          </p>
          <h1>Estate OS</h1>
          <p>
            Build your parent’s life map while there’s time. When death or incapacity hits, unlock a
            guided execution plan — and bring counsel onto the same matter, with a full brief ready.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary" to={user ? '/app' : '/auth?mode=register'}>
              {user ? 'Open your estates' : 'Start free'}
            </Link>
            <Link className="btn btn-ghost" to="/pricing">
              Pricing
            </Link>
          </div>
        </div>
        <div className="card" style={{ padding: '1.4rem', alignSelf: 'stretch' }}>
          <p className="display" style={{ fontSize: '1.45rem', margin: '0 0 0.75rem' }}>
            Built for real distribution
          </p>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--ink-soft)', lineHeight: 1.65 }}>
            <li>Life Map vault for banks, insurance, property, digital</li>
            <li>Unlock rules decided before crisis</li>
            <li>India execution checklist + claim letters</li>
            <li>Counsel directory, retain, pathway, privileged matter room</li>
            <li>Sibling invite links · ZIP export · audit trail</li>
          </ul>
          <p className="small muted" style={{ marginTop: '1.1rem', marginBottom: 0 }}>
            Not a will. Not a bank. Not a substitute for licensed legal advice.
          </p>
        </div>
      </section>

      <section style={{ padding: '0 0 3.5rem' }}>
        <div className="panel-grid">
          {[
            ['Before', 'Adult children quietly map accounts, papers, and wishes — often from abroad.'],
            ['When it happens', 'Appointed unlockers open Execution Mode with proof. Tasks and letters appear in order.'],
            ['With counsel', 'Retain an advocate. They get a counsel brief, pathway, and a shared privileged workspace.'],
          ].map(([t, b]) => (
            <div key={t} className="card" style={{ padding: '1.2rem' }}>
              <p className="display" style={{ fontSize: '1.35rem', margin: '0 0 0.45rem' }}>
                {t}
              </p>
              <p className="muted" style={{ margin: 0, lineHeight: 1.55 }}>
                {b}
              </p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
