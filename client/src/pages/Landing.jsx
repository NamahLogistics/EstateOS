import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Landing() {
  const { user } = useAuth();
  return (
    <>
      <section className="hero">
        <div>
          <h1>Estate OS</h1>
          <p>
            You’re abroad. Your parents’ banks, LIC, flat papers, and phone SIM still sit in India.
            Map it now — so when something happens, your family isn’t guessing on WhatsApp.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary" to={user ? '/app' : '/auth?mode=register'}>
              {user ? 'Open your estates' : 'Start free — 1 parent, 5 items'}
            </Link>
            <Link className="btn btn-ghost" to="/pricing">
              Family & Diaspora plans
            </Link>
          </div>
        </div>
        <div
          style={{
            alignSelf: 'stretch',
            minHeight: 280,
            borderRadius: 0,
            background:
              'linear-gradient(145deg, rgba(44,77,60,0.92) 0%, rgba(20,32,26,0.88) 55%, rgba(90,110,70,0.75) 100%), radial-gradient(ellipse at 70% 20%, rgba(231,239,233,0.25), transparent 55%)',
            color: '#f3f6f2',
            padding: '1.6rem 1.4rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
          }}
        >
          <p
            className="small"
            style={{
              margin: '0 0 0.5rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              opacity: 0.75,
              fontWeight: 700,
            }}
          >
            Built for adult children abroad
          </p>
          <p className="display" style={{ fontSize: '1.55rem', margin: 0, color: '#fbfcf9' }}>
            Life map. Unlock rules. Execution checklist. Counsel brief.
          </p>
        </div>
      </section>

      <section style={{ padding: '0 0 3.5rem' }}>
        <h2 className="display" style={{ fontSize: '1.6rem', marginBottom: '0.75rem' }}>
          How it works
        </h2>
        <p className="muted" style={{ maxWidth: 520, marginBottom: '1.25rem' }}>
          One job at a time — build the map while there’s calm, then run the playbook when there isn’t.
        </p>
        <div className="panel-grid">
          {[
            [
              'While you’re abroad',
              'Interview a parent on a call, snap passbook photos, invite siblings. Hindi or English.',
            ],
            [
              'When something happens',
              'Appointed unlockers open Execution Mode with proof. India — or India+US / India+UK — tasks appear in order.',
            ],
            [
              'With counsel',
              'Retain an advocate. They get the brief, pathway, and a privileged workspace — not a chaotic email dump.',
            ],
          ].map(([t, b]) => (
            <div key={t} style={{ padding: '0.25rem 0' }}>
              <p className="display" style={{ fontSize: '1.25rem', margin: '0 0 0.35rem' }}>
                {t}
              </p>
              <p className="muted" style={{ margin: 0, lineHeight: 1.55 }}>
                {b}
              </p>
            </div>
          ))}
        </div>
        <p className="small muted" style={{ marginTop: '1.5rem' }}>
          Not a will. Not a bank. Not a substitute for licensed legal advice.
        </p>
      </section>
    </>
  );
}
