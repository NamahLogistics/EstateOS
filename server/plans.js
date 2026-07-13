/** Plan gates for Free / Family / Diaspora / Counsel — annual renewal */

import { mutate } from './db.js';

export const FREE_MAX_ESTATES = 1;
export const FREE_MAX_ITEMS = 5;
export const PLAN_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
export const PLAN_YEAR_DAYS = 365;
export const RENEWAL_WARN_DAYS = 30;

/** Annual list prices in paise — keep in sync with billing PLAN_AMOUNTS defaults */
export const PLAN_LIST_PAISE = {
  family: 149900,
  family_care: 299800,
  diaspora: 1249900,
  diaspora_care: 2499800,
  counsel: 149900,
  care: 299800,
};

export function planListPaise(plan) {
  return PLAN_LIST_PAISE[plan] || 0;
}

/**
 * Quote for checkout: new/renew (full year + stack) vs mid-year upgrade (prorated delta, keep expiry).
 * Downgrades while active are rejected.
 */
export function quotePlanChange(user, targetPlan, amounts = PLAN_LIST_PAISE) {
  applyPlanExpiryInPlace(user);
  const fullAmount = amounts[targetPlan];
  if (!fullAmount) {
    const err = new Error('Unknown plan');
    err.status = 400;
    throw err;
  }

  const active = userHasPaidAccess(user);
  const fromPlan = user?.plan || 'free';
  const fromAmount = active ? amounts[fromPlan] || 0 : 0;
  const samePlan =
    active && (fromPlan === targetPlan || (fromPlan === 'care' && targetPlan === 'family_care'));

  if (!active || fromPlan === 'free' || samePlan) {
    return {
      kind: samePlan ? 'renew' : 'new',
      fromPlan: active ? fromPlan : 'free',
      toPlan: targetPlan,
      amount: fullAmount,
      fullAmount,
      keepExpiresAt: null,
      daysLeft: null,
    };
  }

  if (fullAmount < fromAmount) {
    const err = new Error(
      `Downgrades apply at renewal. You stay on ${fromPlan} until ${user.planExpiresAt ? new Date(user.planExpiresAt).toLocaleDateString() : 'expiry'}, then choose a lower plan.`
    );
    err.status = 400;
    err.code = 'DOWNGRADE_AT_RENEWAL';
    throw err;
  }

  if (fullAmount === fromAmount && fromPlan !== targetPlan) {
    // Lateral switch (same price) — no charge, keep expiry
    return {
      kind: 'lateral',
      fromPlan,
      toPlan: targetPlan,
      amount: 0,
      fullAmount,
      keepExpiresAt: user.planExpiresAt,
      daysLeft: Math.ceil(
        Math.max(0, new Date(user.planExpiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
      ),
    };
  }

  // Upgrade: pay prorated difference for remaining days; keep same end date
  const expiresMs = user.planExpiresAt ? new Date(user.planExpiresAt).getTime() : 0;
  const daysLeft = Math.max(0, Math.ceil((expiresMs - Date.now()) / (24 * 60 * 60 * 1000)));
  const fraction = Math.min(1, daysLeft / PLAN_YEAR_DAYS);
  const delta = fullAmount - fromAmount;
  let amount = Math.round(delta * fraction);
  if (delta > 0 && amount > 0 && amount < 100) amount = 100; // Razorpay ₹1 minimum

  return {
    kind: 'upgrade',
    fromPlan,
    toPlan: targetPlan,
    amount,
    fullAmount,
    deltaFull: delta,
    keepExpiresAt: user.planExpiresAt,
    daysLeft,
  };
}

export function isPaidPlanName(plan) {
  return (
    plan === 'family' ||
    plan === 'diaspora' ||
    plan === 'counsel' ||
    plan === 'care' ||
    plan === 'family_care' ||
    plan === 'diaspora_care'
  );
}

/** @deprecated prefer userHasPaidAccess(user) — string-only checks ignore expiry */
export function isPaidPlan(plan) {
  return isPaidPlanName(plan);
}

export function effectivePlanExpiresAt(user) {
  if (!user || !isPaidPlanName(user.plan)) return null;
  if (user.planExpiresAt) return user.planExpiresAt;
  if (user.planPaidAt) {
    return new Date(new Date(user.planPaidAt).getTime() + PLAN_YEAR_MS).toISOString();
  }
  return null;
}

export function userHasPaidAccess(user) {
  if (!user || !isPaidPlanName(user.plan)) return false;
  const expires = effectivePlanExpiresAt(user);
  if (!expires) return false;
  return new Date(expires) > new Date();
}

/** City leads + approach — Counsel Pro only (not Family/Diaspora). */
export function userHasCounselPro(user) {
  return Boolean(user && user.plan === 'counsel' && userHasPaidAccess(user));
}

/**
 * City nurses / maids — Family+Care or Diaspora+Care only (2× base plans).
 * Legacy `care` still unlocks. Base Family/Diaspora do not.
 */
export function userHasCareNetwork(user) {
  if (!user || !userHasPaidAccess(user)) return false;
  return user.plan === 'family_care' || user.plan === 'diaspora_care' || user.plan === 'care';
}

export function userHasDiasporaPack(user) {
  if (!user || !userHasPaidAccess(user)) return false;
  return user.plan === 'diaspora' || user.plan === 'diaspora_care';
}

export const MAX_OPEN_APPROACHES_PER_LAWYER = 10;
export const DEFAULT_MAX_APPROACHES_PER_LISTING = 5;

/**
 * Backfill planExpiresAt for legacy paid users; lapse to free when year is over.
 * Mutates the user object in place. Returns true if persisted fields changed.
 */
export function applyPlanExpiryInPlace(user, now = new Date()) {
  if (!user) return false;
  let changed = false;

  if (isPaidPlanName(user.plan) && !user.planExpiresAt) {
    const start = user.planPaidAt ? new Date(user.planPaidAt).getTime() : now.getTime();
    user.planExpiresAt = new Date(start + PLAN_YEAR_MS).toISOString();
    changed = true;
  }

  if (
    isPaidPlanName(user.plan) &&
    user.planExpiresAt &&
    new Date(user.planExpiresAt).getTime() <= now.getTime()
  ) {
    user.previousPlan = user.plan;
    user.planLapsedAt = now.toISOString();
    user.plan = 'free';
    changed = true;
  }

  return changed;
}

export function planPublicFields(user) {
  if (!user) {
    return {
      plan: 'free',
      planExpiresAt: null,
      planActive: false,
      daysUntilExpiry: null,
      needsRenewal: false,
    };
  }
  applyPlanExpiryInPlace(user);
  const expiresAt = isPaidPlanName(user.plan) ? user.planExpiresAt || null : user.planExpiresAt || null;
  const active = userHasPaidAccess(user);
  let daysUntilExpiry = null;
  if (active && expiresAt) {
    daysUntilExpiry = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  }
  return {
    plan: user.plan || 'free',
    planExpiresAt: expiresAt,
    planActive: active,
    daysUntilExpiry,
    needsRenewal: active && daysUntilExpiry != null && daysUntilExpiry <= RENEWAL_WARN_DAYS,
    previousPlan: user.previousPlan || null,
    planLapsedAt: user.planLapsedAt || null,
  };
}

/** Compute new expiry when activating or renewing (stacks remaining time). */
export function nextPlanExpiresAt(user, from = new Date()) {
  const now = from.getTime();
  const currentEnd = user?.planExpiresAt ? new Date(user.planExpiresAt).getTime() : 0;
  const base = currentEnd > now && isPaidPlanName(user?.plan) ? currentEnd : now;
  return new Date(base + PLAN_YEAR_MS).toISOString();
}

export function ownerHasPaidPlan(store, estate) {
  const owner = store.users.find((u) => u.id === estate.ownerId);
  if (!owner) return false;
  if (applyPlanExpiryInPlace(owner)) {
    mutate((s) => {
      const u = s.users.find((x) => x.id === owner.id);
      if (u) applyPlanExpiryInPlace(u);
    });
  }
  return userHasPaidAccess(owner);
}

export function canUseCrossBorderPack(userOrPlan) {
  if (userOrPlan && typeof userOrPlan === 'object') {
    return userHasDiasporaPack(userOrPlan);
  }
  return userOrPlan === 'diaspora' || userOrPlan === 'diaspora_care';
}

export function assertCanCreateEstate(store, user) {
  applyPlanExpiryInPlace(user);
  if (user.accountType === 'lawyer' || user.accountType === 'care' || userHasPaidAccess(user)) return;
  const owned = store.estates.filter((e) => e.ownerId === user.id).length;
  if (owned >= FREE_MAX_ESTATES) {
    const err = new Error(
      `Free plan allows ${FREE_MAX_ESTATES} estate. Upgrade to Family or Diaspora on Pricing.`
    );
    err.status = 402;
    err.code = 'PLAN_LIMIT';
    err.upgradePlan = 'family';
    throw err;
  }
}

export function assertCanAddItems(store, user, estateId, addCount = 1) {
  const estate = store.estates.find((e) => e.id === estateId);
  if (!estate) {
    const err = new Error('Estate not found');
    err.status = 404;
    throw err;
  }
  applyPlanExpiryInPlace(user);
  if (user.accountType === 'lawyer' || ownerHasPaidPlan(store, estate)) return;
  const count = store.items.filter((i) => i.estateId === estateId).length;
  if (count + addCount > FREE_MAX_ITEMS) {
    const remaining = Math.max(0, FREE_MAX_ITEMS - count);
    const err = new Error(
      remaining === 0
        ? `Free plan limit: ${FREE_MAX_ITEMS} Life Map items. Upgrade on Pricing for unlimited vault.`
        : `Free plan allows ${FREE_MAX_ITEMS} items (${remaining} left). Upgrade for unlimited.`
    );
    err.status = 402;
    err.code = 'PLAN_LIMIT';
    err.upgradePlan = 'family';
    throw err;
  }
}

export function remainingItemSlots(store, user, estateId) {
  const estate = store.estates.find((e) => e.id === estateId);
  if (!estate) return 0;
  applyPlanExpiryInPlace(user);
  if (user.accountType === 'lawyer' || ownerHasPaidPlan(store, estate)) return Infinity;
  const count = store.items.filter((i) => i.estateId === estateId).length;
  return Math.max(0, FREE_MAX_ITEMS - count);
}

export function normalizeCountryPack(pack, userOrPlan, { strict = false } = {}) {
  const allowed = ['IN', 'IN_US', 'IN_UK'];
  let value = allowed.includes(pack) ? pack : 'IN';
  if ((value === 'IN_US' || value === 'IN_UK') && !canUseCrossBorderPack(userOrPlan)) {
    if (strict) {
      const err = new Error(
        'India + US / India + UK packs need Diaspora or Diaspora+Care. Upgrade on Pricing.'
      );
      err.status = 402;
      err.code = 'PLAN_LIMIT';
      err.upgradePlan = 'diaspora';
      throw err;
    }
    value = 'IN';
  }
  return value;
}
