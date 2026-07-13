import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Landing() {
  const { user } = useAuth();
  const isLawyer = user?.accountType === 'lawyer';

  return (
    <>
      <section className="hero-bleed" aria-label="HeirReady">
        <div className="hero-bleed-wash" aria-hidden />
        <div className="hero-bleed-inner">
          <h1 className="brand-hero">HeirReady</h1>
          <p className="hero-line">
            You’re abroad. Their banks, LIC, flat papers, and caregivers still sit in India. Map it
            once — so family isn’t guessing on WhatsApp when something happens.
          </p>
          <div className="hero-actions">
            {isLawyer ? (
              <>
                <Link className="btn btn-primary" to="/app/counsel">
                  Open counsel desk
                </Link>
                <Link className="btn btn-ghost" to="/pricing">
                  Counsel Pro
                </Link>
              </>
            ) : (
              <>
                <Link className="btn btn-primary" to={user ? '/app' : '/auth?mode=register'}>
                  {user ? 'Open your estates' : 'Start free — map one parent'}
                </Link>
                <Link className="btn btn-ghost" to="/auth?mode=register&type=lawyer">
                  I’m counsel
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="section-how">
        <h2 className="display section-how-title">How it works from abroad</h2>
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

      <section className="section-counsel">
        <h2 className="display section-how-title">For advocates</h2>
        <p className="section-lead">
          Join as counsel. Complete your profile, take Counsel Pro, and approach families in your
          cities who asked to be found — vault stays locked until they accept.
        </p>
        <div className="hero-actions">
          {isLawyer ? (
            <Link className="btn btn-primary" to="/app/counsel">
              Counsel desk
            </Link>
          ) : (
            <>
              <Link className="btn btn-primary" to="/auth?mode=register&type=lawyer">
                Register as counsel
              </Link>
              <Link className="btn btn-ghost" to="/pricing">
                Counsel Pro — ₹1,499/yr
              </Link>
            </>
          )}
        </div>
      </section>
    </>
  );
}
