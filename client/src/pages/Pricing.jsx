import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useCareNetwork } from '../careNetwork.js';
import { track } from '../analytics.js';
import ReferralCard from '../components/ReferralCard.jsx';
import UpgradeGate from '../components/UpgradeGate.jsx';

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    blurb: 'Start mapping today',
    features: ['1 estate / parent', '12 Life Map items', 'Unlock rules', 'India checklist on unlock'],
    cta: 'Start free',
  },
  {
    id: 'family',
    name: 'Family',
    price: '$19/yr',
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
    price: '$39/yr',
    blurbLive: '2× Family — save local care contacts in the vault',
    blurbSoon: 'Local care contacts — coming soon',
    features: [
      'Everything in Family',
      'Save nurse / maid contacts to the vault',
      'Phone numbers for people you choose',
      'Continuity for care at home',
    ],
    ctaLive: 'Get Family + Care',
    carePlan: true,
  },
  {
    id: 'diaspora',
    name: 'Diaspora',
    price: '$149/yr',
    blurb: 'You’re abroad — parents’ papers are in India',
    features: [
      'Everything in Family',
      'India + US / India + UK packs',
      'NRI / cross-border pathway',
      'Pay with card worldwide (USD)',
    ],
    cta: 'Get Diaspora',
  },
  {
    id: 'diaspora_care',
    name: 'Diaspora + Care',
    price: '$299/yr',
    blurbLive: '2× Diaspora — cross-border + care contacts',
    blurbSoon: 'Cross-border + care contacts — coming soon',
    features: [
      'Everything in Diaspora',
      'Save local care contacts to the vault',
      'Phone numbers for people you choose',
      'Continuity for care at home',
    ],
    ctaLive: 'Get Diaspora + Care',
    carePlan: true,
  },
  {
    id: 'counsel',
    name: 'Counsel Pro',
    price: '$19/yr',
    blurb: 'For advocates — matter desk & briefs',
    features: [
      'Structured succession matter briefs',
      'Collaborate when a family retains you',
      'Vault stays locked until they accept',
      'No free-form legal advice marketplace',
    ],
    cta: 'Get Counsel Pro',
  },
];

function referralHalfPrice(planId) {
  if (planId === 'family' || planId === 'counsel') return '$9.50';
  if (planId === 'family_care') return '$19.50';
  if (planId === 'diaspora') return '$74.50';
  if (planId === 'diaspora_care') return '$149.50';
  return null;
}

function loadPaddle() {
  return new Promise((resolve, reject) => {
    if (window.Paddle) return resolve(window.Paddle);
    const script = document.createElement('script');
    script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    script.onload = () => resolve(window.Paddle);
    script.onerror = () => reject(new Error('Failed to load Paddle'));
    document.body.appendChild(script);
  });
}

