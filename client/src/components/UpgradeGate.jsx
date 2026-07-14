import { Link } from 'react-router-dom';
import { useCareNetwork } from '../careNetwork.js';

export function isPlanLimitError(err) {
  if (err?.data?.code === 'CARE_COMING_SOON' || err?.data?.comingSoon) return false;
  if (/coming soon/i.test(err?.message || '')) return false;
  if (err?.status === 402) return true;
  if (err?.data?.code === 'PLAN_LIMIT') return true;
  return /free plan|upgrade on pricing|vault is full|allows \d+ estate|diaspora|cross-border|india \+ (us|uk)/i.test(
    err?.message || ''
  );
}

export function upgradeReasonFromError(err, fallback = 'items') {
  if (err?.data?.code === 'CARE_COMING_SOON' || /coming soon/i.test(err?.message || '')) {
    return 'care';
  }
  const plan = err?.data?.upgradePlan;
  if (plan === 'diaspora' || plan === 'diaspora_care') return 'diaspora';
  if (plan === 'care' || plan === 'family_care') return 'care';
  if (plan === 'family') return fallback === 'estate' ? 'estate' : 'items';
  if (/family \+ care|diaspora \+ care|nurses|maids/i.test(err?.message || '')) return 'care';
  if (/diaspora|cross-border|india \+ (us|uk)/i.test(err?.message || '')) return 'diaspora';
  if (/estate/i.test(err?.message || '')) return 'estate';
  return fallback;
}

