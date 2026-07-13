import { Link } from 'react-router-dom';

/** Family browse for city caregivers — paused while seeding the network. */
export default function CarePanel() {
  return (
    <div
      className="card"
      style={{
        padding: '1.5rem 1.35rem',
        borderColor: 'rgba(47, 107, 82, 0.35)',
        background: 'linear-gradient(165deg, rgba(220, 232, 225, 0.65), var(--card))',
      }}
    >
      <p
        className="small muted"
        style={{ margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}
      >
        Coming soon
      </p>
      <p className="display" style={{ fontSize: '1.55rem', margin: '0.35rem 0 0.45rem' }}>
        Care in their city
      </p>
      <p className="muted" style={{ marginTop: 0, lineHeight: 1.55, maxWidth: 420 }}>
        Finding nurses, maids, and attendants near your parent isn’t open yet — and there’s nothing to
        buy. We’re building the caregiver network first.
      </p>
      <p className="small muted" style={{ margin: '0.75rem 0 0' }}>
        Know a good caregiver? Invite them free. They can list now; families browse when we launch.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
        <Link className="btn btn-primary" to="/app#grow">
          WhatsApp invite caregivers
        </Link>
        <Link className="btn btn-ghost" to="/auth?mode=register&type=care">
          Caregiver signup — free
        </Link>
      </div>
    </div>
  );
}
