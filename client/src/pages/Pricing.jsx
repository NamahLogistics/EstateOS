import { useAuth } from '../auth.jsx';

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: '₹0',
    blurb: 'Try the Life Map',
    features: ['1 estate', 'Up to 5 vault items', 'Basic locked checklist preview'],
  },
  {
    id: 'family',
    name: 'Family',
    price: '₹1,499/yr',
    blurb: 'Ready before you need it',
    features: [
      'Unlimited vault items',
      'Sibling workspace',
      'Unlock rules (single / dual)',
      'India Execution Mode + letters',
    ],
  },
  {
    id: 'diaspora',
    name: 'Diaspora',
    price: '$149/yr',
    blurb: 'When family spans countries',
    features: [
      'Everything in Family',
      'Cross-border checklist packs',
      'Activation playbooks',
      'Priority document templates',
    ],
  },
];

export default function Pricing() {
  const { user, api, toast, setUser } = useAuth();

  async function upgrade(plan) {
    if (!user) {
      toast('Create an account first');
      return;
    }
    if (plan === 'free') return;
    try {
      const data = await api('/api/billing/upgrade', { method: 'POST', body: { plan } });
      setUser({ ...user, plan: data.plan });
      toast(`Upgraded to ${data.plan} (demo billing)`);
    } catch (err) {
      toast(err.message);
    }
  }

  return (
    <section style={{ padding: '1.5rem 0 3rem' }}>
      <h1 className="display" style={{ fontSize: '2.4rem', marginBottom: '0.4rem' }}>
        Pricing
      </h1>
      <p className="muted" style={{ maxWidth: 480 }}>
        Pay yearly for readiness. When something happens, Execution Mode is the moment that
        matters — activation assist can be added later.
      </p>
      <div className="panel-grid" style={{ marginTop: '1.5rem' }}>
        {plans.map((p) => (
          <div key={p.id} className="card" style={{ padding: '1.25rem' }}>
            <p className="small muted" style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
              {p.name}
            </p>
            <p className="display" style={{ fontSize: '2rem', margin: '0.35rem 0' }}>
              {p.price}
            </p>
            <p className="muted" style={{ marginTop: 0 }}>
              {p.blurb}
            </p>
            <ul style={{ paddingLeft: '1.1rem', color: 'var(--ink-soft)', lineHeight: 1.55 }}>
              {p.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <button
              className={`btn ${p.id === 'family' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ width: '100%', marginTop: '0.5rem' }}
              onClick={() => upgrade(p.id)}
            >
              {user?.plan === p.id ? 'Current plan' : p.id === 'free' ? 'Included' : 'Upgrade (demo)'}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
