import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useCareNetwork } from '../careNetwork.js';
import { track } from '../analytics.js';
import ReferralCard from '../components/ReferralCard.jsx';
import UpgradeGate from '../components/UpgradeGate.jsx';
import PaymentRecoveryGate from '../components/PaymentRecoveryGate.jsx';

function planDisplayName(planId) {
  if (planId === 'diaspora') return 'Diaspora';
  if (planId === 'diaspora_care') return 'Diaspora + Care';
  if (planId === 'family_care' || planId === 'care') return 'Family + Care';
  if (planId === 'counsel') return 'Counsel Pro';
  if (planId === 'family') return 'Family';
  return 'your plan';
}

function amountLabelForPlan(planId) {
  if (planId === 'diaspora') return '₹12,499';
  if (planId === 'diaspora_care') return '₹24,998';
  if (planId === 'family_care' || planId === 'care') return '₹2,998';
  if (planId === 'counsel' || planId === 'family') return '₹1,499';
  return null;
}

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: '₹0',
    blurb: 'Start mapping today',
    features: ['1 estate / parent', '12 Life Map items', 'Unlock rules', 'India checklist on unlock'],
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
    blurbLive: '2× Family — adds city nurses & maids',
    blurbSoon: 'City nurses & maids — coming soon',
    features: [
      'Everything in Family',
      'Browse nurses / maids by city',
      'Phone numbers unlocked',
      'Save caregivers into Life Map',
    ],
    ctaLive: 'Get Family + Care',
    carePlan: true,
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
    blurbLive: '2× Diaspora — cross-border + city care',
    blurbSoon: 'Cross-border + city care — coming soon',
    features: [
      'Everything in Diaspora',
      'City nurses & maids directory',
      'Phone numbers unlocked',
      'Save caregivers into Life Map',
    ],
    ctaLive: 'Get Diaspora + Care',
    carePlan: true,
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
  const { comingSoon: careComingSoon } = useCareNetwork();
  const [searchParams] = useSearchParams();
  const [lead, setLead] = useState({ name: '', email: '', interest: 'family' });
  const [busy, setBusy] = useState(false);
  const [credits, setCredits] = useState(0);
  const [abroadGateOpen, setAbroadGateOpen] = useState(false);
  const [billing, setBilling] = useState(null);
  const [recovery, setRecovery] = useState(null);
  const [recoverBusy, setRecoverBusy] = useState(false);
  const paidHandled = useRef(false);
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

  /** Return from Razorpay Payment Link callback — activate plan if paid. */
  useEffect(() => {
    if (!user) return;
    if (searchParams.get('recovery') !== 'paid') return;
    if (paidHandled.current) return;
    const paymentLinkId = searchParams.get('razorpay_payment_link_id');
    const paymentId = searchParams.get('razorpay_payment_id');
    if (!paymentLinkId) return;
    paidHandled.current = true;
    (async () => {
      try {
        const verified = await api('/api/billing/verify-link', {
          method: 'POST',
          body: {
            razorpay_payment_link_id: paymentLinkId,
            razorpay_payment_id: paymentId,
          },
        });
        setUser({
          ...user,
          plan: verified.plan,
          planExpiresAt: verified.planExpiresAt,
          planActive: verified.planActive,
          daysUntilExpiry: verified.daysUntilExpiry,
          needsRenewal: verified.needsRenewal,
          referralDiscountCredits: verified.referralDiscountCredits ?? user.referralDiscountCredits,
        });
        setBilling((b) => ({ ...(b || {}), ...verified }));
        setCredits(verified.referralDiscountCredits ?? credits);
        toast(
          verified.gifted
            ? 'Gift payment received — vault upgraded'
            : `Payment received — ${verified.plan} is active`
        );
        track('checkout_recovery_paid', { plan: verified.plan });
        window.history.replaceState({}, '', '/pricing');
      } catch (err) {
        toast(err.message || 'Could not confirm payment yet — refresh in a minute');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, searchParams]);

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

  async function startRecovery(plan, { failReason, forceEmail = false, source = 'checkout' } = {}) {
    const giftEstateId = searchParams.get('giftEstate') || undefined;
    setRecoverBusy(true);
    try {
      const data = await api('/api/billing/recover', {
        method: 'POST',
        body: {
          plan,
          ...(giftEstateId ? { giftEstateId } : {}),
          failReason: failReason || undefined,
          forceEmail,
          source,
          email: true,
        },
      });
      setRecovery((prev) => ({
        ...(prev || {}),
        plan,
        planLabel: data.label || planDisplayName(plan),
        amountLabel:
          data.amountRupees != null
            ? `₹${Number(data.amountRupees).toLocaleString('en-IN')}`
            : amountLabelForPlan(plan),
        failReason: failReason || prev?.failReason || null,
        shortUrl: data.shortUrl,
        emailed: Boolean(data.emailed) || Boolean(prev?.emailed),
        email: data.email || user?.email,
      }));
      if (data.emailed) {
        toast(data.message || `Payment link emailed to ${data.email || user?.email}`);
      }
      track('checkout_recovery_link', {
        plan,
        reused: data.reused,
        emailed: data.emailed,
      });
      return data;
    } catch (err) {
      toast(err.message || 'Could not create recovery link');
      throw err;
    } finally {
      setRecoverBusy(false);
    }
  }

  async function handleCheckoutFailed(plan, failReason) {
    track('checkout_failed', { plan, reason: failReason || null });
    setRecovery({
      plan,
      planLabel: planDisplayName(plan),
      amountLabel: amountLabelForPlan(plan),
      failReason: failReason || null,
      shortUrl: null,
      emailed: false,
      email: user?.email,
    });
    try {
      await startRecovery(plan, { failReason, source: 'payment_failed' });
    } catch {
      /* panel still open — user can retry / request email */
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
      if (data.mode === 'razorpay' || data.mode === 'razorpay_subscription') {
        const Razorpay = await loadRazorpay();
        const options = {
          key: data.keyId,
          name: data.name,
          description: data.description,
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
                    : verified.autoRenew || data.mode === 'razorpay_subscription'
                      ? `Payment successful — ${verified.plan} auto-renews yearly until you cancel`
                      : verified.referralDiscount
                        ? `Paid with 50% referral reward — ${verified.plan} until ${verified.planExpiresAt ? new Date(verified.planExpiresAt).toLocaleDateString() : 'next year'}`
                        : `Payment successful — ${verified.plan} until ${verified.planExpiresAt ? new Date(verified.planExpiresAt).toLocaleDateString() : 'next year'}`
              );
              if (verified.gifted && verified.giftEstateId) {
                window.location.assign(`/app/estates/${verified.giftEstateId}`);
              }
            } catch (err) {
              toast(err.message);
            }
          },
        };
        if (data.mode === 'razorpay_subscription') {
          options.subscription_id = data.subscriptionId;
        } else {
          options.amount = data.amount;
          options.currency = data.currency || 'INR';
          options.order_id = data.orderId;
        }
        let checkoutSucceeded = false;
        const origHandler = options.handler;
        options.handler = async (response) => {
          checkoutSucceeded = true;
          setRecovery(null);
          await origHandler(response);
        };
        options.modal = {
          ondismiss: () => {
            if (!checkoutSucceeded) {
              track('checkout_dismissed', { plan });
            }
          },
        };
        const rzp = new Razorpay(options);
        rzp.on('payment.failed', (resp) => {
          const reason =
            resp.error?.description ||
            resp.error?.reason ||
            resp.error?.code ||
            'Payment failed';
          toast(reason);
          handleCheckoutFailed(plan, reason);
        });
        rzp.open();
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
      }
    } catch (err) {
      toast(err.message);
    } finally {
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

      <PaymentRecoveryGate
        open={Boolean(recovery)}
        onClose={() => setRecovery(null)}
        planLabel={recovery?.planLabel}
        amountLabel={recovery?.amountLabel}
        failReason={recovery?.failReason}
        userEmail={recovery?.email || user?.email}
        shortUrl={recovery?.shortUrl}
        emailed={recovery?.emailed}
        emailBusy={recoverBusy}
        recoverBusy={recoverBusy}
        onRetry={() => {
          const plan = recovery?.plan;
          setRecovery(null);
          if (plan) checkout(plan);
        }}
        onOpenLink={() => {
          if (recovery?.shortUrl) {
            track('checkout_recovery_open_link', { plan: recovery.plan });
            window.open(recovery.shortUrl, '_blank', 'noopener,noreferrer');
          }
        }}
        onResendEmail={async () => {
          if (!recovery?.plan) return;
          try {
            await startRecovery(recovery.plan, {
              failReason: recovery.failReason,
              forceEmail: true,
              source: 'resend',
            });
          } catch {
            /* toasted in startRecovery */
          }
        }}
      />

      <h1 className="display" style={{ fontSize: '2.4rem', marginBottom: '0.4rem' }}>
        Pricing
      </h1>
      <p className="muted" style={{ maxWidth: 560 }}>
        Annual plans via Razorpay — your card is charged every year until you cancel. Mid-year
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
          Pro charge (first year, renew, or mid-year upgrade). Example: Family ₹1,499 → ~₹750 with a
          credit; Diaspora ₹12,499 → ~₹6,250. One credit is used per checkout; leftovers stay for later
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
            <strong>Want nurses & maids in their city?</strong> Take Family + Care (₹2,998) or Diaspora +
            Care (₹24,998) — double the base plan.
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
