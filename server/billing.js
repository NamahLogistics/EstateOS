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
  PLAN_LIST_CENTS,
  CARE_NETWORK_COMING_SOON,
  isCareNetworkPlan,
} from './plans.js';
import { notifyUsers } from './notifications.js';

const FAMILY_AMOUNT = Number(process.env.PADDLE_AMOUNT_FAMILY || PLAN_LIST_CENTS.family);
const DIASPORA_AMOUNT = Number(process.env.PADDLE_AMOUNT_DIASPORA || PLAN_LIST_CENTS.diaspora);
const PLAN_AMOUNTS = {
  family: FAMILY_AMOUNT,
  diaspora: DIASPORA_AMOUNT,
  counsel: Number(process.env.PADDLE_AMOUNT_COUNSEL || PLAN_LIST_CENTS.counsel),
  family_care: Number(process.env.PADDLE_AMOUNT_FAMILY_CARE || PLAN_LIST_CENTS.family_care),
  diaspora_care: Number(process.env.PADDLE_AMOUNT_DIASPORA_CARE || PLAN_LIST_CENTS.diaspora_care),
  care: Number(process.env.PADDLE_AMOUNT_CARE || PLAN_LIST_CENTS.care),
};

const PADDLE_PRICE_ENV = {
  family: 'PADDLE_PRICE_FAMILY',
  diaspora: 'PADDLE_PRICE_DIASPORA',
  counsel: 'PADDLE_PRICE_COUNSEL',
  family_care: 'PADDLE_PRICE_FAMILY_CARE',
  diaspora_care: 'PADDLE_PRICE_DIASPORA_CARE',
  care: 'PADDLE_PRICE_FAMILY_CARE',
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

function formatUsd(cents) {
  return `$${(Number(cents) / 100).toLocaleString('en-US', {
    minimumFractionDigits: Number(cents) % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function paddleConfigured() {
  return Boolean(process.env.PADDLE_API_KEY && process.env.PADDLE_CLIENT_TOKEN);
}

/** @deprecated use paddleConfigured */
export function razorpayConfigured() {
  return paddleConfigured();
}

/** @deprecated use paddleConfigured */
export function stripeConfigured() {
  return paddleConfigured();
}

function paddleApiBase() {
  const env = String(process.env.PADDLE_ENV || 'sandbox').toLowerCase();
  return env === 'production' || env === 'live'
    ? 'https://api.paddle.com'
    : 'https://sandbox-api.paddle.com';
}

async function paddleRequest(path, body, method = 'POST') {
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${process.env.PADDLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
  };
  if (body != null && method !== 'GET') opts.body = JSON.stringify(body);
  const res = await fetch(`${paddleApiBase()}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data.error?.detail ||
      data.error?.documentation_url ||
      data.error?.message ||
      (Array.isArray(data.error?.errors) && data.error.errors[0]?.detail) ||
      `Paddle HTTP ${res.status}`;
    const err = new Error(msg);
    err.data = data;
    err.status = res.status >= 400 && res.status < 600 ? res.status : 502;
    throw err;
  }
  return data;
}

function userSubscriptionId(user) {
  return user?.paddleSubscriptionId || user?.razorpaySubscriptionId || null;
}

function paymentAlreadyProcessed(paymentId) {
  if (!paymentId) return false;
  return (readStore().leads || []).some((l) => l.paymentId === paymentId);
}

function subscriptionIsLive(user) {
  const st = user?.subscriptionStatus;
  return Boolean(userSubscriptionId(user) && (st === 'active' || st === 'authenticated' || st === 'pending'));
}

