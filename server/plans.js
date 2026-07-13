/** Plan gates for Free / Family / Diaspora */

export const FREE_MAX_ESTATES = 1;
export const FREE_MAX_ITEMS = 5;

export function isPaidPlan(plan) {
  return plan === 'family' || plan === 'diaspora';
}

export function ownerHasPaidPlan(store, estate) {
  const owner = store.users.find((u) => u.id === estate.ownerId);
  return isPaidPlan(owner?.plan);
}

export function canUseCrossBorderPack(plan) {
  return plan === 'diaspora';
}

export function assertCanCreateEstate(store, user) {
  if (user.accountType === 'lawyer' || isPaidPlan(user.plan)) return;
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
  if (user.accountType === 'lawyer' || ownerHasPaidPlan(store, estate)) return Infinity;
  const count = store.items.filter((i) => i.estateId === estateId).length;
  return Math.max(0, FREE_MAX_ITEMS - count);
}

export function normalizeCountryPack(pack, userPlan) {
  const allowed = ['IN', 'IN_US', 'IN_UK'];
  let value = allowed.includes(pack) ? pack : 'IN';
  if ((value === 'IN_US' || value === 'IN_UK') && !canUseCrossBorderPack(userPlan)) {
    value = 'IN';
  }
  return value;
}
