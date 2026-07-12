import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Landing() {
  const { user } = useAuth();
  return (
    <section className="hero">
      <div>
        <p className="small muted" style={{ marginBottom: '0.8rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>
          Family continuity
        </p>
        <h1>Estate OS</h1>
        <p>
          Build a parent’s life map while there’s time. When death or incapacity hits, unlock a
          guided checklist — banks, insurance, property, digital — with letters ready to send.
        </p>
        <div className="hero-actions">
          <Link className="btn btn-primary" to={user ? '/app' : '/auth'}>
            {user ? 'Open your estates' : 'Start free'}
          </Link>
          <Link className="btn btn-ghost" to="/pricing">
            See pricing
          </Link>
        </div>
      </div>
      <div className="card" style={{ padding: '1.4rem', alignSelf: 'stretch' }}>
        <p className="display" style={{ fontSize: '1.45rem', margin: '0 0 0.75rem' }}>
          How it works
        </p>
        <ol style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--ink-soft)', lineHeight: 1.55 }}>
          <li>Adult child creates an estate for a parent.</li>
          <li>Add banks, policies, property — photo the passbook if needed.</li>
          <li>Set who can unlock (one person or two of three).</li>
          <li>Retain counsel — pathway engine + privileged matter workspace.</li>
          <li>On death/incapacity: unlock → Execution Mode + counsel brief.</li>
        </ol>
        <p className="small muted" style={{ marginTop: '1.1rem', marginBottom: 0 }}>
          Not a will. Not a bank. A map + rules + execution guide.
        </p>
      </div>
    </section>
  );
}