function copyFor(reason, careComingSoon, gift) {
  const careNote = careComingSoon
    ? 'City care network is coming soon.'
    : 'Want city nurses & maids? Family + Care / Diaspora + Care on Pricing.';
  const owner = gift?.ownerName || 'the owner';
  const giftEstateId = gift?.estateId;
  const giftQs = giftEstateId
    ? `&giftEstate=${encodeURIComponent(giftEstateId)}`
    : '';

  const base = {
    items: {
      plan: 'family',
      title: gift && !gift.iAmOwner ? `This vault is on ${owner}'s free plan` : 'Free vault is full',
      body:
        gift && !gift.iAmOwner
          ? `You’ve hit the shared 12-item limit on ${gift.estateName || 'this map'}. Gift Family to ${owner} (unlocks this vault), or start your own Life Map for you and your kids.`
          : 'You’ve used all 12 Life Map items. Family unlocks unlimited vault, sibling invites, and counsel-ready briefs — ₹1,499/year.',
      features:
        gift && !gift.iAmOwner
          ? [
              `Gift Family — ${owner} becomes paid for this vault`,
              'Or start your own Life Map (you own it, you pay)',
              'Sibling invites + unlimited items on Family',
            ]
          : ['Unlimited Life Map items', 'Invite siblings + WhatsApp share', 'Retain counsel with a clean brief'],
      cta:
        gift && !gift.iAmOwner
          ? `Gift Family to ${owner} — ₹1,499/yr`
          : 'Upgrade to Family — ₹1,499/yr',
      href: `/pricing?plan=family&checkout=1${giftQs}`,
      note:
        gift && !gift.iAmOwner
          ? `You pay; ${owner}'s vault unlocks. Your own maps stay separate.`
          : `Abroad with India+US / India+UK pathways? Choose Diaspora on Pricing. ${careNote}`,
      secondaryCta: gift && !gift.iAmOwner ? 'Start my own Life Map' : null,
      secondaryHref: null,
      secondaryAction: gift && !gift.iAmOwner ? 'own_map' : null,
    },
    estate: {
      plan: 'family',
      title: 'Free plan: one parent',
      body: 'Map another parent or relative with Family — unlimited vault items, invites, and counsel retain. ₹1,499/year.',
      features: ['Unlimited Life Map items', 'Invite siblings + WhatsApp share', 'Retain counsel with a clean brief'],
      cta: 'Upgrade to Family — ₹1,499/yr',
      href: '/pricing?plan=family&checkout=1',
      note: `Need India+US or India+UK? Diaspora is ₹12,499/yr. ${careNote}`,
    },
    near: {
      plan: 'family',
      title: gift && !gift.iAmOwner ? `Almost at ${owner}'s free limit` : 'Almost at the free limit',
      body:
        gift && !gift.iAmOwner
          ? `Free includes 12 vault items on this shared map. Gift Family to ${owner}, or start your own Life Map.`
          : 'Free includes 12 vault items. Upgrade to Family before you hit the wall — so banks, LIC, and property all fit in one map.',
      features:
        gift && !gift.iAmOwner
          ? [`Gift unlocks ${gift.estateName || 'this vault'} for everyone`, 'Or own a separate map for your kids']
          : ['Unlimited Life Map items', 'Invite siblings + WhatsApp share', 'Retain counsel with a clean brief'],
      cta:
        gift && !gift.iAmOwner
          ? `Gift Family to ${owner} — ₹1,499/yr`
          : 'Upgrade to Family — ₹1,499/yr',
      href: `/pricing?plan=family&checkout=1${giftQs}`,
      note:
        gift && !gift.iAmOwner
          ? 'Payment activates the vault owner’s plan — not a separate personal plan for you.'
          : careComingSoon
            ? 'City nurses & maids (Family + Care) — coming soon.'
            : 'Want city nurses & maids too? Family + Care is ₹2,998/yr (2×).',
      secondaryCta: gift && !gift.iAmOwner ? 'Start my own Life Map' : null,
      secondaryAction: gift && !gift.iAmOwner ? 'own_map' : null,
    },
    diaspora: {
      plan: 'diaspora',
      title: 'Cross-border packs need Diaspora',
      body: 'India + US / India + UK pathways need Diaspora (₹12,499/yr).',
      features: [
        'Everything in Family',
        'India + US and India + UK packs',
        'NRI / cross-border execution pathway',
      ],
      cta:
        gift && !gift.iAmOwner
          ? `Gift Diaspora to ${owner} — ₹12,499/yr`
          : 'Upgrade to Diaspora — ₹12,499/yr',
      href: `/pricing?plan=diaspora&checkout=1${giftQs}`,
      note: careComingSoon
        ? 'City care add-on (Diaspora + Care) is coming soon.'
        : 'Need city care as well? Diaspora + Care is ₹24,998/yr.',
      secondaryCta: gift && !gift.iAmOwner ? 'Start my own Life Map' : careComingSoon ? null : 'Diaspora + Care — ₹24,998/yr',
      secondaryHref:
        gift && !gift.iAmOwner ? null : careComingSoon ? null : `/pricing?plan=diaspora_care&checkout=1${giftQs}`,
      secondaryAction: gift && !gift.iAmOwner ? 'own_map' : null,
    },
    care: careComingSoon
      ? {
          plan: 'family',
          title: 'City care — coming soon',
          body: 'Nothing to unlock or pay for yet. Caregivers can join free and list their city; family browse launches later.',
          features: [
            'Caregivers join free today',
            'List city, role, phone, rate',
            'No Family + Care purchase available yet',
          ],
          cta: 'Invite caregiver — free',
          href: '/auth?mode=register&type=care',
          note: 'Family + Care / Diaspora + Care checkout is closed until launch.',
          secondaryCta: 'WhatsApp invite',
          secondaryHref: '/app#grow',
        }
      : {
          plan: 'family',
          title: 'City care needs a Care plan',
          body: 'Nurses, maids, and attendants unlock with Family + Care or Diaspora + Care — double the base Family / Diaspora price.',
          features: [
            'Browse caregivers by city & role',
            'Phone numbers unlocked',
            'Save into Care at home vault',
          ],
          cta:
            gift && !gift.iAmOwner
              ? `Gift Family + Care to ${owner}`
              : 'Family + Care — ₹2,998/yr',
          href: `/pricing?plan=family_care&checkout=1${giftQs}`,
          note: 'Abroad with cross-border packs? Diaspora + Care is ₹24,998/yr.',
          secondaryCta: gift && !gift.iAmOwner ? 'Start my own Life Map' : 'Diaspora + Care — ₹24,998/yr',
          secondaryHref: gift && !gift.iAmOwner ? null : `/pricing?plan=diaspora_care&checkout=1${giftQs}`,
          secondaryAction: gift && !gift.iAmOwner ? 'own_map' : null,
        },
    abroad_checkout: {
      plan: 'diaspora',
      title: 'Living outside India?',
      body: careComingSoon
        ? 'Family is India vault + siblings. Diaspora adds India+US / India+UK pathways.'
        : 'Family is India vault + siblings. Diaspora adds India+US / India+UK pathways. Add Care (2×) on either if you want city nurses & maids.',
      features: [
        'India + US / India + UK execution packs',
        'Everything in Family included',
        'Pay with international card from abroad',
      ],
      cta: 'Choose Diaspora — ₹12,499/yr',
      href: '/pricing?plan=diaspora&checkout=1',
      note: careComingSoon ? 'City care network is coming soon — not for purchase yet.' : null,
      secondaryCta: 'Continue with Family — ₹1,499/yr',
      secondaryHref: null,
    },
  };

  return base[reason] || base.items;
}

export default function UpgradeGate({
  open,
  onClose,
  reason = 'items',
  onSecondary,
  onPrimary,
  gift = null,
  onStartOwnMap,
}) {
  const { comingSoon: careComingSoon } = useCareNetwork();
  if (!open) return null;
  const copy = copyFor(reason, careComingSoon, gift);

  function handleSecondary() {
    onClose?.();
    if (copy.secondaryAction === 'own_map' && onStartOwnMap) {
      onStartOwnMap();
      return;
    }
    onSecondary?.();
  }

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
        <p
          className="small muted"
          style={{ margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}
        >
          {reason === 'care' && careComingSoon
            ? 'Coming soon'
            : gift && !gift.iAmOwner
              ? 'Gift or own map'
              : copy.plan === 'diaspora'
                ? 'Diaspora'
                : 'Upgrade'}
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
              <button type="button" className="btn btn-ghost" onClick={handleSecondary}>
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
