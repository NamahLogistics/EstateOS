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
    blurb: 'India vault + siblings + counsel',
    features: [
      'Unlimited vault items',
      'Invite links + WhatsApp share',
      'Counsel retain + brief',
      'ZIP export + audit log',
      'India execution checklist',
    ],
    cta: 'Get Family',
  },
  {
    id: 'family_care',
    name: 'Family + Care',
    price: '₹2,998/yr',
    blurb: 'City nurses & maids — coming soon',
    features: [
      'Everything in Family',
      'Browse nurses / maids by city',
      'Phone numbers unlocked',
      'Save caregivers into Life Map',
    ],
    cta: 'Coming soon',
    comingSoon: true,
  },
  {
    id: 'diaspora',
    name: 'Diaspora',
    price: '₹12,499/yr',
    blurb: 'You’re abroad — parents’ papers are in India',
    features: [
      'Everything in Family',
      'India + US / India + UK packs',
      'NRI / cross-border pathway',
      'Pay with international card from abroad',
    ],
    cta: 'Get Diaspora',
  },
  {
    id: 'diaspora_care',
    name: 'Diaspora + Care',
    price: '₹24,998/yr',
    blurb: 'Cross-border + city care — coming soon',
    features: [
      'Everything in Diaspora',
      'City nurses & maids directory',
      'Phone numbers unlocked',
      'Save caregivers into Life Map',
    ],
    cta: 'Coming soon',
    comingSoon: true,
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

function referralHalfPrice(planId) {
  if (planId === 'family' || planId === 'counsel') return '₹750';
  if (planId === 'family_care') return '₹1,499';
  if (planId === 'diaspora') return '₹6,250';
  if (planId === 'diaspora_care') return '₹12,499';
  return null;
}

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
    if (plan === 'family_care' || plan === 'diaspora_care' || plan === 'care') {
      toast('City care network is coming soon — not available to purchase yet');
      return;
    }
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
                verified.kind === 'upgrade'
                  ? `Upgraded — same renewal ${verified.planExpiresAt ? new Date(verified.planExpiresAt).toLocaleDateString() : ''}`
                  : verified.referralDiscount
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
      <p className="muted" style={{ maxWidth: 560 }}>
        Annual subscriptions via Razorpay. Mid-year upgrades: pay only the difference for days
        left — renewal date stays the same. Downgrades wait until renewal.
        {hasCredit ? ' You have a 50% referral credit ready for checkout.' : ''}
      </p>

      <div
        className="card"
        style={{
          marginTop: '1.1rem',
          maxWidth: 640,
          padding: '1.15rem 1.25rem',
          borderColor: 'rgba(47, 107, 82, 0.35)',
          background: 'linear-gradient(165deg, rgba(220, 232, 225, 0.55), var(--card))',
        }}
      >
        <p
          className="small muted"
          style={{ margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}
        >
          Coming soon
        </p>
        <p className="display" style={{ fontSize: '1.35rem', margin: '0.3rem 0 0.4rem' }}>
          City care network
        </p>
        <p className="muted" style={{ margin: 0 }}>
          Family + Care and Diaspora + Care aren’t open for purchase yet. Caregivers can still join
          free and list their city — we’ll notify families when browse unlocks.
        </p>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.85rem' }}>
          <Link className="btn btn-primary" style={{ padding: '0.5rem 1rem' }} to="/auth?mode=register&type=care">
            Join as caregiver — free
          </Link>
          <span className="btn btn-ghost" style={{ padding: '0.5rem 1rem', opacity: 0.65, pointerEvents: 'none' }}>
            Family / Diaspora + Care — soon
          </span>
        </div>
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
          const featured = highlight === p.id && !p.comingSoon;
          const half = referralHalfPrice(p.id);
          const soon = Boolean(p.comingSoon);
          return (
            <div
              key={p.id}
              id={`plan-${p.id}`}
              className="card"
              style={{
                padding: '1.25rem',
                outline: featured ? '2px solid var(--sage-deep)' : undefined,
                outlineOffset: featured ? '2px' : undefined,
                opacity: soon ? 0.88 : 1,
              }}
            >
              <p
                className="small muted"
                style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}
              >
                {p.name}
                {soon ? ' · coming soon' : ''}
              </p>
              <p className="display" style={{ fontSize: '2rem', margin: '0.35rem 0' }}>
                {soon ? '—' : p.price}
                {!soon && hasCredit && half && (
                  <span className="small" style={{ display: 'block', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                    Your price with referral credit: ~{half}
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
              ) : soon ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ width: '100%', marginTop: '0.5rem', opacity: 0.7 }}
                  disabled
                >
                  Coming soon
                </button>
              ) : (
                <button
                  className={`btn ${p.id === 'counsel' ? 'btn-primary' : 'btn-ghost'}`}
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
                      : user?.planActive &&
                          user?.plan &&
                          user.plan !== 'free' &&
                          user.plan !== p.id &&
                          p.id !== 'free'
                        ? hasCredit
                          ? 'Upgrade with 50% credit'
                          : 'Upgrade (prorated)'
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
            <option value="family">Family</option>
            <option value="diaspora">Diaspora</option>
            <option value="care_waitlist">City care (notify me)</option>
            <option value="counsel">Counsel / law firm</option>
            <option value="caregiver">I provide care</option>
          </select>
        </div>
        <button className="btn btn-primary">Request onboarding</button>
      </form>
    </section>
  );
}
