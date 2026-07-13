import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: '₹0',
    blurb: 'Start mapping today',
    features: ['1 estate / parent', '5 Life Map items', 'Unlock rules', 'India checklist on unlock'],
    cta: 'Start free',
  },
  {
    id: 'family',
    name: 'Family',
    price: '₹1,499/yr',
    blurb: 'Siblings + counsel-ready',
    features: [
      'Unlimited vault items',
      'Invite links + WhatsApp share',
      'Counsel retain + brief',
      'ZIP export + audit log',
    ],
    cta: 'Pay with UPI / card',
  },
  {
    id: 'diaspora',
    name: 'Diaspora',
    price: '₹12,499/yr',
    blurb: 'When family spans countries',
    features: [
      'Everything in Family',
      'India + US / India + UK packs',
      'NRI / cross-border pathway',
      'Priority counsel matching',
    ],
    cta: 'Pay with UPI / card',
  },
];

function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(window.Razorpay);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(window.Razorpay);
    script.onerror = () => reject(new Error('Failed to load Razorpay'));
    document.body.appendChild(script);
  });
}

export default function Pricing() {
  const { user, api, toast, setUser } = useAuth();
  const [lead, setLead] = useState({ name: '', email: '', interest: 'family' });
  const [busy, setBusy] = useState(false);

  async function choose(plan) {
    if (plan === 'free') return;
    if (!user) {
      toast('Create an account first, then choose a plan');
      return;
    }
    setBusy(true);
    try {
      const data = await api('/api/billing/checkout', { method: 'POST', body: { plan } });
      if (data.mode === 'razorpay') {
        const Razorpay = await loadRazorpay();
        const rzp = new Razorpay({
          key: data.keyId,
          amount: data.amount,
          currency: data.currency || 'INR',
          name: data.name,
          description: data.description,
          order_id: data.orderId,
          prefill: data.prefill,
          theme: { color: '#2c4d3c' },
          handler: async (response) => {
            try {
              const verified = await api('/api/billing/verify', {
                method: 'POST',
                body: {
                  ...response,
                  plan: data.plan,
                },
              });
              setUser({ ...user, plan: verified.plan });
              toast(`Payment successful — you're on ${verified.plan}`);
            } catch (err) {
              toast(err.message);
            }
          },
        });
        rzp.on('payment.failed', (resp) => {
          toast(resp.error?.description || 'Payment failed');
        });
        rzp.open();
        return;
      }
      setUser({ ...user, plan: data.plan });
      toast(data.message || `Plan set to ${data.plan}`);
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function joinWaitlist(e) {
    e.preventDefault();
    try {
      await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lead),
      }).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Failed');
      });
      toast('Thanks — we will reach out');
      setLead({ name: '', email: '', interest: 'family' });
    } catch (err) {
      toast(err.message);
    }
  }

  return (
    <section style={{ padding: '1.5rem 0 3rem' }}>
      <h1 className="display" style={{ fontSize: '2.4rem', marginBottom: '0.4rem' }}>
        Pricing
      </h1>
      <p className="muted" style={{ maxWidth: 520 }}>
        Free to start. Paid plans use Razorpay (UPI, cards, netbanking) — built for India.
      </p>
      <div className="panel-grid" style={{ marginTop: '1.5rem' }}>
        {plans.map((p) => (
          <div key={p.id} className="card" style={{ padding: '1.25rem' }}>
            <p
              className="small muted"
              style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}
            >
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
            {p.id === 'free' ? (
              <Link className="btn btn-ghost" style={{ width: '100%', marginTop: '0.5rem' }} to="/auth?mode=register">
                {p.cta}
              </Link>
            ) : (
              <button
                className={`btn ${p.id === 'family' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ width: '100%', marginTop: '0.5rem' }}
                disabled={busy}
                onClick={() => choose(p.id)}
              >
                {user?.plan === p.id ? 'Current plan' : p.cta}
              </button>
            )}
          </div>
        ))}
      </div>

      <form className="card" style={{ padding: '1.25rem', marginTop: '1.5rem', maxWidth: 520 }} onSubmit={joinWaitlist}>
        <p className="display" style={{ fontSize: '1.3rem', marginTop: 0 }}>
          Prefer a human onboarding?
        </p>
        <p className="muted small">Leave your email — we help set up the first estate for your family.</p>
        <div className="field">
          <label>Name</label>
          <input value={lead.name} onChange={(e) => setLead({ ...lead, name: e.target.value })} />
        </div>
        <div className="field">
          <label>Email</label>
          <input
            required
            type="email"
            value={lead.email}
            onChange={(e) => setLead({ ...lead, email: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Interest</label>
          <select value={lead.interest} onChange={(e) => setLead({ ...lead, interest: e.target.value })}>
            <option value="family">Family plan</option>
            <option value="diaspora">Diaspora plan</option>
            <option value="counsel">Counsel / law firm</option>
          </select>
        </div>
        <button className="btn btn-primary">Request onboarding</button>
      </form>
    </section>
  );
}
