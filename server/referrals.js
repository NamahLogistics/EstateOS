import crypto from 'crypto';
import { mutate, readStore } from './db.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateReferralCode() {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  }
  return code;
}

export function ensureUserReferralFields(user, store) {
  if (!user.referralCode) {
    let code = generateReferralCode();
    while (store.users.some((u) => u.referralCode === code && u.id !== user.id)) {
      code = generateReferralCode();
    }
    user.referralCode = code;
  }
  if (user.referralDiscountCredits == null) user.referralDiscountCredits = 0;
  if (user.referralRewardCount == null) user.referralRewardCount = 0;
  return user;
}

export function findUserByReferralCode(store, code) {
  const normalized = String(code || '')
    .trim()
    .toUpperCase();
  if (!normalized) return null;
  return store.users.find((u) => u.referralCode === normalized) || null;
}

/** When a referred user pays any plan (Family / Diaspora / Counsel Pro), credit the referrer once. */
export function grantReferrerDiscountOnPaidSignup(payerUserId) {
  mutate((s) => {
    const payer = s.users.find((u) => u.id === payerUserId);
    if (!payer?.referredByUserId) return;
    if (payer.referralRewardGranted) return;
    if (payer.referredByUserId === payer.id) return;

    const referrer = s.users.find((u) => u.id === payer.referredByUserId);
    if (!referrer) return;

    ensureUserReferralFields(referrer, s);
    referrer.referralDiscountCredits = (referrer.referralDiscountCredits || 0) + 1;
    referrer.referralRewardCount = (referrer.referralRewardCount || 0) + 1;
    payer.referralRewardGranted = true;
    payer.referralRewardGrantedAt = new Date().toISOString();

    if (!s.referrals) s.referrals = [];
    s.referrals.push({
      id: crypto.randomUUID(),
      referrerUserId: referrer.id,
      referredUserId: payer.id,
      type: 'paid_signup_50_off_credit',
      at: new Date().toISOString(),
    });

    if (!s.leads) s.leads = [];
    s.leads.push({
      id: crypto.randomUUID(),
      type: 'referral_reward',
      referrerUserId: referrer.id,
      referredUserId: payer.id,
      at: new Date().toISOString(),
    });
  });
}

export function attachReferralOnRegister(store, newUser, refCode) {
  ensureUserReferralFields(newUser, store);
  const referrer = findUserByReferralCode(store, refCode);
  if (!referrer || referrer.id === newUser.id) return newUser;
  newUser.referredByUserId = referrer.id;
  newUser.referredByCode = referrer.referralCode;
  return newUser;
}

export function consumeReferralDiscountCredit(userId) {
  mutate((s) => {
    const u = s.users.find((x) => x.id === userId);
    if (!u) return;
    ensureUserReferralFields(u, s);
    if ((u.referralDiscountCredits || 0) > 0) {
      u.referralDiscountCredits -= 1;
      u.lastReferralDiscountUsedAt = new Date().toISOString();
    }
  });
}

export function referralPublicFields(user) {
  return {
    referralCode: user.referralCode || null,
    referralDiscountCredits: user.referralDiscountCredits || 0,
    referralRewardCount: user.referralRewardCount || 0,
  };
}

export function referralInviteLink(baseUrl, user, opts = {}) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  if (!user?.referralCode) return null;
  const type =
    opts.type ||
    (user.accountType === 'lawyer' ? 'lawyer' : user.accountType === 'care' ? 'care' : null);
  const params = new URLSearchParams({ mode: 'register', ref: user.referralCode });
  if (type) params.set('type', type);
  if (opts.city?.trim()) params.set('city', String(opts.city).trim());
  return `${base}/auth?${params.toString()}`;
}

export function referralRuleForUser(user) {
  if (user?.accountType === 'lawyer') {
    return 'Invite advocates with your link. Free joins don’t count. When they pay Counsel Pro (now or later), you get 1 credit (50% off one checkout). Credits stack and don’t expire — one per paid person.';
  }
  if (user?.accountType === 'care') {
    return 'Caregivers join free (no credit). When a family uses your code and pays a plan — even next year — you get 1 credit. Invite many → credits stack. Each credit = 50% off one checkout.';
  }
  return 'Invite with WhatsApp. Free joins link them to you but don’t pay you. When they pay Family / Diaspora / Counsel Pro — this year or later — you get 1 credit. Many paid friends = many stacked credits. Each credit = 50% off one upgrade or renew; credits don’t expire. Caregiver free joins don’t count.';
}
