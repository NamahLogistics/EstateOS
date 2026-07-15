import crypto from 'crypto';
import { mutate, readStore } from './db.js';
import { authRequired } from './auth.js';
import {
  ensureUserReferralFields,
  grantReferrerDiscountOnPaidSignup,
  consumeReferralDiscountCredit,
  referralPublicFields,
  referralInviteLink,
  referralRuleForUser,
} from './referrals.js';
import {
  nextPlanExpiresAt,
  planPublicFields,
  applyPlanExpiryInPlace,
  quotePlanChange,
  PLAN_LIST_PAISE,
  CARE_NETWORK_COMING_SOON,
  isCareNetworkPlan,
} from './plans.js';
import { notifyUsers } from './notifications.js';
import { sendPaymentRecoveryEmail } from './mail.js';

const RECOVERY_REUSE_MS = 30 * 60 * 1000;

const FAMILY_AMOUNT = Number(process.env.RAZORPAY_AMOUNT_FAMILY || PLAN_LIST_PAISE.family);
const DIASPORA_AMOUNT = Number(process.env.RAZORPAY_AMOUNT_DIASPORA || PLAN_LIST_PAISE.diaspora);
const PLAN_AMOUNTS = {
  family: FAMILY_AMOUNT,
  diaspora: DIASPORA_AMOUNT,
  counsel: Number(process.env.RAZORPAY_AMOUNT_COUNSEL || PLAN_LIST_PAISE.counsel),
  family_care: Number(process.env.RAZORPAY_AMOUNT_FAMILY_CARE || FAMILY_AMOUNT * 2),
  diaspora_care: Number(process.env.RAZORPAY_AMOUNT_DIASPORA_CARE || DIASPORA_AMOUNT * 2),
  care: Number(process.env.RAZORPAY_AMOUNT_CARE || FAMILY_AMOUNT * 2),
};

function planLabel(plan) {
  if (plan === 'diaspora') return 'Diaspora';
  if (plan === 'diaspora_care') return 'Diaspora + Care';
  if (plan === 'family_care') return 'Family + Care';
  if (plan === 'counsel') return 'Counsel Pro';
  if (plan === 'care') return 'Family + Care';
  return 'Family';
}

function normalizeCheckoutPlan(raw) {
  if (raw === 'diaspora') return 'diaspora';
  if (raw === 'diaspora_care') return 'diaspora_care';
  if (raw === 'family_care') return 'family_care';
  if (raw === 'counsel') return 'counsel';
  if (raw === 'care') return 'family_care';
  return 'family';
}

export function razorpayConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

/** @deprecated use razorpayConfigured */
export function stripeConfigured() {
  return razorpayConfigured();
}

