import Stripe from 'stripe';
import crypto from 'crypto';
import { mutate } from './db.js';
import { authRequired } from './auth.js';

function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

export function stripeConfigured() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      (process.env.STRIPE_PRICE_FAMILY || process.env.STRIPE_PRICE_DIASPORA)
  );
}

export function registerBillingRoutes(app) {
  app.get('/api/billing/status', authRequired, (req, res) => {
    res.json({
      plan: req.user.plan || 'free',
      stripe: stripeConfigured(),
      mail: Boolean(process.env.RESEND_API_KEY),
    });
  });

  app.post('/api/billing/checkout', authRequired, async (req, res) => {
    const stripe = stripeClient();
    const plan = req.body?.plan === 'diaspora' ? 'diaspora' : 'family';
    const priceId =
      plan === 'diaspora' ? process.env.STRIPE_PRICE_DIASPORA : process.env.STRIPE_PRICE_FAMILY;
    const appUrl = (process.env.APP_URL || '').replace(/\/$/, '') || 'http://localhost:5178';

    if (!stripe || !priceId) {
      // Fallback: activate plan + lead (no card processor configured yet)
      mutate((s) => {
        const u = s.users.find((x) => x.id === req.user.id);
        if (u) {
          u.plan = plan;
          u.planRequestedAt = new Date().toISOString();
        }
        s.leads.push({
          id: crypto.randomUUID(),
          type: 'plan_upgrade_pending_stripe',
          plan,
          userId: req.user.id,
          email: req.user.email,
          at: new Date().toISOString(),
        });
      });
      return res.json({
        mode: 'direct',
        plan,
        message: `Plan set to ${plan}. Add STRIPE_SECRET_KEY + price IDs for card checkout.`,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: req.user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/app?billing=success&plan=${plan}`,
      cancel_url: `${appUrl}/pricing?billing=cancel`,
      metadata: {
        userId: req.user.id,
        plan,
      },
      client_reference_id: req.user.id,
    });

    res.json({ mode: 'stripe', url: session.url, sessionId: session.id });
  });

  // Keep legacy upgrade path pointing at checkout
  app.post('/api/billing/upgrade', authRequired, async (req, res) => {
    req.url = '/api/billing/checkout';
    // call handler logic inline
    const stripe = stripeClient();
    const plan = req.body?.plan === 'diaspora' ? 'diaspora' : 'family';
    const priceId =
      plan === 'diaspora' ? process.env.STRIPE_PRICE_DIASPORA : process.env.STRIPE_PRICE_FAMILY;
    const appUrl = (process.env.APP_URL || '').replace(/\/$/, '') || 'http://localhost:5178';

    if (stripe && priceId) {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer_email: req.user.email,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${appUrl}/app?billing=success&plan=${plan}`,
        cancel_url: `${appUrl}/pricing?billing=cancel`,
        metadata: { userId: req.user.id, plan },
        client_reference_id: req.user.id,
      });
      return res.json({ mode: 'stripe', url: session.url, plan });
    }

    mutate((store) => {
      const user = store.users.find((u) => u.id === req.user.id);
      if (user) {
        user.plan = plan;
        user.planRequestedAt = new Date().toISOString();
      }
      store.leads.push({
        id: crypto.randomUUID(),
        type: 'plan_upgrade',
        plan,
        userId: req.user.id,
        email: req.user.email,
        name: req.user.name,
        at: new Date().toISOString(),
      });
    });
    res.json({
      mode: 'direct',
      plan,
      message: `You're on ${plan}. Configure Stripe for automatic card billing.`,
    });
  });

  app.post('/api/billing/webhook', async (req, res) => {
    const stripe = stripeClient();
    if (!stripe) return res.status(400).send('Stripe not configured');

    let event = req.body;
    const sig = req.headers['stripe-signature'];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (secret && sig) {
      try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, secret);
      } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.metadata?.userId || session.client_reference_id;
      const plan = session.metadata?.plan === 'diaspora' ? 'diaspora' : 'family';
      if (userId) {
        mutate((s) => {
          const u = s.users.find((x) => x.id === userId);
          if (u) {
            u.plan = plan;
            u.stripeCustomerId = session.customer || u.stripeCustomerId;
            u.planPaidAt = new Date().toISOString();
          }
        });
      }
    }
    res.json({ received: true });
  });
}
