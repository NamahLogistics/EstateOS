import { Link } from 'react-router-dom';

export function isPlanLimitError(err) {
  if (err?.status === 402) return true;
  if (err?.data?.code === 'PLAN_LIMIT') return true;
  return /free plan|upgrade on pricing|vault is full|allows \d+ estate/i.test(err?.message || '');
}

const COPY = {
  items: {
    title: 'Free vault is full',
    body: 'You’ve used all 5 Life Map items. Family unlocks unlimited vault, sibling invites, and counsel-ready briefs — ₹1,499/year.',
  },
  estate: {
    title: 'Free plan: one parent',
    body: 'Map another parent or relative with Family — unlimited vault items, invites, and counsel retain. ₹1,499/year.',
  },
  near: {
    title: 'Almost at the free limit',
    body: 'Free includes 5 vault items. Upgrade to Family before you hit the wall — so banks, LIC, and property all fit in one map.',
  },
};

export default function UpgradeGate({ open, onClose, reason = 'items' }) {
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
          Upgrade
        </p>
        <h2 id="upgrade-gate-title" className="display" style={{ fontSize: '1.85rem', margin: '0.35rem 0 0.55rem' }}>
          {copy.title}
        </h2>
        <p className="muted" style={{ marginTop: 0, lineHeight: 1.55 }}>
          {copy.body}
        </p>
        <ul className="upgrade-gate-list">
          <li>Unlimited Life Map items</li>
          <li>Invite siblings + WhatsApp share</li>
          <li>Retain counsel with a clean brief</li>
        </ul>
        <p className="small muted" style={{ margin: '0 0 1rem' }}>
          Abroad with India+US / India+UK pathways? Diaspora is ₹12,499/yr on Pricing.
        </p>
        <div className="upgrade-gate-actions">
          <Link className="btn btn-primary" to="/pricing" onClick={onClose}>
            Upgrade to Family — ₹1,499/yr
          </Link>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