async function razorpayRequest(path, body, method = 'POST') {
  const key = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const opts = {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
  };
  if (body != null && method !== 'GET') opts.body = JSON.stringify(body);
  const res = await fetch(`https://api.razorpay.com/v1${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error?.description || data.message || `Razorpay HTTP ${res.status}`);
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

const RAZORPAY_PLAN_ENV = {
  family: 'RAZORPAY_PLAN_FAMILY',
  diaspora: 'RAZORPAY_PLAN_DIASPORA',
  counsel: 'RAZORPAY_PLAN_COUNSEL',
  family_care: 'RAZORPAY_PLAN_FAMILY_CARE',
  diaspora_care: 'RAZORPAY_PLAN_DIASPORA_CARE',
  care: 'RAZORPAY_PLAN_FAMILY_CARE',
};

/** ~100 yearly cycles — charges until cancelled (Razorpay requires a finite total_count). */
const SUBSCRIPTION_TOTAL_COUNT = 100;

async function ensureRazorpayPlanId(plan) {
  const envKey = RAZORPAY_PLAN_ENV[plan];
  if (envKey && process.env[envKey]) return process.env[envKey];

  const cached = readStore().billingMeta?.razorpayPlans?.[plan];
  if (cached) return cached;

  const amount = PLAN_AMOUNTS[plan];
  if (!amount) {
    const err = new Error('Unknown plan amount');
    err.status = 400;
    throw err;
  }

  const created = await razorpayRequest('/plans', {
    period: 'yearly',
    interval: 1,
    item: {
      name: `HeirReady ${planLabel(plan)}`,
      amount,
      currency: 'INR',
      description: `${planLabel(plan)} — annual, auto-renews until cancelled`,
    },
  });

  mutate((s) => {
    if (!s.billingMeta) s.billingMeta = {};
    if (!s.billingMeta.razorpayPlans) s.billingMeta.razorpayPlans = {};
    s.billingMeta.razorpayPlans[plan] = created.id;
  });
  return created.id;
}

function paymentAlreadyProcessed(paymentId) {
  if (!paymentId) return false;
  return (readStore().leads || []).some((l) => l.paymentId === paymentId);
}

function subscriptionIsLive(user) {
  const st = user?.subscriptionStatus;
  return Boolean(
    user?.razorpaySubscriptionId && (st === 'active' || st === 'authenticated' || st === 'pending')
  );
}

async function cancelRazorpaySubscription(subscriptionId, { atCycleEnd = true } = {}) {
  if (!subscriptionId || !razorpayConfigured()) return null;
  try {
    return await razorpayRequest(`/subscriptions/${subscriptionId}/cancel`, {
      cancel_at_cycle_end: atCycleEnd ? 1 : 0,
    });
  } catch (err) {
    const msg = String(err.message || '').toLowerCase();
    if (msg.includes('already') || msg.includes('cancelled') || err.status === 400) {
      return null;
    }
    throw err;
  }
}

async function clearUserSubscription(userId, { status = 'cancelled', at = null } = {}) {
  mutate((s) => {
    const u = s.users.find((x) => x.id === userId);
    if (!u) return;
    u.subscriptionStatus = status;
    u.subscriptionCancelAt = at || new Date().toISOString();
  });
}

/**
 * Stop an existing mandate before a new one (or mid-year upgrade), so we never double-charge.
 */
async function stopExistingSubscription(beneficiary, { atCycleEnd = false } = {}) {
  const subId = beneficiary?.razorpaySubscriptionId;
  if (!subId) return;
  await cancelRazorpaySubscription(subId, { atCycleEnd });
  clearUserSubscription(beneficiary.id, {
    status: atCycleEnd ? 'cancel_at_period_end' : 'cancelled',
  });
}

function shouldUseSubscription(quote, applyDiscount, gift) {
  if (applyDiscount || gift) return false;
  return quote.kind === 'new' || quote.kind === 'renew';
}

function checkoutDisplayConfig() {
  return {
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
  };
}

function freshUser(userId) {
  const store = readStore();
  const user = store.users.find((u) => u.id === userId);
  if (user) {
    ensureUserReferralFields(user, store);
    if (applyPlanExpiryInPlace(user)) {
      mutate((s) => {
        const u = s.users.find((x) => x.id === userId);
        if (u) applyPlanExpiryInPlace(u);
      });
    }
  }
  return user;
}

function activatePlan(userId, plan, paymentMeta = {}) {
  if (paymentMeta.paymentId && paymentAlreadyProcessed(paymentMeta.paymentId)) {
    const u = readStore().users.find((x) => x.id === userId);
    return u?.planExpiresAt || null;
  }

  let expiresAt = null;
  mutate((s) => {
    const u = s.users.find((x) => x.id === userId);
    if (u) {
      ensureUserReferralFields(u, s);
      applyPlanExpiryInPlace(u);
      if (paymentMeta.keepExpiresAt) {
        expiresAt = paymentMeta.keepExpiresAt;
      } else {
        expiresAt = nextPlanExpiresAt(u);
      }
      u.plan = plan;
      u.planPaidAt = new Date().toISOString();
      u.planExpiresAt = expiresAt;
      u.planLapsedAt = null;
      u.previousPlan = null;
      u.razorpayPaymentId = paymentMeta.paymentId || u.razorpayPaymentId;
      u.razorpayOrderId = paymentMeta.orderId || u.razorpayOrderId;
      if (paymentMeta.subscriptionId) {
        u.razorpaySubscriptionId = paymentMeta.subscriptionId;
        u.subscriptionStatus = paymentMeta.subscriptionStatus || 'active';
        u.subscriptionCancelAt = null;
        u.subscriptionPlan = plan;
      }
    }
    if (!s.pendingPayments) s.pendingPayments = [];
    if (!s.leads) s.leads = [];
    s.leads.push({
      id: crypto.randomUUID(),
      type: paymentMeta.giftedBy
        ? 'plan_gifted'
        : paymentMeta.kind === 'upgrade'
          ? 'plan_upgraded'
          : paymentMeta.kind === 'renew'
            ? 'plan_renewed'
            : 'plan_paid',
      plan,
      userId,
      giftedBy: paymentMeta.giftedBy || null,
      giftEstateId: paymentMeta.giftEstateId || null,
      paymentId: paymentMeta.paymentId || null,
      orderId: paymentMeta.orderId || null,
      subscriptionId: paymentMeta.subscriptionId || null,
      referralDiscount: Boolean(paymentMeta.referralDiscount),
      kind: paymentMeta.kind || 'new',
      fromPlan: paymentMeta.fromPlan || null,
      planExpiresAt: expiresAt,
      at: new Date().toISOString(),
    });
  });
  grantReferrerDiscountOnPaidSignup(userId);
  return expiresAt;
}

/** Member may gift an upgrade to the estate owner (or pay for own if they are owner). */
function resolveGiftBeneficiary(store, payerId, giftEstateId) {
  if (!giftEstateId) return null;
  const estate = store.estates.find((e) => e.id === giftEstateId);
  if (!estate) {
    const err = new Error('Estate not found');
    err.status = 404;
    throw err;
  }
  const isOwner = estate.ownerId === payerId;
  const member = (store.members || []).find(
    (m) => m.estateId === estate.id && m.userId === payerId && m.status === 'active'
  );
  if (!isOwner && !member) {
    const err = new Error('Only people on this Life Map can gift an upgrade to the owner');
    err.status = 403;
    throw err;
  }
  const owner = store.users.find((u) => u.id === estate.ownerId);
  if (!owner) {
    const err = new Error('Vault owner not found');
    err.status = 404;
    throw err;
  }
  return {
    estate,
    beneficiaryId: estate.ownerId,
    beneficiary: owner,
    selfGift: isOwner,
  };
}

function checkoutDescription(plan, quote, applyDiscount, giftMeta) {
  const giftBit = giftMeta?.ownerName
    ? ` · gift for ${giftMeta.ownerName}'s vault`
    : '';
  if (quote.kind === 'upgrade') {
    const rupees = (quote.amount / 100).toLocaleString('en-IN');
    return `${planLabel(plan)} upgrade — ₹${rupees} for ${quote.daysLeft} days left (same renewal date)${
      applyDiscount ? ' · 50% referral' : ''
    }${giftBit}`;
  }
  if (quote.kind === 'lateral') {
    return `${planLabel(plan)} — switch (no charge). Same renewal date.${giftBit}`;
  }
  if (applyDiscount) {
    return `${planLabel(plan)} — 1 year (50% referral). Card from abroad or UPI in India.${giftBit}`;
  }
  const renewBit = ' Auto-renews yearly until you cancel.';
  if (plan === 'diaspora')
    return `Diaspora — 1 year. Cross-border packs. Card from abroad or UPI in India.${renewBit}${giftBit}`;
  if (plan === 'diaspora_care')
    return `Diaspora + Care — 1 year (2× Diaspora). Cross-border + city nurses & maids.${renewBit}${giftBit}`;
  if (plan === 'counsel') return `Counsel Pro — 1 year (city leads). Card or UPI.${renewBit}`;
  if (plan === 'family_care' || plan === 'care')
    return `Family + Care — 1 year (2× Family). Vault + city nurses & maids.${renewBit}${giftBit}`;
  return `Family — 1 year. Unlimited vault + siblings. Card or UPI.${renewBit}${giftBit}`;
}

async function createCheckout(user, plan, opts = {}) {
  if (CARE_NETWORK_COMING_SOON && isCareNetworkPlan(plan)) {
    const err = new Error(
      'City care network is coming soon — Family + Care and Diaspora + Care aren’t available to purchase yet. Caregivers can still join free.'
    );
    err.status = 403;
    err.code = 'CARE_COMING_SOON';
    throw err;
  }

  if (plan === 'counsel' && opts.giftEstateId) {
    const err = new Error('Counsel Pro can’t be gifted to a family vault — pick Family or Diaspora');
    err.status = 400;
    throw err;
  }

  const store = readStore();
  const gift = opts.giftEstateId
    ? resolveGiftBeneficiary(store, user.id, opts.giftEstateId)
    : null;
  const beneficiaryId = gift?.beneficiaryId || user.id;
  const beneficiaryUser = freshUser(beneficiaryId) || (gift ? gift.beneficiary : user);
  ensureUserReferralFields(beneficiaryUser, store);
  // Payer's referral credits still apply when gifting
  const payerUser = freshUser(user.id) || user;
  ensureUserReferralFields(payerUser, store);
  mutate((s) => {
    const u = s.users.find((x) => x.id === user.id);
    if (u) ensureUserReferralFields(u, s);
    const b = s.users.find((x) => x.id === beneficiaryId);
    if (b) ensureUserReferralFields(b, s);
  });

  const quote = quotePlanChange(beneficiaryUser, plan, PLAN_AMOUNTS);
  const credits = payerUser.referralDiscountCredits || 0;
  const applyDiscount = credits > 0 && quote.amount > 0;
  const amount = applyDiscount ? Math.max(100, Math.round(quote.amount / 2)) : quote.amount;
  const giftMeta = gift
    ? {
        ownerName: gift.beneficiary?.name || 'owner',
        estateId: gift.estate.id,
        estateName: gift.estate.subjectName,
        selfGift: gift.selfGift,
      }
    : null;
  const description = checkoutDescription(plan, quote, applyDiscount, giftMeta);
  const activateMeta = {
    kind: quote.kind,
    fromPlan: quote.fromPlan,
    keepExpiresAt: quote.keepExpiresAt || null,
    referralDiscount: applyDiscount,
    giftedBy: gift && !gift.selfGift ? user.id : null,
    giftEstateId: gift?.estate?.id || null,
  };

  // Free lateral switch or zero-rupee upgrade edge case
  if (amount <= 0) {
    const planExpiresAt = activatePlan(beneficiaryId, plan, activateMeta);
    if (gift && !gift.selfGift) {
      notifyUsers({
        userIds: [beneficiaryId],
        title: 'Sibling gifted a plan upgrade',
        body: `${user.name || 'A family member'} upgraded ${gift.estate.subjectName}'s vault.`,
        url: `/app/estates/${gift.estate.id}`,
        type: 'plan_gifted',
        estateId: gift.estate.id,
      });
    }
    return {
      mode: 'direct',
      plan,
      planExpiresAt,
      amount: 0,
      fullAmount: quote.fullAmount,
      quote,
      referralDiscount: false,
      gift: giftMeta,
      message: gift && !gift.selfGift
        ? `Gifted ${planLabel(plan)} to ${giftMeta.ownerName} — renews ${new Date(planExpiresAt).toLocaleDateString()}`
        : quote.kind === 'lateral'
          ? `Switched to ${planLabel(plan)} — renews ${new Date(planExpiresAt).toLocaleDateString()}`
          : `Plan set to ${planLabel(plan)} until ${new Date(planExpiresAt).toLocaleDateString()}`,
    };
  }

  if (!razorpayConfigured()) {
    if (applyDiscount) consumeReferralDiscountCredit(user.id);
    const planExpiresAt = activatePlan(beneficiaryId, plan, {
      ...activateMeta,
      referralDiscount: applyDiscount,
    });
    if (gift && !gift.selfGift) {
      notifyUsers({
        userIds: [beneficiaryId],
        title: 'Sibling gifted a plan upgrade',
        body: `${user.name || 'A family member'} upgraded ${gift.estate.subjectName}'s vault.`,
        url: `/app/estates/${gift.estate.id}`,
        type: 'plan_gifted',
        estateId: gift.estate.id,
      });
    }
    return {
      mode: 'direct',
      plan,
      planExpiresAt,
      amount,
      fullAmount: quote.fullAmount,
      quote,
      referralDiscount: applyDiscount,
      gift: giftMeta,
      message: gift && !gift.selfGift
        ? `Gifted ${planLabel(plan)} to ${giftMeta.ownerName}'s vault`
        : quote.kind === 'upgrade'
          ? `Upgraded to ${planLabel(plan)} — paid difference for ${quote.daysLeft} days left. Renews ${new Date(planExpiresAt).toLocaleDateString()}.`
          : applyDiscount
            ? `Plan set to ${plan} until ${new Date(planExpiresAt).toLocaleDateString()} (50% referral).`
            : `Plan set to ${plan} until ${new Date(planExpiresAt).toLocaleDateString()}.`,
    };
  }

  if (applyDiscount) consumeReferralDiscountCredit(user.id);

  // Full-year new/renew → Razorpay Subscription (auto-charge yearly until cancelled).
  // Mid-year upgrades, gifts, and referral discounts stay one-time orders.
  if (shouldUseSubscription(quote, applyDiscount, gift)) {
    if (
      subscriptionIsLive(beneficiaryUser) &&
      (beneficiaryUser.subscriptionPlan === plan || beneficiaryUser.plan === plan)
    ) {
      const err = new Error(
        `Auto-renew is already on for ${planLabel(plan)}. Your card is charged yearly until you cancel on Pricing.`
      );
      err.status = 409;
      err.code = 'ALREADY_SUBSCRIBED';
      throw err;
    }

    if (beneficiaryUser.razorpaySubscriptionId) {
      await stopExistingSubscription(beneficiaryUser, { atCycleEnd: false });
    }

    const rzPlanId = await ensureRazorpayPlanId(plan);
    const subscription = await razorpayRequest('/subscriptions', {
      plan_id: rzPlanId,
      total_count: SUBSCRIPTION_TOTAL_COUNT,
      quantity: 1,
      customer_notify: 1,
      notes: {
        userId: user.id,
        beneficiaryUserId: beneficiaryId,
        plan,
        kind: quote.kind,
        fromPlan: quote.fromPlan || '',
      },
    });

    mutate((s) => {
      if (!s.pendingPayments) s.pendingPayments = [];
      s.pendingPayments.push({
        id: subscription.id,
        mode: 'subscription',
        userId: user.id,
        beneficiaryUserId: beneficiaryId,
        giftEstateId: null,
        plan,
        amount,
        fullAmount: quote.fullAmount,
        kind: quote.kind,
        fromPlan: quote.fromPlan,
        keepExpiresAt: null,
        daysLeft: null,
        referralDiscount: false,
        status: 'created',
        at: new Date().toISOString(),
      });
    });

    return {
      mode: 'razorpay_subscription',
      plan,
      subscriptionId: subscription.id,
      amount,
      fullAmount: quote.fullAmount,
      currency: 'INR',
      keyId: process.env.RAZORPAY_KEY_ID,
      name: 'HeirReady',
      description,
      quote,
      referralDiscount: false,
      autoRenew: true,
      gift: null,
      prefill: {
        name: user.name,
        email: user.email,
      },
      checkoutConfig: checkoutDisplayConfig(),
    };
  }

  // Mid-year upgrade: stop auto-renew on the old plan so next year isn’t double-billed.
  if (quote.kind === 'upgrade' && beneficiaryUser.razorpaySubscriptionId) {
    try {
      await stopExistingSubscription(beneficiaryUser, { atCycleEnd: false });
    } catch (err) {
      console.warn('stop subscription before upgrade', err.message);
    }
  }

  const order = await razorpayRequest('/orders', {
    amount,
    currency: 'INR',
    receipt: `eos_${plan}_${user.id.slice(0, 8)}_${Date.now()}`.slice(0, 40),
    notes: {
      userId: user.id,
      beneficiaryUserId: beneficiaryId,
      giftEstateId: gift?.estate?.id || '',
      plan,
      kind: quote.kind,
      fromPlan: quote.fromPlan || '',
      keepExpiresAt: quote.keepExpiresAt || '',
      referralDiscount: applyDiscount ? '50' : '0',
    },
  });

  mutate((s) => {
    if (!s.pendingPayments) s.pendingPayments = [];
    s.pendingPayments.push({
      id: order.id,
      mode: 'order',
      userId: user.id,
      beneficiaryUserId: beneficiaryId,
      giftEstateId: gift?.estate?.id || null,
      plan,
      amount,
      fullAmount: quote.fullAmount,
      kind: quote.kind,
      fromPlan: quote.fromPlan,
      keepExpiresAt: quote.keepExpiresAt,
      daysLeft: quote.daysLeft,
      referralDiscount: applyDiscount,
      status: 'created',
      at: new Date().toISOString(),
    });
  });

  return {
    mode: 'razorpay',
    plan,
    orderId: order.id,
    amount: order.amount,
    fullAmount: quote.fullAmount,
    currency: order.currency || 'INR',
    keyId: process.env.RAZORPAY_KEY_ID,
    name: 'HeirReady',
    description,
    quote,
    referralDiscount: applyDiscount,
    gift: giftMeta,
    prefill: {
      name: user.name,
      email: user.email,
    },
    checkoutConfig: checkoutDisplayConfig(),
  };
}

function appBaseUrl() {
  return (process.env.APP_URL || 'https://heirready.com').replace(/\/$/, '');
}

function formatRupees(paise) {
  return (Number(paise || 0) / 100).toLocaleString('en-IN');
}

/**
 * One-time Razorpay Payment Link after a failed Checkout modal attempt.
 * Reuses an open link for the same plan within RECOVERY_REUSE_MS to avoid spam.
 */
async function createOrReuseRecoveryLink(user, plan, opts = {}) {
  if (!razorpayConfigured()) {
    const err = new Error('Razorpay not configured');
    err.status = 400;
    throw err;
  }
  if (CARE_NETWORK_COMING_SOON && isCareNetworkPlan(plan)) {
    const err = new Error('City care network is coming soon — this plan isn’t available yet.');
    err.status = 403;
    err.code = 'CARE_COMING_SOON';
    throw err;
  }

  const store = readStore();
  const gift = opts.giftEstateId
    ? resolveGiftBeneficiary(store, user.id, opts.giftEstateId)
    : null;
  const beneficiaryId = gift?.beneficiaryId || user.id;
  const beneficiaryUser = freshUser(beneficiaryId) || (gift ? gift.beneficiary : user);
  const payerUser = freshUser(user.id) || user;
  const quote = quotePlanChange(beneficiaryUser, plan, PLAN_AMOUNTS);
  const credits = payerUser.referralDiscountCredits || 0;
  const applyDiscount = credits > 0 && quote.amount > 0;
  const amount = applyDiscount ? Math.max(100, Math.round(quote.amount / 2)) : quote.amount;

  if (amount <= 0) {
    const err = new Error('Nothing to charge for this plan change — try checkout again.');
    err.status = 400;
    throw err;
  }

  const now = Date.now();
  const existing = (store.pendingPayments || []).find(
    (p) =>
      p.mode === 'payment_link' &&
      p.userId === user.id &&
      p.plan === plan &&
      p.status === 'created' &&
      p.shortUrl &&
      p.amount === amount &&
      p.giftEstateId === (gift?.estate?.id || null) &&
      now - new Date(p.at).getTime() < RECOVERY_REUSE_MS
  );

  if (existing) {
    return {
      reused: true,
      paymentLinkId: existing.id,
      shortUrl: existing.shortUrl,
      amount: existing.amount,
      plan,
      label: planLabel(plan),
      amountRupees: existing.amount / 100,
      quote,
      referralDiscount: Boolean(existing.referralDiscount),
      email: user.email,
    };
  }

  const giftMeta = gift
    ? {
        ownerName: gift.beneficiary?.name || 'owner',
        estateId: gift.estate.id,
        estateName: gift.estate.subjectName,
        selfGift: gift.selfGift,
      }
    : null;
  const description = `HeirReady ${planLabel(plan)} — finish checkout (${formatRupees(amount)})`;
  const callbackUrl = `${appBaseUrl()}/pricing?recovery=paid&plan=${encodeURIComponent(plan)}`;

  const link = await razorpayRequest('/payment_links', {
    amount,
    currency: 'INR',
    accept_partial: false,
    description,
    customer: {
      name: user.name || 'HeirReady customer',
      email: user.email,
    },
    notify: { sms: false, email: false },
    reminder_enable: true,
    callback_url: callbackUrl,
    callback_method: 'get',
    notes: {
      userId: user.id,
      beneficiaryUserId: beneficiaryId,
      giftEstateId: gift?.estate?.id || '',
      plan,
      kind: quote.kind,
      fromPlan: quote.fromPlan || '',
      keepExpiresAt: quote.keepExpiresAt || '',
      referralDiscount: applyDiscount ? '50' : '0',
      recovery: '1',
    },
  });

  mutate((s) => {
    if (!s.pendingPayments) s.pendingPayments = [];
    s.pendingPayments.push({
      id: link.id,
      mode: 'payment_link',
      userId: user.id,
      beneficiaryUserId: beneficiaryId,
      giftEstateId: gift?.estate?.id || null,
      plan,
      amount,
      fullAmount: quote.fullAmount,
      kind: quote.kind,
      fromPlan: quote.fromPlan,
      keepExpiresAt: quote.keepExpiresAt,
      daysLeft: quote.daysLeft,
      referralDiscount: applyDiscount,
      status: 'created',
      shortUrl: link.short_url,
      at: new Date().toISOString(),
    });
    if (!s.leads) s.leads = [];
    s.leads.push({
      id: crypto.randomUUID(),
      type: 'payment_recovery_link',
      userId: user.id,
      plan,
      paymentLinkId: link.id,
      amount,
      failReason: String(opts.failReason || '').slice(0, 240) || null,
      at: new Date().toISOString(),
    });
  });

  return {
    reused: false,
    paymentLinkId: link.id,
    shortUrl: link.short_url,
    amount,
    plan,
    label: planLabel(plan),
    amountRupees: amount / 100,
    quote,
    referralDiscount: applyDiscount,
    email: user.email,
    gift: giftMeta,
  };
}

async function emailRecoveryLink(user, recovery, failReason) {
  const sent = await sendPaymentRecoveryEmail({
    to: user.email,
    name: user.name,
    planLabel: recovery.label || planLabel(recovery.plan),
    amountRupees: recovery.amountRupees,
    payUrl: recovery.shortUrl,
    failReason: failReason || null,
  });
  mutate((s) => {
    const row = s.pendingPayments?.find((p) => p.id === recovery.paymentLinkId);
    if (row) {
      row.emailedAt = new Date().toISOString();
      row.emailCount = (row.emailCount || 0) + 1;
    }
  });
  return sent;
}

async function fulfillPaidPaymentLink(linkId, paymentId) {
  const pending = readStore().pendingPayments?.find((p) => p.id === linkId);
  if (!pending) {
    const err = new Error('Unknown payment link');
    err.status = 404;
    throw err;
  }
  if (pending.status === 'paid') {
    const u = freshUser(pending.beneficiaryUserId || pending.userId);
    return {
      ok: true,
      alreadyPaid: true,
      plan: pending.plan,
      planExpiresAt: u?.planExpiresAt || null,
      ...planPublicFields(u || {}),
    };
  }

  let remote = null;
  try {
    remote = await razorpayRequest(`/payment_links/${linkId}`, null, 'GET');
  } catch (err) {
    console.warn('payment link fetch', err.message);
  }
  if (remote && remote.status !== 'paid') {
    const err = new Error('Payment link is not paid yet');
    err.status = 400;
    throw err;
  }

  if (pending.referralDiscount) {
    try {
      consumeReferralDiscountCredit(pending.userId);
    } catch (err) {
      console.warn('recovery discount consume', err.message);
    }
  }

  const beneficiaryId = pending.beneficiaryUserId || pending.userId;
  const isGift = Boolean(pending.beneficiaryUserId && pending.beneficiaryUserId !== pending.userId);
  const planExpiresAt = activatePlan(beneficiaryId, pending.plan, {
    paymentId: paymentId || remote?.payments?.[0]?.payment_id || null,
    orderId: linkId,
    referralDiscount: Boolean(pending.referralDiscount),
    kind: pending.kind || 'new',
    fromPlan: pending.fromPlan || null,
    keepExpiresAt: pending.keepExpiresAt || null,
    giftedBy: isGift ? pending.userId : null,
    giftEstateId: pending.giftEstateId || null,
  });

  mutate((s) => {
    const row = s.pendingPayments?.find((p) => p.id === linkId);
    if (row) {
      row.status = 'paid';
      row.paymentId = paymentId || row.paymentId;
      row.paidAt = new Date().toISOString();
    }
  });

  if (isGift) {
    const store = readStore();
    const estate = pending.giftEstateId
      ? store.estates.find((e) => e.id === pending.giftEstateId)
      : null;
    notifyUsers({
      userIds: [beneficiaryId],
      title: 'Sibling gifted Family / plan upgrade',
      body: `A family member finished payment so ${estate?.subjectName || 'your vault'} stays unlimited.`,
      url: estate ? `/app/estates/${estate.id}` : '/pricing',
      type: 'plan_gifted',
      estateId: estate?.id || null,
    });
  }

  const payer = freshUser(pending.userId);
  return {
    ok: true,
    plan: pending.plan,
    planExpiresAt,
    gifted: isGift,
    giftEstateId: pending.giftEstateId || null,
    ...planPublicFields(payer || {}),
    ...referralPublicFields(payer || {}),
  };
}

export function registerBillingRoutes(app) {
  app.get('/api/billing/status', authRequired, (req, res) => {
    mutate((s) => {
      const u = s.users.find((x) => x.id === req.user.id);
      if (u) ensureUserReferralFields(u, s);
    });
    const user = freshUser(req.user.id);
    const appUrl = (process.env.APP_URL || '').replace(/\/$/, '') || '';
    const city = String(req.query?.city || '').trim();
    res.json({
      ...planPublicFields(user),
      provider: razorpayConfigured() ? 'razorpay' : 'direct',
      currency: 'INR',
      amounts: PLAN_AMOUNTS,
      referral: {
        ...referralPublicFields(user || {}),
        link: referralInviteLink(appUrl || '', user),
        linkFamily: referralInviteLink(appUrl || '', user, { city }),
        linkCare: referralInviteLink(appUrl || '', user, { type: 'care', city }),
        linkLawyer: referralInviteLink(appUrl || '', user, { type: 'lawyer', city }),
        rule: referralRuleForUser(user),
        audience:
          user?.accountType === 'lawyer' ? 'lawyer' : user?.accountType === 'care' ? 'care' : 'family',
      },
    });
  });

  app.get('/api/billing/quote', authRequired, (req, res) => {
    try {
      const plan = normalizeCheckoutPlan(req.query?.plan || req.body?.plan);
      const user = freshUser(req.user.id);
      const quote = quotePlanChange(user, plan, PLAN_AMOUNTS);
      res.json({
        ...quote,
        label: planLabel(plan),
        amountRupees: quote.amount / 100,
        fullAmountRupees: quote.fullAmount / 100,
      });
    } catch (err) {
      res.status(err.status || 400).json({ error: err.message, code: err.code });
    }
  });

  app.get('/api/billing/referral', authRequired, (req, res) => {
    mutate((s) => {
      const u = s.users.find((x) => x.id === req.user.id);
      if (u) ensureUserReferralFields(u, s);
    });
    const user = freshUser(req.user.id);
    const store = readStore();
    const referred = store.users.filter((u) => u.referredByUserId === req.user.id);
    const appUrl = (process.env.APP_URL || '').replace(/\/$/, '') || '';
    const originFallback = 'https://heirready.com';
    const base = appUrl || originFallback;
    const city = String(req.query?.city || '').trim();
    res.json({
      ...referralPublicFields(user || {}),
      link: referralInviteLink(base, user),
      linkFamily: referralInviteLink(base, user, { city }),
      linkCare: referralInviteLink(base, user, { type: 'care', city }),
      linkLawyer: referralInviteLink(base, user, { type: 'lawyer', city }),
      audience:
        user?.accountType === 'lawyer' ? 'lawyer' : user?.accountType === 'care' ? 'care' : 'family',
      referredCount: referred.length,
      paidReferredCount: referred.filter((u) => u.referralRewardGranted).length,
      rule: referralRuleForUser(user),
      city: city || null,
    });
  });

  app.post('/api/billing/checkout', authRequired, async (req, res, next) => {
    try {
      const plan = normalizeCheckoutPlan(req.body?.plan);
      const giftEstateId = String(req.body?.giftEstateId || '').trim() || null;
      const payload = await createCheckout(req.user, plan, { giftEstateId });
      res.json(payload);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message, code: err.code });
      next(err);
    }
  });

  app.post('/api/billing/upgrade', authRequired, async (req, res, next) => {
    try {
      const plan = normalizeCheckoutPlan(req.body?.plan);
      const giftEstateId = String(req.body?.giftEstateId || '').trim() || null;
      const payload = await createCheckout(req.user, plan, { giftEstateId });
      res.json(payload);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message, code: err.code });
      next(err);
    }
  });

  app.post('/api/billing/verify', authRequired, async (req, res) => {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      razorpay_subscription_id,
      plan: bodyPlan,
    } = req.body || {};

    if (!razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing Razorpay payment fields' });
    }
    if (!razorpayConfigured()) {
      return res.status(400).json({ error: 'Razorpay not configured' });
    }

    const isSubscription = Boolean(razorpay_subscription_id);
    if (!isSubscription && !razorpay_order_id) {
      return res.status(400).json({ error: 'Missing Razorpay order or subscription id' });
    }

    const payload = isSubscription
      ? `${razorpay_payment_id}|${razorpay_subscription_id}`
      : `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(payload)
      .digest('hex');

    if (expected !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    const pendingId = isSubscription ? razorpay_subscription_id : razorpay_order_id;
    const pending = readStore().pendingPayments?.find((p) => p.id === pendingId);
    if (pending && pending.userId !== req.user.id) {
      return res.status(403).json({ error: 'Order does not belong to this account' });
    }

    const plan = pending?.plan || normalizeCheckoutPlan(bodyPlan);
    const beneficiaryId = pending?.beneficiaryUserId || req.user.id;
    const isGift = Boolean(pending?.beneficiaryUserId && pending.beneficiaryUserId !== req.user.id);

    if (CARE_NETWORK_COMING_SOON && isCareNetworkPlan(plan)) {
      return res.status(403).json({
        error: 'City care network is coming soon — this plan isn’t available yet.',
        code: 'CARE_COMING_SOON',
      });
    }

    const planExpiresAt = activatePlan(beneficiaryId, plan, {
      paymentId: razorpay_payment_id,
      orderId: isSubscription ? null : razorpay_order_id,
      subscriptionId: isSubscription ? razorpay_subscription_id : null,
      subscriptionStatus: isSubscription ? 'active' : undefined,
      referralDiscount: Boolean(pending?.referralDiscount),
      kind: pending?.kind || (isSubscription ? 'new' : 'new'),
      fromPlan: pending?.fromPlan || null,
      keepExpiresAt: pending?.keepExpiresAt || null,
      giftedBy: isGift ? req.user.id : null,
      giftEstateId: pending?.giftEstateId || null,
    });

    mutate((s) => {
      const row = s.pendingPayments?.find((p) => p.id === pendingId);
      if (row) {
        row.status = 'paid';
        row.paymentId = razorpay_payment_id;
        row.paidAt = new Date().toISOString();
      }
    });

    if (isGift) {
      const store = readStore();
      const owner = store.users.find((u) => u.id === beneficiaryId);
      const estate = pending?.giftEstateId
        ? store.estates.find((e) => e.id === pending.giftEstateId)
        : null;
      notifyUsers({
        userIds: [beneficiaryId],
        title: 'Sibling gifted Family / plan upgrade',
        body: `${req.user.name || 'A family member'} paid so ${estate?.subjectName || 'your vault'} stays unlimited.`,
        url: estate ? `/app/estates/${estate.id}` : '/pricing',
        type: 'plan_gifted',
        estateId: estate?.id || null,
      });
      const payer = freshUser(req.user.id);
      return res.json({
        ok: true,
        plan,
        planExpiresAt,
        kind: pending?.kind || 'new',
        gifted: true,
        autoRenew: false,
        beneficiaryName: owner?.name || null,
        giftEstateId: pending?.giftEstateId || null,
        referralDiscount: Boolean(pending?.referralDiscount),
        ...planPublicFields(payer || {}),
        ...referralPublicFields(payer || {}),
      });
    }

    const user = freshUser(req.user.id);
    res.json({
      ok: true,
      plan,
      planExpiresAt,
      kind: pending?.kind || 'new',
      gifted: false,
      autoRenew: isSubscription || Boolean(user?.razorpaySubscriptionId && user?.subscriptionStatus === 'active'),
      referralDiscount: Boolean(pending?.referralDiscount),
      ...planPublicFields(user || {}),
      ...referralPublicFields(user || {}),
    });
  });

  /** Cancel auto-renew. Access continues until planExpiresAt. Anyone on the account can cancel. */
  app.post('/api/billing/cancel-subscription', authRequired, async (req, res, next) => {
    try {
      const user = freshUser(req.user.id);
      if (!user?.razorpaySubscriptionId) {
        return res.status(400).json({ error: 'No active auto-renew subscription on this account' });
      }
      if (user.subscriptionStatus === 'cancelled' || user.subscriptionStatus === 'completed') {
        return res.json({
          ok: true,
          alreadyCancelled: true,
          ...planPublicFields(user),
          message: 'Auto-renew was already cancelled. Access continues until your paid period ends.',
        });
      }

      const atCycleEnd = req.body?.immediate === true ? false : true;
      await cancelRazorpaySubscription(user.razorpaySubscriptionId, { atCycleEnd });
      clearUserSubscription(user.id, {
        status: atCycleEnd ? 'cancel_at_period_end' : 'cancelled',
      });

      mutate((s) => {
        if (!s.leads) s.leads = [];
        s.leads.push({
          id: crypto.randomUUID(),
          type: 'subscription_cancelled',
          userId: user.id,
          subscriptionId: user.razorpaySubscriptionId,
          atCycleEnd,
          at: new Date().toISOString(),
        });
      });

      const updated = freshUser(req.user.id);
      res.json({
        ok: true,
        ...planPublicFields(updated || {}),
        message: atCycleEnd
          ? `Auto-renew cancelled. You keep ${planLabel(updated?.plan || user.plan)} until ${
              updated?.planExpiresAt
                ? new Date(updated.planExpiresAt).toLocaleDateString()
                : 'the end of this period'
            }.`
          : 'Subscription cancelled.',
      });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message, code: err.code });
      next(err);
    }
  });

  /**
   * After checkout fails: create/reuse a Razorpay Payment Link and email it.
   * Client calls this from payment.failed so the customer isn’t stuck with only a toast.
   */
  app.post('/api/billing/recover', authRequired, async (req, res, next) => {
    try {
      const plan = normalizeCheckoutPlan(req.body?.plan);
      const giftEstateId = String(req.body?.giftEstateId || '').trim() || null;
      const failReason = String(req.body?.failReason || req.body?.reason || '').slice(0, 240);
      const sendEmailFlag = req.body?.email !== false;
      const user = freshUser(req.user.id) || req.user;

      mutate((s) => {
        if (!s.leads) s.leads = [];
        s.leads.push({
          id: crypto.randomUUID(),
          type: 'payment_failed',
          userId: user.id,
          plan,
          failReason: failReason || null,
          source: String(req.body?.source || 'checkout').slice(0, 40),
          at: new Date().toISOString(),
        });
      });

      const recovery = await createOrReuseRecoveryLink(user, plan, { giftEstateId, failReason });
      let emailed = false;
      let emailMode = null;

      if (sendEmailFlag && user.email) {
        const row = readStore().pendingPayments?.find((p) => p.id === recovery.paymentLinkId);
        const emailedRecently =
          row?.emailedAt && Date.now() - new Date(row.emailedAt).getTime() < 10 * 60 * 1000;
        const force = Boolean(req.body?.forceEmail);
        if (!emailedRecently || force) {
          const sent = await emailRecoveryLink(user, recovery, failReason);
          emailed = true;
          emailMode = sent?.mode || 'sent';
        }
      }

      res.json({
        ok: true,
        ...recovery,
        emailed,
        emailMode,
        message: emailed
          ? `We emailed a payment link to ${user.email}. You can also open it now or ask family in India to pay with UPI.`
          : `Payment link ready — open it now, or ask family in India to pay with UPI.`,
      });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message, code: err.code });
      next(err);
    }
  });

  /** Confirm a payment-link checkout (callback from Razorpay or client poll). */
  app.post('/api/billing/verify-link', authRequired, async (req, res, next) => {
    try {
      const paymentLinkId = String(
        req.body?.razorpay_payment_link_id || req.body?.paymentLinkId || ''
      ).trim();
      const paymentId = String(req.body?.razorpay_payment_id || req.body?.paymentId || '').trim();
      if (!paymentLinkId) {
        return res.status(400).json({ error: 'Missing payment link id' });
      }

      const pending = readStore().pendingPayments?.find((p) => p.id === paymentLinkId);
      if (!pending) {
        return res.status(404).json({ error: 'Unknown payment link' });
      }
      if (pending.userId !== req.user.id) {
        return res.status(403).json({ error: 'Payment link does not belong to this account' });
      }

      const result = await fulfillPaidPaymentLink(paymentLinkId, paymentId || null);
      res.json(result);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message, code: err.code });
      next(err);
    }
  });

  /**
   * Razorpay subscription + payment-link webhooks.
   * Configure URL https://heirready.com/api/billing/webhook and set RAZORPAY_WEBHOOK_SECRET.
   * Events: subscription.*, payment_link.paid
   */
  app.post('/api/billing/webhook', (req, res) => {
    try {
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
      if (secret) {
        const sig = req.headers['x-razorpay-signature'];
        const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
        const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
        if (sig !== expected) {
          return res.status(400).json({ error: 'Invalid webhook signature' });
        }
      }

      const event = req.body?.event;
      const paymentLink = req.body?.payload?.payment_link?.entity;
      const payment = req.body?.payload?.payment?.entity;

      if (event === 'payment_link.paid' && paymentLink?.id) {
        const pending = readStore().pendingPayments?.find((p) => p.id === paymentLink.id);
        if (!pending) return res.json({ ok: true, ignored: true });
        fulfillPaidPaymentLink(paymentLink.id, payment?.id || null)
          .then(() => res.json({ ok: true }))
          .catch((err) => {
            console.error('payment_link.paid fulfill', err.message);
            res.status(err.status && err.status < 500 ? err.status : 500).json({
              error: err.message || 'Fulfill failed',
            });
          });
        return;
      }

      const sub = req.body?.payload?.subscription?.entity;
      if (!sub?.id) return res.json({ ok: true, ignored: true });

      const notes = sub.notes || {};
      const store = readStore();
      let user =
        store.users.find((u) => u.razorpaySubscriptionId === sub.id) ||
        store.users.find((u) => u.id === notes.beneficiaryUserId) ||
        store.users.find((u) => u.id === notes.userId);

      if (event === 'subscription.charged' && user) {
        const plan = normalizeCheckoutPlan(notes.plan || user.subscriptionPlan || user.plan);
        activatePlan(user.id, plan, {
          paymentId: payment?.id || null,
          subscriptionId: sub.id,
          subscriptionStatus: 'active',
          kind: 'renew',
        });
        return res.json({ ok: true });
      }

      if (
        (event === 'subscription.cancelled' ||
          event === 'subscription.completed' ||
          event === 'subscription.halted') &&
        user
      ) {
        const status =
          event === 'subscription.halted'
            ? 'halted'
            : event === 'subscription.completed'
              ? 'completed'
              : 'cancelled';
        clearUserSubscription(user.id, { status });
        mutate((s) => {
          const u = s.users.find((x) => x.id === user.id);
          if (u && !u.razorpaySubscriptionId) u.razorpaySubscriptionId = sub.id;
        });
        return res.json({ ok: true });
      }

      // Activated / authenticated — store id if missing (checkout verify usually handles first year)
      if (
        (event === 'subscription.activated' || event === 'subscription.authenticated') &&
        user
      ) {
        mutate((s) => {
          const u = s.users.find((x) => x.id === user.id);
          if (!u) return;
          u.razorpaySubscriptionId = sub.id;
          if (u.subscriptionStatus !== 'cancel_at_period_end') {
            u.subscriptionStatus = event === 'subscription.activated' ? 'active' : 'authenticated';
          }
          u.subscriptionPlan = normalizeCheckoutPlan(notes.plan || u.plan);
        });
      }

      res.json({ ok: true });
    } catch (err) {
      console.error('billing webhook', err);
      res.status(500).json({ error: 'Webhook handler failed' });
    }
  });
}
