import { Link } from 'react-router-dom';

export function isPlanLimitError(err) {
  if (err?.status === 402) return true;
  if (err?.data?.code === 'PLAN_LIMIT') return true;
  return /free plan|upgrade on pricing|vault is full|allows \d+ estate|diaspora|cross-border|india \+ (us|uk)|care network|nurses|maids/i.test(
    err?.message || ''
  );
}

export function upgradeReasonFromError(err, fallback = 'items') {
  const plan = err?.data?.upgradePlan;
  if (plan === 'diaspora' || plan === 'diaspora_care') return 'diaspora';
  if (plan === 'care' || plan === 'family_care') return 'care';
  if (plan === 'family') return fallback === 'estate' ? 'estate' : 'items';
  if (/family \+ care|diaspora \+ care|nurses|maids/i.test(err?.message || '')) return 'care';
  if (/diaspora|cross-border|india \+ (us|uk)/i.test(err?.message || '')) return 'diaspora';
  if (/estate/i.test(err?.message || '')) return 'estate';
  return fallback;
}

const COPY = {
  items: {
    plan: 'family',
    title: 'Free vault is full',
    body: 'You’ve used all 5 Life Map items. Family unlocks unlimited vault, sibling invites, and counsel-ready briefs — ₹1,499/year.',
    features: ['Unlimited Life Map items', 'Invite siblings + WhatsApp share', 'Retain counsel with a clean brief'],
    cta: 'Upgrade to Family — ₹1,499/yr',
    href: '/pricing?plan=family',
    note: 'Abroad with India+US / India+UK pathways? Choose Diaspora on Pricing. City care is a separate 2× add-on.',
  },
  estate: {
    plan: 'family',
    title: 'Free plan: one parent',
    body: 'Map another parent or relative with Family — unlimited vault items, invites, and counsel retain. ₹1,499/year.',
    features: ['Unlimited Life Map items', 'Invite siblings + WhatsApp share', 'Retain counsel with a clean brief'],
    cta: 'Upgrade to Family — ₹1,499/yr',
    href: '/pricing?plan=family',
    note: 'Need India+US or India+UK? Diaspora is ₹12,499/yr — or Diaspora + Care at ₹24,998.',
  },
  near: {
    plan: 'family',
    title: 'Almost at the free limit',
    body: 'Free includes 5 vault items. Upgrade to Family before you hit the wall — so banks, LIC, and property all fit in one map.',
    features: ['Unlimited Life Map items', 'Invite siblings + WhatsApp share', 'Retain counsel with a clean brief'],
    cta: 'Upgrade to Family — ₹1,499/yr',
    href: '/pricing?plan=family',
    note: 'Want city nurses & maids too? Family + Care is ₹2,998/yr (2×).',
  },
  diaspora: {
    plan: 'diaspora',
    title: 'Cross-border packs need Diaspora',
    body: 'India + US / India + UK pathways need Diaspora (₹12,499/yr). Add Care at 2× for city nurses & maids.',
    features: [
      'Everything in Family',
      'India + US and India + UK packs',
      'NRI / cross-border execution pathway',
    ],
    cta: 'Upgrade to Diaspora — ₹12,499/yr',
    href: '/pricing?plan=diaspora',
    note: 'Need city care as well? Diaspora + Care is ₹24,998/yr.',
    secondaryCta: 'Diaspora + Care — ₹24,998/yr',
    secondaryHref: '/pricing?plan=diaspora_care',
  },
  care: {
    plan: 'family',
    title: 'City care needs a Care plan',
    body: 'Nurses, maids, and attendants unlock with Family + Care or Diaspora + Care — double the base Family / Diaspora price.',
    features: [
      'Browse caregivers by city & role',
      'Phone numbers unlocked',
      'Save into Care at home vault',
    ],
    cta: 'Family + Care — ₹2,998/yr',
    href: '/pricing?plan=family_care',
    note: 'Abroad with cross-border packs? Diaspora + Care is ₹24,998/yr.',
    secondaryCta: 'Diaspora + Care — ₹24,998/yr',
    secondaryHref: '/pricing?plan=diaspora_care',
  },
  abroad_checkout: {
    plan: 'diaspora',
    title: 'Living outside India?',
    body: 'Family is India vault + siblings. Diaspora adds India+US / India+UK pathways. Add Care (2×) on either if you want city nurses & maids.',
    features: [
      'India + US / India + UK execution packs',
      'Everything in Family included',
      'Pay with international card from abroad',
    ],
    cta: 'Choose Diaspora — ₹12,499/yr',
    href: '/pricing?plan=diaspora',
    note: null,
    secondaryCta: 'Continue with Family — ₹1,499/yr',
    secondaryHref: null,
  },
};

export default function UpgradeGate({
  open,
  onClose,
  reason = 'items',
  onSecondary,
  onPrimary,
}) {
  if (!open) return null;
  const copy = COPY[reason] || COPY.items;

  return (
    <div
      className="upgrade-gate"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-gate-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="upgrade-gate-panel">
        <p className="small muted" style={{ margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>
          {copy.plan === 'diaspora' ? 'Diaspora' : 'Upgrade'}
        </p>
        <h2 id="upgrade-gate-title" className="display" style={{ fontSize: '1.85rem', margin: '0.35rem 0 0.55rem' }}>
          {copy.title}
        </h2>
        <p className="muted" style={{ marginTop: 0, lineHeight: 1.55 }}>
          {copy.body}
        </p>
        <ul className="upgrade-gate-list">
          {copy.features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        {copy.note ? (
          <p className="small muted" style={{ margin: '0 0 1rem' }}>
            {copy.note}
          </p>
        ) : (
          <div style={{ height: '0.5rem' }} />
        )}
        <div className="upgrade-gate-actions">
          {onPrimary ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                onClose?.();
                onPrimary();
              }}
            >
              {copy.cta}
            </button>
          ) : (
            <Link className="btn btn-primary" to={copy.href} onClick={onClose}>
              {copy.cta}
            </Link>
          )}
          {copy.secondaryCta ? (
            copy.secondaryHref ? (
              <Link className="btn btn-ghost" to={copy.secondaryHref} onClick={onClose}>
                {copy.secondaryCta}
              </Link>
            ) : (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  onClose?.();
                  onSecondary?.();
                }}
              >
                {copy.secondaryCta}
              </button>
            )
          ) : (
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Not now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