async function cancelPaddleSubscription(subscriptionId, { atCycleEnd = true } = {}) {
  if (!subscriptionId || !paddleConfigured()) return null;
  try {
    return await paddleRequest(`/subscriptions/${subscriptionId}/cancel`, {
      effective_from: atCycleEnd ? 'next_billing_period' : 'immediately',
    });
  } catch (err) {
    const msg = String(err.message || '').toLowerCase();
    if (msg.includes('already') || msg.includes('cancel') || err.status === 400 || err.status === 409) {
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

async function stopExistingSubscription(beneficiary, { atCycleEnd = false } = {}) {
  const subId = userSubscriptionId(beneficiary);
  if (!subId) return;
  await cancelPaddleSubscription(subId, { atCycleEnd });
  clearUserSubscription(beneficiary.id, {
    status: atCycleEnd ? 'cancel_at_period_end' : 'cancelled',
  });
}

function shouldUseSubscription(quote, applyDiscount, gift) {
  if (applyDiscount || gift) return false;
  return quote.kind === 'new' || quote.kind === 'renew';
}

function catalogPriceId(plan) {
  const envKey = PADDLE_PRICE_ENV[plan];
  if (envKey && process.env[envKey]) return process.env[envKey];
  return readStore().billingMeta?.paddlePrices?.[plan] || null;
}

function transactionItem({ plan, amountCents, recurring }) {
  const priceId = recurring ? catalogPriceId(plan) : null;
  if (priceId && amountCents === PLAN_AMOUNTS[plan]) {
    return { quantity: 1, price_id: priceId };
  }

  const label = planLabel(plan);
  const price = {
    description: recurring ? `${label} — annual` : `${label} — one-time`,
    name: `HeirReady ${label}`,
    tax_mode: 'account_setting',
    unit_price: {
      amount: String(Math.max(50, Math.round(amountCents))),
      currency_code: 'USD',
    },
    product: {
      name: `HeirReady ${label}`,
      description: recurring
        ? `${label} annual plan — auto-renews until cancelled`
        : `${label} one-time charge`,
      tax_category: 'saas',
    },
  };
  if (recurring) {
    price.billing_cycle = { interval: 'year', frequency: 1 };
  }
  return { quantity: 1, price };
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
      u.paddleTransactionId = paymentMeta.transactionId || u.paddleTransactionId;
      u.paddlePaymentId = paymentMeta.paymentId || u.paddlePaymentId;
      if (paymentMeta.customerId) u.paddleCustomerId = paymentMeta.customerId;
      if (paymentMeta.subscriptionId) {
        u.paddleSubscriptionId = paymentMeta.subscriptionId;
        u.razorpaySubscriptionId = paymentMeta.subscriptionId; // legacy mirror for old readers
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
      orderId: paymentMeta.transactionId || null,
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
  const giftBit = giftMeta?.ownerName ? ` · gift for ${giftMeta.ownerName}'s vault` : '';
  if (quote.kind === 'upgrade') {
    return `${planLabel(plan)} upgrade — ${formatUsd(quote.amount)} for ${quote.daysLeft} days left (same renewal date)${
      applyDiscount ? ' · 50% referral' : ''
    }${giftBit}`;
  }
  if (quote.kind === 'lateral') {
    return `${planLabel(plan)} — switch (no charge). Same renewal date.${giftBit}`;
  }
  if (applyDiscount) {
    return `${planLabel(plan)} — 1 year (50% referral). Card in USD via Paddle.${giftBit}`;
  }
  const renewBit = ' Auto-renews yearly until you cancel.';
  if (plan === 'diaspora')
    return `Diaspora — 1 year. Cross-border packs. USD via Paddle.${renewBit}${giftBit}`;
  if (plan === 'diaspora_care')
    return `Diaspora + Care — 1 year (2× Diaspora). Cross-border + city care.${renewBit}${giftBit}`;
  if (plan === 'counsel') return `Counsel Pro — 1 year (city leads). USD via Paddle.${renewBit}`;
  if (plan === 'family_care' || plan === 'care')
    return `Family + Care — 1 year (2× Family). Vault + city care.${renewBit}${giftBit}`;
  return `Family — 1 year. Unlimited vault + siblings. USD via Paddle.${renewBit}${giftBit}`;
}

function metaFromCustomData(custom) {
  if (!custom || typeof custom !== 'object') return {};
  return {
    userId: custom.userId || null,
    beneficiaryUserId: custom.beneficiaryUserId || null,
    giftEstateId: custom.giftEstateId || null,
    plan: custom.plan ? normalizeCheckoutPlan(custom.plan) : null,
    kind: custom.kind || null,
    fromPlan: custom.fromPlan || null,
    keepExpiresAt: custom.keepExpiresAt || null,
    referralDiscount: custom.referralDiscount === '50' || custom.referralDiscount === true,
  };
}

function fulfillFromPending(pending, paymentMeta = {}) {
  if (!pending?.plan) return null;
  const beneficiaryId = pending.beneficiaryUserId || pending.userId;
  const isGift = Boolean(pending.beneficiaryUserId && pending.beneficiaryUserId !== pending.userId);
  const planExpiresAt = activatePlan(beneficiaryId, pending.plan, {
    paymentId: paymentMeta.paymentId || paymentMeta.transactionId,
    transactionId: paymentMeta.transactionId,
    customerId: paymentMeta.customerId,
    subscriptionId: paymentMeta.subscriptionId || null,
    subscriptionStatus: paymentMeta.subscriptionId ? 'active' : undefined,
    referralDiscount: Boolean(pending.referralDiscount),
    kind: pending.kind || 'new',
    fromPlan: pending.fromPlan || null,
    keepExpiresAt: pending.keepExpiresAt || null,
    giftedBy: isGift ? pending.userId : null,
    giftEstateId: pending.giftEstateId || null,
  });

  mutate((s) => {
    const row = s.pendingPayments?.find((p) => p.id === pending.id);
    if (row) {
      row.status = 'paid';
      row.paymentId = paymentMeta.paymentId || paymentMeta.transactionId;
      row.subscriptionId = paymentMeta.subscriptionId || row.subscriptionId;
      row.paidAt = new Date().toISOString();
    }
  });

  if (isGift) {
    const store = readStore();
    const estate = pending.giftEstateId
      ? store.estates.find((e) => e.id === pending.giftEstateId)
      : null;
    const payer = store.users.find((u) => u.id === pending.userId);
    notifyUsers({
      userIds: [beneficiaryId],
      title: 'Sibling gifted Family / plan upgrade',
      body: `${payer?.name || 'A family member'} paid so ${estate?.subjectName || 'your vault'} stays unlimited.`,
      url: estate ? `/app/estates/${estate.id}` : '/pricing',
      type: 'plan_gifted',
      estateId: estate?.id || null,
    });
  }

  return { planExpiresAt, beneficiaryId, isGift };
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
  const amount = applyDiscount ? Math.max(50, Math.round(quote.amount / 2)) : quote.amount;
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

  if (!paddleConfigured()) {
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

  const recurring = shouldUseSubscription(quote, applyDiscount, gift);

  if (recurring) {
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
    if (userSubscriptionId(beneficiaryUser)) {
      await stopExistingSubscription(beneficiaryUser, { atCycleEnd: false });
    }
  } else if (quote.kind === 'upgrade' && userSubscriptionId(beneficiaryUser)) {
    try {
      await stopExistingSubscription(beneficiaryUser, { atCycleEnd: false });
    } catch (err) {
      console.warn('stop subscription before upgrade', err.message);
    }
  }

  const customData = {
    userId: user.id,
    beneficiaryUserId: beneficiaryId,
    giftEstateId: gift?.estate?.id || '',
    plan,
    kind: quote.kind,
    fromPlan: quote.fromPlan || '',
    keepExpiresAt: quote.keepExpiresAt || '',
    referralDiscount: applyDiscount ? '50' : '0',
  };

  const txnBody = {
    items: [transactionItem({ plan, amountCents: amount, recurring })],
    currency_code: 'USD',
    collection_mode: 'automatic',
    custom_data: customData,
  };
  if (user.paddleCustomerId) txnBody.customer_id = user.paddleCustomerId;

  const created = await paddleRequest('/transactions', txnBody);

  const txn = created.data || created;
  const transactionId = txn.id;

  mutate((s) => {
    if (!s.pendingPayments) s.pendingPayments = [];
    s.pendingPayments.push({
      id: transactionId,
      mode: recurring ? 'subscription' : 'order',
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
    mode: 'paddle',
    plan,
    transactionId,
    amount,
    fullAmount: quote.fullAmount,
    currency: 'USD',
    clientToken: process.env.PADDLE_CLIENT_TOKEN,
    environment:
      String(process.env.PADDLE_ENV || 'sandbox').toLowerCase() === 'production' ||
      String(process.env.PADDLE_ENV || '').toLowerCase() === 'live'
        ? 'production'
        : 'sandbox',
    name: 'HeirReady',
    description,
    quote,
    referralDiscount: applyDiscount,
    autoRenew: recurring,
    gift: giftMeta,
    checkoutUrl: txn.checkout?.url || null,
    customer: {
      email: user.email,
      name: user.name,
    },
  };
}

function verifyPaddleSignature(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader || !rawBody) return false;
  const parts = String(signatureHeader).split(';');
  const ts = parts.find((p) => p.startsWith('ts='))?.slice(3);
  const signatures = parts.filter((p) => p.startsWith('h1=')).map((p) => p.slice(3));
  if (!ts || !signatures.length) return false;
  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (Number.isFinite(age) && age > 60 * 5) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest('hex');
  return signatures.some((sig) => {
    try {
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  });
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
      provider: paddleConfigured() ? 'paddle' : 'direct',
      currency: 'USD',
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
        amountUsd: quote.amount / 100,
        fullAmountUsd: quote.fullAmount / 100,
        amountDollars: quote.amount / 100,
        fullAmountDollars: quote.fullAmount / 100,
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

  /** Confirm completed Paddle transaction (client callback + safety net for webhooks). */
  app.post('/api/billing/verify', authRequired, async (req, res) => {
    try {
      const transactionId = String(req.body?.transactionId || req.body?.transaction_id || '').trim();
      if (!transactionId) {
        return res.status(400).json({ error: 'Missing Paddle transaction id' });
      }
      if (!paddleConfigured()) {
        return res.status(400).json({ error: 'Paddle not configured' });
      }

      const remote = await paddleRequest(`/transactions/${transactionId}`, null, 'GET');
      const txn = remote.data || remote;
      if (!txn || txn.id !== transactionId) {
        return res.status(400).json({ error: 'Transaction not found' });
      }
      if (txn.status !== 'completed' && txn.status !== 'paid') {
        return res.status(400).json({ error: `Payment not complete yet (${txn.status})` });
      }

      const custom = metaFromCustomData(txn.custom_data);
      let pending = readStore().pendingPayments?.find((p) => p.id === transactionId);
      if (pending && pending.userId !== req.user.id) {
        return res.status(403).json({ error: 'Order does not belong to this account' });
      }

      if (!pending) {
        pending = {
          id: transactionId,
          userId: custom.userId || req.user.id,
          beneficiaryUserId: custom.beneficiaryUserId || req.user.id,
          giftEstateId: custom.giftEstateId || null,
          plan: custom.plan || normalizeCheckoutPlan(req.body?.plan),
          kind: custom.kind || 'new',
          fromPlan: custom.fromPlan || null,
          keepExpiresAt: custom.keepExpiresAt || null,
          referralDiscount: custom.referralDiscount,
        };
      }

      if (CARE_NETWORK_COMING_SOON && isCareNetworkPlan(pending.plan)) {
        return res.status(403).json({
          error: 'City care network is coming soon — this plan isn’t available yet.',
          code: 'CARE_COMING_SOON',
        });
      }

      const subscriptionId = txn.subscription_id || null;
      fulfillFromPending(pending, {
        transactionId,
        paymentId: txn.id,
        customerId: txn.customer_id || null,
        subscriptionId,
      });

      const isGift = Boolean(pending.beneficiaryUserId && pending.beneficiaryUserId !== req.user.id);
      if (isGift) {
        const store = readStore();
        const owner = store.users.find((u) => u.id === pending.beneficiaryUserId);
        const payer = freshUser(req.user.id);
        return res.json({
          ok: true,
          plan: pending.plan,
          planExpiresAt: owner?.planExpiresAt || null,
          kind: pending.kind || 'new',
          gifted: true,
          autoRenew: false,
          beneficiaryName: owner?.name || null,
          giftEstateId: pending.giftEstateId || null,
          referralDiscount: Boolean(pending.referralDiscount),
          ...planPublicFields(payer || {}),
          ...referralPublicFields(payer || {}),
        });
      }

      const user = freshUser(req.user.id);
      res.json({
        ok: true,
        plan: pending.plan,
        planExpiresAt: user?.planExpiresAt || null,
        kind: pending.kind || 'new',
        gifted: false,
        autoRenew: Boolean(subscriptionId) || Boolean(userSubscriptionId(user) && user?.subscriptionStatus === 'active'),
        referralDiscount: Boolean(pending.referralDiscount),
        ...planPublicFields(user || {}),
        ...referralPublicFields(user || {}),
      });
    } catch (err) {
      res.status(err.status || 400).json({ error: err.message, code: err.code });
    }
  });

  app.post('/api/billing/cancel-subscription', authRequired, async (req, res, next) => {
    try {
      const user = freshUser(req.user.id);
      const subId = userSubscriptionId(user);
      if (!subId) {
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
      await cancelPaddleSubscription(subId, { atCycleEnd });
      clearUserSubscription(user.id, {
        status: atCycleEnd ? 'cancel_at_period_end' : 'cancelled',
      });

      mutate((s) => {
        if (!s.leads) s.leads = [];
        s.leads.push({
          id: crypto.randomUUID(),
          type: 'subscription_cancelled',
          userId: user.id,
          subscriptionId: subId,
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
   * Paddle Billing webhooks — configure https://heirready.com/api/billing/webhook
   * Events: transaction.completed, subscription.created, subscription.updated, subscription.canceled, subscription.activated
   */
  app.post('/api/billing/webhook', (req, res) => {
    try {
      const secret = process.env.PADDLE_WEBHOOK_SECRET;
      if (secret) {
        const raw =
          typeof req.rawBody === 'string'
            ? req.rawBody
            : Buffer.isBuffer(req.rawBody)
              ? req.rawBody.toString('utf8')
              : JSON.stringify(req.body || {});
        const sig = req.headers['paddle-signature'];
        if (!verifyPaddleSignature(raw, sig, secret)) {
          return res.status(400).json({ error: 'Invalid webhook signature' });
        }
      }

      const eventType = req.body?.event_type || req.body?.eventType;
      const data = req.body?.data || {};

      if (eventType === 'transaction.completed') {
        const custom = metaFromCustomData(data.custom_data);
        let pending = readStore().pendingPayments?.find((p) => p.id === data.id);
        if (!pending && (custom.beneficiaryUserId || custom.userId) && custom.plan) {
          pending = {
            id: data.id,
            userId: custom.userId,
            beneficiaryUserId: custom.beneficiaryUserId || custom.userId,
            giftEstateId: custom.giftEstateId || null,
            plan: custom.plan,
            kind: custom.kind || 'new',
            fromPlan: custom.fromPlan || null,
            keepExpiresAt: custom.keepExpiresAt || null,
            referralDiscount: custom.referralDiscount,
          };
        }
        // Subscription renewals: Paddle creates a new txn; map via subscription id.
        if (!pending?.plan && data.subscription_id) {
          const store = readStore();
          const subUser = store.users.find((u) => userSubscriptionId(u) === data.subscription_id);
          if (subUser) {
            const plan = normalizeCheckoutPlan(
              custom.plan || subUser.subscriptionPlan || subUser.plan || 'family'
            );
            if (isPaidPlanHint(plan)) {
              activatePlan(subUser.id, plan, {
                paymentId: data.id,
                transactionId: data.id,
                subscriptionId: data.subscription_id,
                subscriptionStatus: 'active',
                customerId: data.customer_id || null,
                kind: 'renew',
              });
            }
            return res.json({ ok: true });
          }
        }
        if (pending?.plan) {
          fulfillFromPending(pending, {
            transactionId: data.id,
            paymentId: data.id,
            customerId: data.customer_id || null,
            subscriptionId: data.subscription_id || null,
          });
        }
        return res.json({ ok: true });
      }

      if (
        eventType === 'subscription.created' ||
        eventType === 'subscription.activated' ||
        eventType === 'subscription.updated'
      ) {
        const custom = metaFromCustomData(data.custom_data);
        const store = readStore();
        const user =
          store.users.find((u) => userSubscriptionId(u) === data.id) ||
          store.users.find((u) => u.id === custom.beneficiaryUserId) ||
          store.users.find((u) => u.id === custom.userId);

        if (user) {
          const status = data.status || 'active';
          const scheduledCancel = data.scheduled_change?.action === 'cancel';
          mutate((s) => {
            const u = s.users.find((x) => x.id === user.id);
            if (!u) return;
            u.paddleSubscriptionId = data.id;
            u.razorpaySubscriptionId = data.id;
            if (data.customer_id) u.paddleCustomerId = data.customer_id;
            if (scheduledCancel) u.subscriptionStatus = 'cancel_at_period_end';
            else if (status === 'canceled' || status === 'cancelled') u.subscriptionStatus = 'cancelled';
            else if (status === 'active' || status === 'trialing') u.subscriptionStatus = 'active';
            else u.subscriptionStatus = status;
            if (custom.plan) u.subscriptionPlan = custom.plan;
          });
        }
        return res.json({ ok: true });
      }

      if (eventType === 'subscription.canceled' || eventType === 'subscription.past_due') {
        const store = readStore();
        const user = store.users.find((u) => userSubscriptionId(u) === data.id);
        if (user) {
          clearUserSubscription(user.id, {
            status: eventType === 'subscription.past_due' ? 'past_due' : 'cancelled',
          });
        }
        return res.json({ ok: true });
      }

      res.json({ ok: true });
    } catch (err) {
      console.error('billing webhook', err);
      res.status(500).json({ error: 'Webhook handler failed' });
    }
  });
}

function isPaidPlanHint(plan) {
  return (
    plan === 'family' ||
    plan === 'diaspora' ||
    plan === 'counsel' ||
    plan === 'care' ||
    plan === 'family_care' ||
    plan === 'diaspora_care'
  );
}
