import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import ReferralCard from '../components/ReferralCard.jsx';
import UpgradeGate from '../components/UpgradeGate.jsx';

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
    blurb: 'India vault + siblings + city care',
    features: [
      'Unlimited vault items',
      'Invite links + WhatsApp share',
      'Counsel retain + brief',
      'City nurses & maids directory',
      'ZIP export + audit log',
      'India execution checklist',
    ],
    cta: 'Get Family',
  },
  {
    id: 'diaspora',
    name: 'Diaspora',
    price: '₹24,998/yr',
    blurb: 'You’re abroad — parents’ papers are in India',
    features: [
      'Everything in Family (including city care)',
      'India + US / India + UK packs',
      'NRI / cross-border pathway',
      'Pay with international card from abroad',
    ],
    cta: 'Get Diaspora',
  },
  {
    id: 'counsel',
    name: 'Counsel Pro',
    price: '₹1,499/yr',
    blurb: 'For lawyers — city family leads',
    features: [
      'See families looking for counsel in your cities',
      'Approach opted-in estates',
      'Counsel desk + matter brief',
      'No vault access until family accepts',
    ],
    cta: 'Unlock city leads',
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
  const [searchParams] = useSearchParams();
  const [lead, setLead] = useState({ name: '', email: '', interest: 'family' });
  const [busy, setBusy] = useState(false);
  const [credits, setCredits] = useState(0);
  const [abroadGateOpen, setAbroadGateOpen] = useState(false);
  const highlight = searchParams.get('plan') || '';

  useEffect(() => {
    if (!user) {
      setCredits(0);
      return;
    }
    api('/api/billing/referral')
      .then((r) => setCredits(r.referralDiscountCredits || 0))
      .catch(() => setCredits(user.referralDiscountCredits || 0));
  }, [user?.id]);

  useEffect(() => {
    if (!highlight) return;
    const el = document.getElementById(`plan-${highlight}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlight]);

  async function checkout(plan) {
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
          config: data.checkoutConfig || {
            display: {
              blocks: {
                cards: {
                  name: 'Card (works from US / UK / Gulf)',
                  instruments: [{ method: 'card' }],
                },
                india: {
                  name: 'UPI / Netbanking (India)',
                  instruments: [{ method: 'upi' }, { method: 'netbanking' }],
                },
              },
              sequence: ['block.cards', 'block.india'],
              preferences: { show_default_blocks: false },
            },
          },
          handler: async (response) => {
            try {
              const verified = await api('/api/billing/verify', {
                method: 'POST',
                body: {
                  ...response,
                  plan: data.plan,
                },
              });
              setUser({
                ...user,
                plan: verified.plan,
                planExpiresAt: verified.planExpiresAt,
                planActive: verified.planActive,
                daysUntilExpiry: verified.daysUntilExpiry,
                needsRenewal: verified.needsRenewal,
                referralDiscountCredits: verified.referralDiscountCredits ?? 0,
              });
              setCredits(verified.referralDiscountCredits ?? 0);
              toast(
                verified.referralDiscount
                  ? `Paid with 50% referral reward — ${verified.plan} until ${verified.planExpiresAt ? new Date(verified.planExpiresAt).toLocaleDateString() : 'next year'}`
                  : `Payment successful — ${verified.plan} until ${verified.planExpiresAt ? new Date(verified.planExpiresAt).toLocaleDateString() : 'next year'}`
              );
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
      setUser({
        ...user,
        plan: data.plan,
        planExpiresAt: data.planExpiresAt,
        planActive: data.planActive ?? true,
        needsRenewal: false,
      });
      toast(data.message || `Plan set to ${data.plan}`);
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  function choose(plan) {
    if (plan === 'family') {
      setAbroadGateOpen(true);
      return;
    }
    checkout(plan);
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

  const hasCredit = credits > 0;

  return (
    <section style={{ padding: '1.5rem 0 3rem' }}>
      <UpgradeGate
        open={abroadGateOpen}
        onClose={() => setAbroadGateOpen(false)}
        reason="abroad_checkout"
        onPrimary={() => checkout('diaspora')}
        onSecondary={() => checkout('family')}
      />

      <h1 className="display" style={{ fontSize: '2.4rem', marginBottom: '0.4rem' }}>
        Pricing
      </h1>
      <p className="muted" style={{ maxWidth: 540 }}>
        Annual subscriptions via Razorpay. In India: UPI or netbanking. From abroad: international card
        (best on Diaspora).
        {hasCredit ? ' You have a 50% referral credit ready for checkout.' : ''}
      </p>

      <div className="upgrade-limit-banner" style={{ marginTop: '1.1rem', maxWidth: 640 }}>
        <p className="small">
          <strong>Living outside India?</strong> Family covers the India vault. Diaspora adds India+US /
          India+UK pathways when something happens — that’s the NRI plan.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: '0.45rem 0.95rem' }}
          disabled={busy}
          onClick={() => checkout('diaspora')}
        >
          Choose Diaspora
        </button>
      </div>

      {user ? (
        <div style={{ marginTop: '1.25rem', maxWidth: 640 }}>
          <ReferralCard />
        </div>
      ) : (
        <p className="small muted" style={{ marginTop: '0.75rem' }}>
          <Link to="/auth?mode=register">Sign in</Link> to see your personal referral code and link.
        </p>
      )}

      <div className="panel-grid" style={{ marginTop: '1.5rem' }}>
        {plans.map((p) => {
          const featured = p.id === 'diaspora' || highlight === p.id;
          return (
            <div
              key={p.id}
              id={`plan-${p.id}`}
              className="card"
              style={{
                padding: '1.25rem',
                outline: featured ? '2px solid var(--sage-deep)' : undefined,
                outlineOffset: featured ? '2px' : undefined,
              }}
            >
              <p
                className="small muted"
                style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}
              >
                {p.name}
                {p.id === 'diaspora' ? ' · recommended abroad' : ''}
              </p>
              <p className="display" style={{ fontSize: '2rem', margin: '0.35rem 0' }}>
                {p.price}
                {hasCredit && p.id !== 'free' && (
                  <span className="small" style={{ display: 'block', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                    Your price with referral credit: ~
                    {p.id === 'family' || p.id === 'counsel' ? '₹750' : '₹12,499'}
                  </span>
                )}
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
                  className={`btn ${p.id === 'diaspora' || p.id === 'counsel' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ width: '100%', marginTop: '0.5rem' }}
                  disabled={busy}
                  onClick={() => choose(p.id)}
                >
                  {user?.plan === p.id && user?.planActive
                    ? user?.needsRenewal
                      ? 'Renew now'
                      : 'Current plan'
                    : user?.previousPlan === p.id && user?.plan === 'free'
                      ? 'Renew plan'
                      : hasCredit
                        ? 'Pay with 50% credit'
                        : p.cta}
                </button>
              )}
            </div>
          );
        })}
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
            <option value="diaspora">Diaspora (abroad / NRI)</option>
            <option value="family">Family (India + city care)</option>
            <option value="counsel">Counsel / law firm</option>
          </select>
        </div>
        <button className="btn btn-primary">Request onboarding</button>
      </form>
    </section>
  );
}
