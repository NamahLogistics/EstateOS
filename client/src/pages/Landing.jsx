import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Landing() {
  const { user } = useAuth();
  return (
    <>
      <section className="hero">
        <div>
          <p className="hero-kicker">Built for adult children abroad</p>
          <h1>Estate OS</h1>
          <p className="hero-lead">
            You’re in the US, UK, or Gulf. Your parents’ SBI, LIC, flat papers, and SIM still sit in
            India. Build the Life Map from abroad — so when something happens, family isn’t guessing
            on WhatsApp.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary" to={user ? '/app' : '/auth?mode=register'}>
              {user ? 'Open your estates' : 'Start free — map one parent'}
            </Link>
            <Link className="btn btn-ghost" to="/pricing">
              Family & Diaspora plans
            </Link>
          </div>
        </div>
        <div className="hero-panel">
          <p className="hero-panel-label">For NRIs & diaspora families</p>
          <p className="display hero-panel-title">
            Interview on a call. Snap passbooks. Unlock with proof. Run the India checklist remotely.
          </p>
        </div>
      </section>

      <section style={{ padding: '0 0 3.5rem' }}>
        <h2 className="display" style={{ fontSize: '1.6rem', marginBottom: '0.75rem' }}>
          How it works from abroad
        </h2>
        <p className="section-lead">
          Built so the adult child overseas can set it up — the parent only confirms the essentials.
        </p>
        <div className="panel-grid">
          {[
            [
              'While you’re abroad',
              'Interview a parent on a call, scan passbook photos, invite siblings. Hindi or English.',
            ],
            [
              'When something happens',
              'Appointed unlockers open Execution Mode with proof. India — or India+US / India+UK — tasks appear in order.',
            ],
            [
              'With counsel',
              'Retain an advocate. They get the brief and pathway — not a chaotic WhatsApp dump from overseas.',
            ],
          ].map(([t, b]) => (
            <div key={t} className="feature-block">
              <p className="display feature-title">{t}</p>
              <p className="feature-body">{b}</p>
            </div>
          ))}
        </div>
        <p className="small" style={{ marginTop: '1.5rem', color: 'var(--ink-soft)' }}>
          Not a will. Not a bank. Not a substitute for licensed legal advice.
        </p>
      </section>
    </>
  );
}
