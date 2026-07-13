import crypto from 'crypto';
import { mutate, readStore } from './db.js';
import { authRequired } from './auth.js';
import {
  ensureUserReferralFields,
  grantReferrerDiscountOnPaidSignup,
  consumeReferralDiscountCredit,
  referralPublicFields,
} from './referrals.js';
import { nextPlanExpiresAt, planPublicFields, applyPlanExpiryInPlace } from './plans.js';

const PLAN_AMOUNTS = {
  // paise (INR)
  family: Number(process.env.RAZORPAY_AMOUNT_FAMILY || 149900), // ₹1,499
  diaspora: Number(process.env.RAZORPAY_AMOUNT_DIASPORA || 1249900), // ₹12,499
  counsel: Number(process.env.RAZORPAY_AMOUNT_COUNSEL || 149900), // ₹1,499 — counsel lead board
};

export function razorpayConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

/** @deprecated use razorpayConfigured — kept so old health imports don't break mid-deploy */
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
      expiresAt = nextPlanExpiresAt(u);
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
      type: 'plan_paid',
      plan,
      userId,
      paymentId: paymentMeta.paymentId || null,
      orderId: paymentMeta.orderId || null,
      referralDiscount: Boolean(paymentMeta.referralDiscount),
      planExpiresAt: expiresAt,
      at: new Date().toISOString(),
    });
  });
  grantReferrerDiscountOnPaidSignup(userId);
  return expiresAt;
}

async function createCheckout(user, plan) {
  const storeUser = freshUser(user.id) || user;
  ensureUserReferralFields(storeUser, readStore());
  // Persist any newly generated referral code
  mutate((s) => {
    const u = s.users.find((x) => x.id === user.id);
    if (u) ensureUserReferralFields(u, s);
  });

  const fullAmount = PLAN_AMOUNTS[plan];
  const credits = storeUser.referralDiscountCredits || 0;
  const applyDiscount = credits > 0;
  const amount = applyDiscount ? Math.round(fullAmount / 2) : fullAmount;
  const description = applyDiscount
    ? `${plan === 'diaspora' ? 'Diaspora' : plan === 'counsel' ? 'Counsel Pro' : 'Family'} plan — 1 year (50% referral reward)`
    : plan === 'diaspora'
      ? 'Diaspora plan — 1 year'
      : plan === 'counsel'
        ? 'Counsel Pro — 1 year (city leads)'
        : 'Family plan — 1 year';

  if (!razorpayConfigured()) {
    if (applyDiscount) consumeReferralDiscountCredit(user.id);
    const planExpiresAt = activatePlan(user.id, plan, { referralDiscount: applyDiscount });
    return {
      mode: 'direct',
      plan,
      planExpiresAt,
      amount,
      fullAmount,
      referralDiscount: applyDiscount,
      message: applyDiscount
        ? `Plan set to ${plan} until ${new Date(planExpiresAt).toLocaleDateString()} (50% referral). Add Razorpay keys for real checkout.`
        : `Plan set to ${plan} until ${new Date(planExpiresAt).toLocaleDateString()}. Add RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET for UPI/card/netbanking.`,
    };
  }

  // Reserve credit when creating a discounted order (prevents double-use)
  if (applyDiscount) consumeReferralDiscountCredit(user.id);

  const order = await razorpayRequest('/orders', {
    amount,
    currency: 'INR',
    receipt: `eos_${plan}_${user.id.slice(0, 8)}_${Date.now()}`.slice(0, 40),
    notes: {
      userId: user.id,
      plan,
      email: user.email,
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
      fullAmount,
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
    fullAmount,
    currency: order.currency || 'INR',
    keyId: process.env.RAZORPAY_KEY_ID,
    name: 'Estate OS',
    description,
    referralDiscount: applyDiscount,
    prefill: {
      name: user.name,
      email: user.email,
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
    res.json({
      ...planPublicFields(user),
      provider: razorpayConfigured() ? 'razorpay' : 'direct',
      currency: 'INR',
      amounts: PLAN_AMOUNTS,
      referral: {
        ...referralPublicFields(user || {}),
        link: user?.referralCode
          ? `${appUrl || ''}/auth?mode=register&ref=${user.referralCode}`
          : null,
        rule: 'When someone signs up with your link and pays for Family or Diaspora, you get 50% off your next plan payment.',
      },
    });
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
    const originFallback = 'https://estate-os-production.up.railway.app';
    const base = appUrl || originFallback;
    res.json({
      ...referralPublicFields(user || {}),
      link: `${base}/auth?mode=register&ref=${user.referralCode}`,
      referredCount: referred.length,
      paidReferredCount: referred.filter((u) => u.referralRewardGranted).length,
      rule: 'Share your link. When they pay for a plan, you earn one 50% discount credit for your next checkout.',
    });
  });

  app.post('/api/billing/checkout', authRequired, async (req, res, next) => {
    try {
      const plan =
        req.body?.plan === 'diaspora'
          ? 'diaspora'
          : req.body?.plan === 'counsel'
            ? 'counsel'
            : 'family';
      const payload = await createCheckout(req.user, plan);
      res.json(payload);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/billing/upgrade', authRequired, async (req, res, next) => {
    try {
      const plan =
        req.body?.plan === 'diaspora'
          ? 'diaspora'
          : req.body?.plan === 'counsel'
            ? 'counsel'
            : 'family';
      const payload = await createCheckout(req.user, plan);
      res.json(payload);
    } catch (err) {
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

    const plan =
      pending?.plan ||
      (bodyPlan === 'diaspora' ? 'diaspora' : bodyPlan === 'counsel' ? 'counsel' : 'family');

    const planExpiresAt = activatePlan(req.user.id, plan, {
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      referralDiscount: Boolean(pending?.referralDiscount),
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
      referralDiscount: Boolean(pending?.referralDiscount),
      ...planPublicFields(user || {}),
      ...referralPublicFields(user || {}),
    });
  });
}
