import crypto from 'crypto';
import { mutate, readStore } from './db.js';
import { authRequired } from './auth.js';

const PLAN_AMOUNTS = {
  // paise (INR)
  family: Number(process.env.RAZORPAY_AMOUNT_FAMILY || 149900), // ₹1,499
  diaspora: Number(process.env.RAZORPAY_AMOUNT_DIASPORA || 1249900), // ₹12,499
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

function activatePlan(userId, plan, paymentMeta = {}) {
  mutate((s) => {
    const u = s.users.find((x) => x.id === userId);
    if (u) {
      u.plan = plan;
      u.planPaidAt = new Date().toISOString();
      u.razorpayPaymentId = paymentMeta.paymentId || u.razorpayPaymentId;
      u.razorpayOrderId = paymentMeta.orderId || u.razorpayOrderId;
    }
    if (!s.pendingPayments) s.pendingPayments = [];
    s.leads.push({
      id: crypto.randomUUID(),
      type: 'plan_paid',
      plan,
      userId,
      paymentId: paymentMeta.paymentId || null,
      orderId: paymentMeta.orderId || null,
      at: new Date().toISOString(),
    });
  });
}

async function createCheckout(user, plan) {
  const amount = PLAN_AMOUNTS[plan];
  if (!razorpayConfigured()) {
    activatePlan(user.id, plan);
    return {
      mode: 'direct',
      plan,
      message: `Plan set to ${plan}. Add RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET for UPI/card/netbanking.`,
    };
  }

  const order = await razorpayRequest('/orders', {
    amount,
    currency: 'INR',
    receipt: `eos_${plan}_${user.id.slice(0, 8)}_${Date.now()}`.slice(0, 40),
    notes: {
      userId: user.id,
      plan,
      email: user.email,
    },
  });

  mutate((s) => {
    if (!s.pendingPayments) s.pendingPayments = [];
    s.pendingPayments.push({
      id: order.id,
      userId: user.id,
      plan,
      amount,
      status: 'created',
      at: new Date().toISOString(),
    });
  });

  return {
    mode: 'razorpay',
    plan,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency || 'INR',
    keyId: process.env.RAZORPAY_KEY_ID,
    name: 'Estate OS',
    description: plan === 'diaspora' ? 'Diaspora plan — 1 year' : 'Family plan — 1 year',
    prefill: {
      name: user.name,
      email: user.email,
    },
  };
}

export function registerBillingRoutes(app) {
  app.get('/api/billing/status', authRequired, (req, res) => {
    res.json({
      plan: req.user.plan || 'free',
      provider: razorpayConfigured() ? 'razorpay' : 'direct',
      currency: 'INR',
      amounts: PLAN_AMOUNTS,
    });
  });

  app.post('/api/billing/checkout', authRequired, async (req, res, next) => {
    try {
      const plan = req.body?.plan === 'diaspora' ? 'diaspora' : 'family';
      const payload = await createCheckout(req.user, plan);
      res.json(payload);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/billing/upgrade', authRequired, async (req, res, next) => {
    try {
      const plan = req.body?.plan === 'diaspora' ? 'diaspora' : 'family';
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

    const plan = pending?.plan || (bodyPlan === 'diaspora' ? 'diaspora' : 'family');
    activatePlan(req.user.id, plan, {
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
    });

    mutate((s) => {
      const row = s.pendingPayments?.find((p) => p.id === razorpay_order_id);
      if (row) {
        row.status = 'paid';
        row.paymentId = razorpay_payment_id;
        row.paidAt = new Date().toISOString();
      }
    });

    res.json({ ok: true, plan });
  });
}