export default function Pricing() {
  const { user, api, toast, setUser } = useAuth();
  const { comingSoon: careComingSoon } = useCareNetwork();
  const [searchParams] = useSearchParams();
  const [lead, setLead] = useState({ name: '', email: '', interest: 'family' });
  const [busy, setBusy] = useState(false);
  const [credits, setCredits] = useState(0);
  const [abroadGateOpen, setAbroadGateOpen] = useState(false);
  const [billing, setBilling] = useState(null);
  const highlight = searchParams.get('plan') || '';

  useEffect(() => {
    if (!user) {
      setCredits(0);
      setBilling(null);
      return;
    }
    api('/api/billing/referral')
      .then((r) => setCredits(r.referralDiscountCredits || 0))
      .catch(() => setCredits(user.referralDiscountCredits || 0));
    api('/api/billing/status')
      .then((s) => setBilling(s))
      .catch(() =>
        setBilling({
          autoRenew: user.autoRenew,
          subscriptionStatus: user.subscriptionStatus,
          planExpiresAt: user.planExpiresAt,
          plan: user.plan,
        })
      );
  }, [user?.id]);

  useEffect(() => {
    if (!highlight) return;
    const el = document.getElementById(`plan-${highlight}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlight]);

  useEffect(() => {
    if (!user) return;
    if (searchParams.get('checkout') !== '1') return;
    const plan = searchParams.get('plan');
    if (!plan || plan === 'free') return;
    const key = `hr_autocheckout_${plan}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    track('checkout_auto_after_auth', { plan });
    if (plan === 'family') setAbroadGateOpen(true);
    else checkout(plan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function applyVerified(verified, data) {
    if (!verified.gifted) {
      setUser({
        ...user,
        plan: verified.plan,
        planExpiresAt: verified.planExpiresAt,
        planActive: verified.planActive,
        daysUntilExpiry: verified.daysUntilExpiry,
        needsRenewal: verified.needsRenewal,
        autoRenew: verified.autoRenew,
        subscriptionStatus: verified.subscriptionStatus,
        referralDiscountCredits: verified.referralDiscountCredits ?? 0,
      });
    } else {
      setUser({
        ...user,
        referralDiscountCredits: verified.referralDiscountCredits ?? user.referralDiscountCredits,
      });
    }
    setCredits(verified.referralDiscountCredits ?? 0);
    setBilling((b) => ({
      ...(b || {}),
      ...verified,
      autoRenew: verified.autoRenew,
      subscriptionStatus: verified.subscriptionStatus,
    }));
    toast(
      verified.gifted
        ? `Gifted ${verified.plan} to ${verified.beneficiaryName || 'the vault owner'}`
        : verified.kind === 'upgrade'
          ? `Upgraded — same renewal ${verified.planExpiresAt ? new Date(verified.planExpiresAt).toLocaleDateString() : ''}`
          : verified.autoRenew || data.autoRenew
            ? `Payment successful — ${verified.plan} auto-renews yearly until you cancel`
            : verified.referralDiscount
              ? `Paid with 50% referral reward — ${verified.plan} until ${verified.planExpiresAt ? new Date(verified.planExpiresAt).toLocaleDateString() : 'next year'}`
              : `Payment successful — ${verified.plan} until ${verified.planExpiresAt ? new Date(verified.planExpiresAt).toLocaleDateString() : 'next year'}`
    );
    if (verified.gifted && verified.giftEstateId) {
      window.location.assign(`/app/estates/${verified.giftEstateId}`);
    }
  }

  async function checkout(plan) {
    if (plan === 'free') {
      window.location.assign(user ? '/app' : '/auth?mode=register');
      return;
    }
    if (careComingSoon && (plan === 'family_care' || plan === 'diaspora_care' || plan === 'care')) {
      toast('City care network is coming soon — not available to purchase yet');
      return;
    }
    if (!user) {
      track('checkout_needs_auth', { plan });
      window.location.assign(`/auth?mode=register&plan=${encodeURIComponent(plan)}&checkout=1`);
      return;
    }
    const giftEstateId = searchParams.get('giftEstate') || undefined;
    track('checkout_start', { plan, gift: Boolean(giftEstateId) });
    setBusy(true);
    try {
      const data = await api('/api/billing/checkout', {
        method: 'POST',
        body: { plan, ...(giftEstateId ? { giftEstateId } : {}) },
      });
      if (data.mode === 'paddle') {
        const Paddle = await loadPaddle();
        Paddle.Environment.set(data.environment === 'production' ? 'production' : 'sandbox');
        Paddle.Initialize({
          token: data.clientToken,
          eventCallback: async (event) => {
            if (event?.name === 'checkout.closed' || event?.name === 'checkout.error') {
              setBusy(false);
              return;
            }
            if (event?.name !== 'checkout.completed') return;
            try {
              const txnId =
                event?.data?.transaction_id ||
                event?.data?.id ||
                data.transactionId;
              const verified = await api('/api/billing/verify', {
                method: 'POST',
                body: { transactionId: txnId, plan: data.plan },
              });
              await applyVerified(verified, data);
            } catch (err) {
              toast(err.message);
            } finally {
              setBusy(false);
            }
          },
        });
        Paddle.Checkout.open({
          transactionId: data.transactionId,
          customer: data.customer?.email
            ? { email: data.customer.email }
            : undefined,
        });
      } else {
        if (!data.gift) {
          setUser({
            ...user,
            plan: data.plan,
            planExpiresAt: data.planExpiresAt,
            planActive: true,
          });
        }
        toast(data.message || 'Plan updated');
        if (data.gift?.estateId) {
          window.location.assign(`/app/estates/${data.gift.estateId}`);
        }
        setBusy(false);
      }
    } catch (err) {
      toast(err.message);
      setBusy(false);
    }
  }

  async function cancelAutoRenew() {
    if (!user) return;
    if (
      !window.confirm(
        'Stop yearly auto-renew? You keep access until the end of the period already paid.'
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const data = await api('/api/billing/cancel-subscription', { method: 'POST', body: {} });
      setUser({
        ...user,
        autoRenew: data.autoRenew,
        subscriptionStatus: data.subscriptionStatus,
        subscriptionCancelAt: data.subscriptionCancelAt,
        needsRenewal: data.needsRenewal,
      });
      setBilling((b) => ({ ...(b || {}), ...data }));
      toast(data.message || 'Auto-renew cancelled');
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
  const giftEstateId = searchParams.get('giftEstate');

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
        Annual plans in USD via Paddle — your card is charged every year until you cancel. Mid-year
        upgrades: pay only the difference for days left. Downgrades wait until renewal.
      </p>
      {(billing?.autoRenew ||
        billing?.subscriptionStatus === 'cancel_at_period_end' ||
        user?.autoRenew) &&
      user ? (
        <div
          className="card"
          style={{
            marginTop: '1rem',
            maxWidth: 640,
            padding: '1rem 1.15rem',
            borderColor: 'rgba(47, 107, 82, 0.35)',
          }}
        >
          <strong>
            {billing?.autoRenew || user?.autoRenew
              ? 'Auto-renew is on'
              : 'Auto-renew ending'}
          </strong>
          <p className="small muted" style={{ margin: '0.35rem 0 0.75rem', lineHeight: 1.5 }}>
            {billing?.autoRenew || user?.autoRenew
              ? `We’ll charge yearly for ${billing?.plan || user.plan}. Paid through ${
                  billing?.planExpiresAt || user.planExpiresAt
                    ? new Date(billing?.planExpiresAt || user.planExpiresAt).toLocaleDateString()
                    : 'this period'
                }.`
              : `No further charges. Access until ${
                  billing?.planExpiresAt || user.planExpiresAt
                    ? new Date(billing?.planExpiresAt || user.planExpiresAt).toLocaleDateString()
                    : 'period end'
                }.`}
          </p>
          {(billing?.autoRenew || user?.autoRenew) && (
            <button type="button" className="btn ghost" disabled={busy} onClick={cancelAutoRenew}>
              Cancel auto-renew
            </button>
          )}
        </div>
      ) : null}
      {giftEstateId ? (
        <div
          className="card"
          style={{
            marginTop: '1rem',
            maxWidth: 640,
            padding: '1rem 1.15rem',
            borderColor: 'rgba(47, 107, 82, 0.4)',
            background: 'rgba(220, 232, 225, 0.5)',
          }}
        >
          <strong>Gifting this upgrade</strong>
          <p className="small muted" style={{ margin: '0.35rem 0 0', lineHeight: 1.5 }}>
            You pay — the vault <em>owner’s</em> plan upgrades so the shared Life Map unlocks for
            everyone on it. Your personal account plan stays separate unless you’re the owner.
          </p>
        </div>
      ) : null}

      <div
        className="card"
        style={{
          marginTop: '1rem',
          maxWidth: 640,
          padding: '1.1rem 1.2rem',
          borderColor: hasCredit ? 'rgba(47, 107, 82, 0.4)' : 'rgba(0,0,0,0.08)',
          background: hasCredit
            ? 'linear-gradient(165deg, rgba(220, 232, 225, 0.65), var(--card))'
            : 'var(--card)',
        }}
      >
        <p
          className="small muted"
          style={{ margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}
        >
          Referral credits
        </p>
        <p className="display" style={{ fontSize: '1.3rem', margin: '0.3rem 0 0.4rem' }}>
          {hasCredit
            ? `You have ${credits} credit${credits === 1 ? '' : 's'} — each is 50% off`
            : 'What a credit does'}
        </p>
        <p className="muted" style={{ margin: 0, lineHeight: 1.55 }}>
          <strong>1 credit = 50% off one payment</strong> at checkout — your Family, Diaspora, or Counsel
          Pro charge (first year, renew, or mid-year upgrade). Example: Family $19 → ~$9.50 with a
          credit; Diaspora $149 → ~$74.50. One credit is used per checkout; leftovers stay for later
          years. Credits don’t expire.
        </p>
        <p className="small muted" style={{ margin: '0.65rem 0 0', lineHeight: 1.5 }}>
          Earn credits by inviting: when someone joins with your link and later pays a plan, you get 1
          credit. Invite many → credits stack. Free joins don’t count.
        </p>
      </div>

      {careComingSoon ? (
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
      ) : (
        <div className="upgrade-limit-banner" style={{ marginTop: '1.1rem', maxWidth: 640 }}>
          <p className="small">
            <strong>Want nurse / maid contacts in the vault?</strong> Take Family + Care ($39) or Diaspora +
            Care ($299) — when that layer opens.
          </p>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: '0.45rem 0.95rem' }}
              disabled={busy}
              onClick={() => checkout('family_care')}
            >
              Family + Care
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '0.45rem 0.95rem' }}
              disabled={busy}
              onClick={() => checkout('diaspora_care')}
            >
              Diaspora + Care
            </button>
          </div>
        </div>
      )}

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
          const soon = Boolean(p.carePlan && careComingSoon);
          const featured = highlight === p.id && !soon;
          const half = referralHalfPrice(p.id);
          const blurb = soon ? p.blurbSoon || p.blurb : p.blurbLive || p.blurb;
          const cta = soon ? 'Coming soon' : p.ctaLive || p.cta;
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
                {soon ? ' · coming soon' : p.carePlan ? ' · care network' : ''}
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
                {blurb}
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
                  className={`btn ${
                    p.carePlan || p.id === 'counsel' ? 'btn-primary' : 'btn-ghost'
                  }`}
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
                          : cta}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <form
        className="card"
        style={{
          padding: '1.25rem',
          marginTop: '2rem',
          maxWidth: 520,
          opacity: 0.92,
          borderStyle: 'dashed',
        }}
        onSubmit={joinWaitlist}
      >
        <p className="display" style={{ fontSize: '1.15rem', marginTop: 0 }}>
          Stuck? Email us (optional)
        </p>
        <p className="muted small">
          Self-serve is the default — create an estate and finish housewarming in-app. Only leave a note
          if something is broken.
        </p>
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
        <button className="btn btn-ghost">Send note</button>
      </form>
    </section>
  );
}
