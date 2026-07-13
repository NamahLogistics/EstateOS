/** Plan gates for Free / Family / Diaspora / Counsel — annual renewal */

import { mutate } from './db.js';

export const FREE_MAX_ESTATES = 1;
export const FREE_MAX_ITEMS = 5;
export const PLAN_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
export const RENEWAL_WARN_DAYS = 30;

export function isPaidPlanName(plan) {
  return plan === 'family' || plan === 'diaspora' || plan === 'counsel';
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
    return userHasPaidAccess(userOrPlan) && userOrPlan.plan === 'diaspora';
  }
  return userOrPlan === 'diaspora';
}

export function assertCanCreateEstate(store, user) {
  applyPlanExpiryInPlace(user);
  if (user.accountType === 'lawyer' || userHasPaidAccess(user)) return;
  const owned = store.estates.filter((e) => e.ownerId === user.id).length;
  if (owned >= FREE_MAX_ESTATES) {
    const err = new Error(
      `Free plan allows ${FREE_MAX_ESTATES} estate. Upgrade to Family or Diaspora on Pricing.`
    );
    err.status = 402;
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

export function normalizeCountryPack(pack, userOrPlan) {
  const allowed = ['IN', 'IN_US', 'IN_UK'];
  let value = allowed.includes(pack) ? pack : 'IN';
  if ((value === 'IN_US' || value === 'IN_UK') && !canUseCrossBorderPack(userOrPlan)) {
    value = 'IN';
  }
  return value;
}
