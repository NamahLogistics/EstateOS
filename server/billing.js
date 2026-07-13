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

async function razorpayRequest(path, body) {
  const key = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error?.description || data.message || `Razorpay HTTP ${res.status}`);
    err.data = data;
    throw err;
  }
  return data;
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
    }
    if (!s.pendingPayments) s.pendingPayments = [];
    if (!s.leads) s.leads = [];
    s.leads.push({
      id: crypto.randomUUID(),
      type: paymentMeta.kind === 'upgrade' ? 'plan_upgraded' : 'plan_paid',
      plan,
      userId,
      paymentId: paymentMeta.paymentId || null,
      orderId: paymentMeta.orderId || null,
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

function checkoutDescription(plan, quote, applyDiscount) {
  if (quote.kind === 'upgrade') {
    const rupees = (quote.amount / 100).toLocaleString('en-IN');
    return `${planLabel(plan)} upgrade — ₹${rupees} for ${quote.daysLeft} days left (same renewal date)${
      applyDiscount ? ' · 50% referral' : ''
    }`;
  }
  if (quote.kind === 'lateral') {
    return `${planLabel(plan)} — switch (no charge). Same renewal date.`;
  }
  if (applyDiscount) {
    return `${planLabel(plan)} — 1 year (50% referral). Card from abroad or UPI in India.`;
  }
  if (plan === 'diaspora') return 'Diaspora — 1 year. Cross-border packs. Card from abroad or UPI in India.';
  if (plan === 'diaspora_care')
    return 'Diaspora + Care — 1 year (2× Diaspora). Cross-border + city nurses & maids.';
  if (plan === 'counsel') return 'Counsel Pro — 1 year (city leads). Card or UPI.';
  if (plan === 'family_care' || plan === 'care')
    return 'Family + Care — 1 year (2× Family). Vault + city nurses & maids.';
  return 'Family — 1 year. Unlimited vault + siblings. Card or UPI.';
}

async function createCheckout(user, plan) {
  if (CARE_NETWORK_COMING_SOON && isCareNetworkPlan(plan)) {
    const err = new Error(
      'City care network is coming soon — Family + Care and Diaspora + Care aren’t available to purchase yet. Caregivers can still join free.'
    );
    err.status = 403;
    err.code = 'CARE_COMING_SOON';
    throw err;
  }

  const storeUser = freshUser(user.id) || user;
  ensureUserReferralFields(storeUser, readStore());
  mutate((s) => {
    const u = s.users.find((x) => x.id === user.id);
    if (u) ensureUserReferralFields(u, s);
  });

  const quote = quotePlanChange(storeUser, plan, PLAN_AMOUNTS);
  const credits = storeUser.referralDiscountCredits || 0;
  const applyDiscount = credits > 0 && quote.amount > 0;
  const amount = applyDiscount ? Math.max(100, Math.round(quote.amount / 2)) : quote.amount;
  const description = checkoutDescription(plan, quote, applyDiscount);
  const activateMeta = {
    kind: quote.kind,
    fromPlan: quote.fromPlan,
    keepExpiresAt: quote.keepExpiresAt || null,
    referralDiscount: applyDiscount,
  };

  // Free lateral switch or zero-rupee upgrade edge case
  if (amount <= 0) {
    const planExpiresAt = activatePlan(user.id, plan, activateMeta);
    return {
      mode: 'direct',
      plan,
      planExpiresAt,
      amount: 0,
      fullAmount: quote.fullAmount,
      quote,
      referralDiscount: false,
      message:
        quote.kind === 'lateral'
          ? `Switched to ${planLabel(plan)} — renews ${new Date(planExpiresAt).toLocaleDateString()}`
          : `Plan set to ${planLabel(plan)} until ${new Date(planExpiresAt).toLocaleDateString()}`,
    };
  }

  if (!razorpayConfigured()) {
    if (applyDiscount) consumeReferralDiscountCredit(user.id);
    const planExpiresAt = activatePlan(user.id, plan, {
      ...activateMeta,
      referralDiscount: applyDiscount,
    });
    return {
      mode: 'direct',
      plan,
      planExpiresAt,
      amount,
      fullAmount: quote.fullAmount,
      quote,
      referralDiscount: applyDiscount,
      message:
        quote.kind === 'upgrade'
          ? `Upgraded to ${planLabel(plan)} — paid difference for ${quote.daysLeft} days left. Renews ${new Date(planExpiresAt).toLocaleDateString()}.`
          : applyDiscount
            ? `Plan set to ${plan} until ${new Date(planExpiresAt).toLocaleDateString()} (50% referral).`
            : `Plan set to ${plan} until ${new Date(planExpiresAt).toLocaleDateString()}.`,
    };
  }

  if (applyDiscount) consumeReferralDiscountCredit(user.id);

  const order = await razorpayRequest('/orders', {
    amount,
    currency: 'INR',
    receipt: `eos_${plan}_${user.id.slice(0, 8)}_${Date.now()}`.slice(0, 40),
    notes: {
      userId: user.id,
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
      userId: user.id,
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
    prefill: {
      name: user.name,
      email: user.email,
    },
    checkoutConfig: {
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
      const payload = await createCheckout(req.user, plan);
      res.json(payload);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message, code: err.code });
      next(err);
    }
  });

  app.post('/api/billing/upgrade', authRequired, async (req, res, next) => {
    try {
      const plan = normalizeCheckoutPlan(req.body?.plan);
      const payload = await createCheckout(req.user, plan);
      res.json(payload);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message, code: err.code });
      next(err);
    }
  });

  app.post('/api/billing/verify', authRequired, (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan: bodyPlan } =
      req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing Razorpay payment fields' });
    }
    if (!razorpayConfigured()) {
      return res.status(400).json({ error: 'Razorpay not configured' });
    }

    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expected !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    const pending = readStore().pendingPayments?.find((p) => p.id === razorpay_order_id);
    if (pending && pending.userId !== req.user.id) {
      return res.status(403).json({ error: 'Order does not belong to this account' });
    }

    const plan = pending?.plan || normalizeCheckoutPlan(bodyPlan);

    if (CARE_NETWORK_COMING_SOON && isCareNetworkPlan(plan)) {
      return res.status(403).json({
        error: 'City care network is coming soon — this plan isn’t available yet.',
        code: 'CARE_COMING_SOON',
      });
    }

    const planExpiresAt = activatePlan(req.user.id, plan, {
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      referralDiscount: Boolean(pending?.referralDiscount),
      kind: pending?.kind || 'new',
      fromPlan: pending?.fromPlan || null,
      keepExpiresAt: pending?.keepExpiresAt || null,
    });

    mutate((s) => {
      const row = s.pendingPayments?.find((p) => p.id === razorpay_order_id);
      if (row) {
        row.status = 'paid';
        row.paymentId = razorpay_payment_id;
        row.paidAt = new Date().toISOString();
      }
    });

    const user = freshUser(req.user.id);
    res.json({
      ok: true,
      plan,
      planExpiresAt,
      kind: pending?.kind || 'new',
      referralDiscount: Boolean(pending?.referralDiscount),
      ...planPublicFields(user || {}),
      ...referralPublicFields(user || {}),
    });
  });
}
