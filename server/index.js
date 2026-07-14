import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import JSZip from 'jszip';
import { fileURLToPath } from 'url';
import {
  mutate,
  readStore,
  audit,
  uploadsDir,
  initDb,
  flushPersist,
  persistenceMode,
  saveUpload,
  readUpload,
} from './db.js';
import {
  authRequired,
  hashPassword,
  verifyPassword,
  signToken,
} from './auth.js';
import {
  ITEM_CATEGORIES,
  CARE_ROLES,
  buildExecutionTasks,
  COUNTRY_PACKS,
  renderLetter,
} from './checklist.js';
import {
  registerLawyerRoutes,
  seedLawyersIfNeeded,
  attachLawyerAccess,
} from './lawyers.routes.js';
import { registerCareRoutes } from './care.routes.js';
import { sendInviteEmail, sendEmail, sendPasswordResetEmail, sendEstateThreadNotify, sendHousewarmingCompleteEmail, sendSiblingJoinedEmail, mailConfigured } from './mail.js';
import {
  ensureVapidKeys,
  getVapidPublicKey,
  notifyUsers,
  listNotifications,
  unreadCountFor,
  markNotificationsRead,
  savePushSubscription,
  removePushSubscription,
  pushConfigured,
} from './notifications.js';
import { registerBillingRoutes, razorpayConfigured } from './billing.js';
import { INTERVIEW_QUESTIONS, answersToItems } from './interview.js';
import { runReminderPass, ensureEstateDefaults, scheduleLightReview } from './reminders.js';
import {
  housewarmingPublic,
  defaultHousewarmingState,
  HOUSEWARMING_STEPS,
} from './housewarming.js';
import {
  ensureFamilyInvite,
  findActiveFamilyInvite,
  familyInvitePublicView,
  inviteIsAcceptable,
  consumeInvite,
  inviteLinkFor,
} from './familyInvite.js';
import { computeLifeMapHealth } from './lifeMapHealth.js';
import {
  assertCanCreateEstate,
  assertCanAddItems,
  normalizeCountryPack,
  FREE_MAX_ITEMS,
  FREE_MAX_ESTATES,
  remainingItemSlots,
  planPublicFields,
  applyPlanExpiryInPlace,
  ownerHasPaidPlan,
  CARE_NETWORK_COMING_SOON,
} from './plans.js';
import { draftFromPhoto } from './scan.js';
import {
  attachReferralOnRegister,
  ensureUserReferralFields,
} from './referrals.js';

const uuid = () => crypto.randomUUID();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4060);
const app = express();
const isProd = process.env.NODE_ENV === 'production';

const DEFAULT_SUPPORT_EMAIL = 'support@heirready.com';

function extractEmailAddr(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const angled = s.match(/<([^>]+)>/);
  if (angled) return angled[1].trim();
  if (s.includes('@')) return s.replace(/^mailto:/i, '').trim();
  return null;
}

/** Public Contact / Legal — never personal Gmail or phone. */
function publicSupportEmail() {
  const candidates = [
    process.env.SUPPORT_EMAIL,
    process.env.BUSINESS_EMAIL,
    extractEmailAddr(process.env.MAIL_FROM),
  ];
  for (const c of candidates) {
    const email = extractEmailAddr(c) || c;
    if (email && !/shubhramishra/i.test(email) && !/@resend\.dev$/i.test(email)) {
      return email;
    }
  }
  return DEFAULT_SUPPORT_EMAIL;
}

/** Human onboarding waitlist only — may stay personal; never shown on public pages. */
function onboardingInboxEmail() {
  return (
    process.env.ONBOARDING_EMAIL ||
    process.env.BUSINESS_GRIEVANCE_EMAIL ||
    'shubhramishra137@gmail.com'
  );
}

if (isProd && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'estate-os-dev-secret')) {
  console.warn('WARNING: Set a strong JWT_SECRET in production');
}

app.set('trust proxy', 1);
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
    credentials: true,
  })
);

// Razorpay uses JSON verify endpoint — no Stripe raw webhook needed
app.use(express.json({ limit: '8mb' }));
app.use(
  '/api/',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isProd ? 400 : 2000,
    standardHeaders: true,
    legacyHeaders: false,
  })
);
app.use(
  '/api/auth/',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isProd ? 40 : 200,
    message: { error: 'Too many auth attempts. Try again shortly.' },
  })
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

app.get('/uploads/:fileId', async (req, res) => {
  const file = await readUpload(req.params.fileId);
  if (!file) return res.status(404).send('Not found');
  const safeName = encodeURIComponent(file.name || 'document');
  const asDownload = String(req.query.download || '') === '1';
  res.setHeader('Content-Type', file.mime || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `${asDownload ? 'attachment' : 'inline'}; filename="${safeName}"`
  );
  res.send(file.buffer);
});

function canAccessEstateBase(store, userId, estateId) {
  const estate = store.estates.find((e) => e.id === estateId);
  if (!estate) return { ok: false, status: 404, error: 'Estate not found' };
  if (estate.ownerId === userId) return { ok: true, estate, role: 'owner' };
  const member = store.members.find(
    (m) => m.estateId === estateId && m.userId === userId && m.status === 'active'
  );
  if (member) return { ok: true, estate, role: member.role };
  return { ok: false, status: 403, error: 'No access to this estate' };
}

const canAccessEstate = attachLawyerAccess(canAccessEstateBase);

function publicUser(user) {
  applyPlanExpiryInPlace(user);
  const plan = planPublicFields(user);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    plan: plan.plan,
    planExpiresAt: plan.planExpiresAt,
    planActive: plan.planActive,
    daysUntilExpiry: plan.daysUntilExpiry,
    needsRenewal: plan.needsRenewal,
    previousPlan: plan.previousPlan,
    planLapsedAt: plan.planLapsedAt,
    accountType: user.accountType || 'family',
    referralCode: user.referralCode || null,
    referralDiscountCredits: user.referralDiscountCredits || 0,
  };
}

function publicEstate(estate, store, userId) {
  const members = store.members.filter((m) => m.estateId === estate.id);
  const itemCount = store.items.filter((i) => i.estateId === estate.id).length;
  const myMember = members.find((m) => m.userId === userId);
  let myRole = estate.ownerId === userId ? 'owner' : myMember?.role || null;
  if (!myRole) {
    const eng = store.engagements?.find(
      (e) =>
        e.estateId === estate.id &&
        e.lawyerUserId === userId &&
        ['engaged', 'active'].includes(e.status)
    );
    if (eng) myRole = 'counsel';
  }
  return {
    ...estate,
    itemCount,
    memberCount: members.length + 1,
    myRole: myRole || 'viewer',
    health: computeLifeMapHealth(estate, store),
  };
}

// ── Auth ──────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, passwordConfirm, accountType, referralCode, ref } = req.body || {};
  if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
    return res.status(400).json({ error: 'Name, email, and password (6+) required' });
  }
  if (passwordConfirm != null && password !== passwordConfirm) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }
  const normalized = email.trim().toLowerCase();
  const store = readStore();
  if (store.users.some((u) => u.email === normalized)) {
    return res.status(409).json({ error: 'Email already registered — try Sign in or Forgot password' });
  }
  const passwordHash = await hashPassword(password);
  const type =
    accountType === 'lawyer' ? 'lawyer' : accountType === 'care' ? 'care' : 'family';
  let user = {
    id: uuid(),
    name: name.trim(),
    email: normalized,
    passwordHash,
    plan: 'free',
    accountType: type,
    preferredCity: (req.body?.city || '').trim() || null,
    createdAt: new Date().toISOString(),
  };
  mutate((s) => {
    if (!s.careWorkers) s.careWorkers = [];
    attachReferralOnRegister(s, user, referralCode || ref);
    ensureUserReferralFields(user, s);
    s.users.push(user);
    if (type === 'lawyer') {
      s.lawyers.push({
        id: uuid(),
        userId: user.id,
        slug: normalized.split('@')[0].replace(/[^a-z0-9]+/gi, '-'),
        name: user.name,
        firm: (req.body?.firm || 'Independent counsel').trim(),
        cities: [req.body?.city || 'India'].flat().filter(Boolean),
        specialties: ['succession'],
        languages: ['English', 'Hindi'],
        barId: req.body?.barId || 'Pending verification',
        years: Number(req.body?.years) || 1,
        retainerBand: 'On request',
        slaHours: 24,
        bio: req.body?.bio || 'Estate counsel on HeirReady.',
        rating: 5,
        mattersCompleted: 0,
        nriFriendly: true,
        verified: false,
        acceptingMatters: true,
        createdAt: new Date().toISOString(),
      });
    }
    if (type === 'care') {
      const roleRaw = String(req.body?.role || 'maid').trim();
      s.careWorkers.push({
        id: uuid(),
        userId: user.id,
        name: user.name,
        role: ['nurse', 'attendant', 'maid', 'cook', 'driver', 'other'].includes(roleRaw)
          ? roleRaw
          : 'maid',
        cities: [req.body?.city || user.preferredCity].flat().filter(Boolean),
        languages: ['Hindi'],
        years: Number(req.body?.years) || 1,
        rateBand: req.body?.rateBand || '',
        shift: req.body?.shift || '',
        phone: req.body?.phone || '',
        bio: req.body?.bio || '',
        verified: false,
        acceptingWork: true,
        createdAt: new Date().toISOString(),
      });
    }
  });
  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const normalized = (email || '').trim().toLowerCase();
  const store = readStore();
  const user = store.users.find((u) => u.email === normalized);
  if (!user || !(await verifyPassword(password || '', user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  mutate((s) => {
    const u = s.users.find((x) => x.id === user.id);
    if (u) ensureUserReferralFields(u, s);
  });
  const refreshed = readStore().users.find((u) => u.id === user.id) || user;
  const token = signToken(refreshed);
  res.json({ token, user: publicUser(refreshed) });
});

/** Always 200 — don’t reveal whether email exists. */
app.post('/api/auth/forgot-password', async (req, res) => {
  const normalized = String(req.body?.email || '')
    .trim()
    .toLowerCase();
  const okMsg = {
    ok: true,
    message: 'If that email is registered, you’ll get a reset link shortly. Check spam too.',
  };
  if (!normalized.includes('@')) {
    return res.status(400).json({ error: 'Enter a valid email' });
  }

  const store = readStore();
  const user = store.users.find((u) => u.email === normalized);
  if (!user) return res.json(okMsg);

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  mutate((s) => {
    const u = s.users.find((x) => x.id === user.id);
    if (!u) return;
    u.passwordResetTokenHash = tokenHash;
    u.passwordResetExpiresAt = expiresAt;
    u.passwordResetRequestedAt = new Date().toISOString();
  });

  const base = (process.env.APP_URL || 'https://heirready.com').replace(/\/$/, '');
  const link = `${base}/auth?mode=reset&token=${rawToken}`;

  try {
    await sendPasswordResetEmail({ to: user.email, name: user.name, link });
  } catch (err) {
    console.error('password reset email failed', err.message);
  }

  res.json(okMsg);
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { token, password, passwordConfirm } = req.body || {};
  if (!token || !password || password.length < 6) {
    return res.status(400).json({ error: 'New password (6+) and reset token required' });
  }
  if (passwordConfirm != null && password !== passwordConfirm) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }

  const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
  const store = readStore();
  const now = Date.now();
  const user = store.users.find(
    (u) =>
      u.passwordResetTokenHash === tokenHash &&
      u.passwordResetExpiresAt &&
      new Date(u.passwordResetExpiresAt).getTime() > now
  );
  if (!user) {
    return res.status(400).json({ error: 'Reset link is invalid or expired. Request a new one.' });
  }

  const passwordHash = await hashPassword(password);
  mutate((s) => {
    const u = s.users.find((x) => x.id === user.id);
    if (!u) return;
    u.passwordHash = passwordHash;
    u.passwordResetTokenHash = null;
    u.passwordResetExpiresAt = null;
    u.passwordChangedAt = new Date().toISOString();
  });

  res.json({ ok: true, message: 'Password updated. You can sign in now.' });
});

app.get('/api/me', authRequired, (req, res) => {
  mutate((s) => {
    const u = s.users.find((x) => x.id === req.user.id);
    if (u) ensureUserReferralFields(u, s);
  });
  const store = readStore();
  const user = store.users.find((u) => u.id === req.user.id);
  res.json({
    user: publicUser(user || req.user),
    unreadNotifications: unreadCountFor(req.user.id),
  });
});

app.get('/api/notifications', authRequired, (req, res) => {
  const items = listNotifications(req.user.id);
  res.json({
    notifications: items,
    unread: items.filter((n) => !n.readAt).length,
    push: pushConfigured(),
  });
});

app.post('/api/notifications/read', authRequired, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : null;
  const marked = markNotificationsRead(req.user.id, ids);
  res.json({ ok: true, marked, unread: unreadCountFor(req.user.id) });
});

app.get('/api/push/vapid-public-key', (req, res) => {
  try {
    res.json({ publicKey: getVapidPublicKey(), configured: true });
  } catch (err) {
    res.status(503).json({ error: 'Push not configured', configured: false });
  }
});

app.post('/api/push/subscribe', authRequired, (req, res) => {
  try {
    savePushSubscription(req.user.id, req.body?.subscription || req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Subscribe failed' });
  }
});

app.post('/api/push/unsubscribe', authRequired, (req, res) => {
  removePushSubscription(req.user.id, req.body?.endpoint);
  res.json({ ok: true });
});

registerBillingRoutes(app);

app.post('/api/leads', async (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  const name = (req.body?.name || '').trim();
  const interest = (req.body?.interest || 'general').trim();
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  const leadId = uuid();
  mutate((s) => {
    if (!s.leads) s.leads = [];
    s.leads.push({
      id: leadId,
      type: 'human_onboarding',
      email,
      name,
      interest,
      at: new Date().toISOString(),
    });
  });

  const to = onboardingInboxEmail();
  const who = name || email;
  try {
    await sendEmail({
      to,
      replyTo: email,
      tags: [
        { name: 'category', value: 'onboarding' },
        { name: 'interest', value: interest.slice(0, 40) },
      ],
      subject: `[ONBOARDING] HeirReady — ${who} (${interest})`,
      text: `HUMAN ONBOARDING REQUEST — reply to this email to reach the requester.\n\nName: ${name || '—'}\nEmail: ${email}\nInterest: ${interest}\nLead id: ${leadId}\n\nAction: reply and schedule setup.`,
      html: `<div style="font-family:Georgia,serif;line-height:1.5;color:#14201a">
        <p style="display:inline-block;background:#2c4d3c;color:#fff;padding:6px 12px;border-radius:999px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;margin:0 0 12px">Human onboarding</p>
        <h2 style="margin:0 0 8px;font-weight:600">New onboarding request</h2>
        <p style="margin:0 0 16px;color:#3a4a42">Someone asked for help setting up their first estate. Hit <strong>Reply</strong> to email them directly.</p>
        <p style="margin:0 0 4px"><strong>Name:</strong> ${name || '—'}</p>
        <p style="margin:0 0 4px"><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
        <p style="margin:0 0 16px"><strong>Interest:</strong> ${interest}</p>
        <p style="font-size:12px;color:#3a4a42;margin:0">Lead id: ${leadId}</p>
      </div>`,
    });
  } catch (err) {
    console.error('onboarding lead email failed', err.message);
  }

  res.status(201).json({ ok: true });
});

// ── Estates ───────────────────────────────────────────
app.get('/api/estates', authRequired, (req, res) => {
  const store = readStore();
  const owned = store.estates.filter((e) => e.ownerId === req.user.id);
  const sharedIds = store.members
    .filter((m) => m.userId === req.user.id && m.status === 'active')
    .map((m) => m.estateId);
  const shared = store.estates.filter((e) => sharedIds.includes(e.id));
  const counselIds = (store.engagements || [])
    .filter(
      (e) => e.lawyerUserId === req.user.id && ['engaged', 'active'].includes(e.status)
    )
    .map((e) => e.estateId);
  const counselEstates = store.estates.filter((e) => counselIds.includes(e.id));
  const map = new Map();
  for (const e of [...owned, ...shared, ...counselEstates]) map.set(e.id, e);
  res.json({ estates: [...map.values()].map((e) => publicEstate(e, store, req.user.id)) });
});

app.post('/api/estates', authRequired, (req, res) => {
  const { subjectName, subjectRelation, country, countryPack, notes } = req.body || {};
  if (!subjectName?.trim()) {
    return res.status(400).json({ error: 'Parent / subject name required' });
  }
  const store = readStore();
  let pack;
  try {
    assertCanCreateEstate(store, req.user);
    pack = normalizeCountryPack(countryPack || country || 'IN', req.user, { strict: true });
  } catch (err) {
    return res.status(err.status || 400).json({
      error: err.message,
      code: err.code || (err.status === 402 ? 'PLAN_LIMIT' : undefined),
      upgradePlan: err.upgradePlan || (err.status === 402 ? 'family' : undefined),
    });
  }
  const estate = {
    id: uuid(),
    ownerId: req.user.id,
    subjectName: subjectName.trim(),
    subjectRelation: subjectRelation?.trim() || 'Parent',
    country: pack === 'IN' ? 'IN' : pack,
    countryPack: pack,
    notes: notes?.trim() || '',
    status: 'locked', // locked | unlock_pending | unlocked
    unlockRules: {
      mode: 'single', // single | dual
      unlockerUserIds: [req.user.id],
      requireProof: true,
      notifyMemberIds: true,
      cooldownHours: 48,
    },
    unlockedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  ensureEstateDefaults(estate);
  estate.housewarming = {
    ...defaultHousewarmingState(),
    completedSteps: ['create'],
    currentStepId: 'call',
    startedAt: new Date().toISOString(),
  };
  mutate((s) => {
    s.estates.push(estate);
    audit(s, {
      estateId: estate.id,
      userId: req.user.id,
      action: 'estate_created',
      detail: `Created estate for ${estate.subjectName} (${pack})`,
    });
  });
  res.status(201).json({ estate });
});

app.get('/api/estates/:id', authRequired, (req, res) => {
  const store = readStore();
  const access = canAccessEstate(store, req.user.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  mutate((s) => {
    const e = s.estates.find((x) => x.id === access.estate.id);
    if (e) ensureEstateDefaults(e);
  });
  const estate = readStore().estates.find((e) => e.id === access.estate.id);
  const items = store.items.filter((i) => i.estateId === access.estate.id);
  const members = store.members.filter((m) => m.estateId === access.estate.id);
  const memberViews = members.map((m) => {
    const u = store.users.find((x) => x.id === m.userId);
    return {
      ...m,
      name: u?.name || m.inviteEmail,
      email: u?.email || m.inviteEmail,
    };
  });
  const owner = store.users.find((u) => u.id === estate.ownerId);
  const unlockRequests = store.unlockRequests.filter((r) => r.estateId === estate.id);
  const tasks =
    estate.status === 'unlocked'
      ? store.tasks.filter((t) => t.estateId === estate.id).sort((a, b) => a.priority - b.priority)
      : [];
  const auditLog = store.audit
    .filter((a) => a.estateId === estate.id)
    .slice(-100)
    .reverse();

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const expiringSoon = items.filter((i) => {
    if (!i.expiresOn) return false;
    const t = new Date(i.expiresOn).getTime();
    return t >= now && t <= now + 60 * day;
  });
  const expired = items.filter((i) => i.expiresOn && new Date(i.expiresOn).getTime() < now);

  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '') || '';
  const emergencyUrl = `${appUrl}/e/${estate.emergencyToken}`;

  res.json({
    estate: {
      ...publicEstate(estate, store, req.user.id),
      nextReviewAt: estate.nextReviewAt,
      emergencyToken: estate.emergencyToken,
      emergencyUrl,
    },
    items,
    members: [
      {
        id: 'owner',
        role: 'owner',
        status: 'active',
        userId: owner?.id,
        name: owner?.name,
        email: owner?.email,
      },
      ...memberViews,
    ],
    unlockRequests,
    tasks,
    audit: auditLog,
    categories: ITEM_CATEGORIES,
    careRoles: CARE_ROLES,
    countryPacks: COUNTRY_PACKS,
    interviewQuestions: INTERVIEW_QUESTIONS,
    housewarming: housewarmingPublic(access.estate, items),
    expiringSoon,
    expired,
    limits: {
      plan: owner?.plan || 'free',
      planExpiresAt: owner?.planExpiresAt || null,
      freeMaxItems: FREE_MAX_ITEMS,
      freeMaxEstates: FREE_MAX_ESTATES,
      itemCount: items.length,
      paid: owner ? ownerHasPaidPlan(store, access.estate) : false,
    },
  });
});

app.patch('/api/estates/:id', authRequired, (req, res) => {
  const store = readStore();
  const access = canAccessEstate(store, req.user.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  if (access.role !== 'owner' && access.role !== 'manager') {
    return res.status(403).json({ error: 'Only owner/manager can edit estate' });
  }
  const owner = store.users.find((u) => u.id === access.estate.ownerId);
  if (req.body?.countryPack != null || req.body?.country != null) {
    try {
      normalizeCountryPack(req.body.countryPack || req.body.country, owner || 'free', { strict: true });
    } catch (err) {
      return res.status(err.status || 400).json({
        error: err.message,
        code: err.code || (err.status === 402 ? 'PLAN_LIMIT' : undefined),
        upgradePlan: err.upgradePlan || 'diaspora',
      });
    }
  }
  const updated = mutate((s) => {
    const estate = s.estates.find((e) => e.id === req.params.id);
    const { subjectName, subjectRelation, country, countryPack, notes, unlockRules } = req.body || {};
    if (subjectName != null) estate.subjectName = subjectName.trim();
    if (subjectRelation != null) estate.subjectRelation = subjectRelation.trim();
    if (countryPack != null || country != null) {
      const pack = normalizeCountryPack(countryPack || country, owner || 'free', { strict: true });
      estate.countryPack = pack;
      estate.country = pack === 'IN' ? 'IN' : pack;
    }
    if (notes != null) estate.notes = notes;
    if (unlockRules) {
      estate.unlockRules = { ...estate.unlockRules, ...unlockRules };
    }
    estate.updatedAt = new Date().toISOString();
    audit(s, {
      estateId: estate.id,
      userId: req.user.id,
      action: 'estate_updated',
      detail: 'Updated estate settings / unlock rules',
    });
    return estate;
  });
  res.json({ estate: updated });
});

app.post('/api/estates/:id/seed-sample', authRequired, (req, res) => {
  const store = readStore();
  const access = canAccessEstate(store, req.user.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  if (access.estate.status === 'unlocked') {
    return res.status(400).json({ error: 'Cannot seed after unlock' });
  }
  const samples = [
    {
      category: 'bank',
      title: 'SBI Savings',
      institution: 'State Bank of India',
      accountRef: 'XXXX1234',
      notes: 'Primary salary account. Nominee: spouse.',
    },
    {
      category: 'bank',
      title: 'HDFC Savings',
      institution: 'HDFC Bank',
      accountRef: 'XXXX5678',
      notes: 'Joint-ish family use; confirm nominee at branch.',
    },
    {
      category: 'insurance',
      title: 'LIC Jeevan Anand',
      institution: 'LIC of India',
      accountRef: 'POL-998877',
      notes: 'Keep original policy bond with property papers.',
    },
    {
      category: 'investments',
      title: 'NSDL Demat',
      institution: 'Zerodha / NSDL',
      accountRef: 'IN300XXXX',
      notes: 'Transmission form needed after death certificate.',
    },
    {
      category: 'property',
      title: 'Flat — Andheri East',
      institution: 'Society records',
      accountRef: 'Wing B / 1203',
      notes: 'Title deed in steel cupboard. Society share certificate too.',
    },
    {
      category: 'digital',
      title: 'Primary mobile + UPI',
      institution: 'Airtel',
      accountRef: '+91-98XXXXXX',
      notes: 'SIM linked to banks. Preserve for OTPs during claims.',
    },
    {
      category: 'subscriptions',
      title: 'Netflix + Spotify',
      institution: 'Card autopay',
      accountRef: '',
      notes: 'Cancel after settling month.',
    },
    {
      category: 'care',
      title: 'Sunita',
      institution: 'Nurse',
      accountRef: '+91-98XXXXXX01',
      shift: 'Night · 8pm–8am',
      paidBy: 'Son (abroad) via UPI to neighbour',
      backupContact: 'Building watchman — 98XXXXXX02',
      notes: 'Has spare keys. Call before hospital discharge.',
    },
    {
      category: 'care',
      title: 'Meena',
      institution: 'Maid / domestic help',
      accountRef: '+91-97XXXXXX03',
      shift: 'Morning · 8am–12pm',
      paidBy: 'Cash weekly by neighbour aunt',
      backupContact: 'Sister-in-law (local)',
      notes: 'Knows cupboard where medicines are kept.',
    },
    {
      category: 'contacts',
      title: 'Family CA',
      institution: 'Sharma & Co.',
      accountRef: '',
      notes: 'Handles ITR and PF queries.',
    },
    {
      category: 'wishes',
      title: 'Funeral preferences',
      institution: '',
      accountRef: '',
      notes: 'Simple cremation; inform village relatives within 24h.',
    },
  ];
  const slots = remainingItemSlots(store, req.user, access.estate.id);
  if (slots === 0) {
    return res.status(402).json({
      error: `Free plan vault is full (${FREE_MAX_ITEMS} items). Delete some items or upgrade on Pricing.`,
      code: 'PLAN_LIMIT',
      upgradePlan: 'family',
    });
  }
  const toAdd = Number.isFinite(slots) ? samples.slice(0, slots) : samples;
  mutate((s) => {
    for (const sample of toAdd) {
      s.items.push({
        id: uuid(),
        estateId: access.estate.id,
        ...sample,
        files: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: req.user.id,
      });
    }
    audit(s, {
      estateId: access.estate.id,
      userId: req.user.id,
      action: 'sample_seeded',
      detail: `Loaded ${toAdd.length} India sample Life Map items`,
    });
  });
  res.json({
    ok: true,
    added: toAdd.length,
    truncated: toAdd.length < samples.length,
    message:
      toAdd.length < samples.length
        ? `Loaded ${toAdd.length} sample items (free plan max ${FREE_MAX_ITEMS}). Upgrade for the full sample pack.`
        : `Loaded ${toAdd.length} sample items`,
  });
});

// ── Life Map items ────────────────────────────────────
app.post('/api/estates/:id/items', authRequired, upload.array('files', 5), async (req, res) => {
  const store = readStore();
  const access = canAccessEstate(store, req.user.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  if (access.estate.status === 'unlocked' && access.role === 'viewer') {
    return res.status(403).json({ error: 'Viewers cannot add items after unlock' });
  }
  try {
    assertCanAddItems(store, req.user, access.estate.id, 1);
  } catch (err) {
    return res.status(err.status || 400).json({
      error: err.message,
      code: err.code || (err.status === 402 ? 'PLAN_LIMIT' : undefined),
      upgradePlan: err.upgradePlan || (err.status === 402 ? 'family' : undefined),
    });
  }
  const { category, title, institution, accountRef, notes, shift, paidBy, backupContact } =
    req.body || {};
  if (!category || !title?.trim()) {
    return res.status(400).json({ error: 'Category and title required' });
  }
  const files = [];
  for (const f of req.files || []) {
    const saved = await saveUpload({
      name: f.originalname,
      mime: f.mimetype,
      buffer: f.buffer,
    });
    files.push(saved);
  }
  const item = {
    id: uuid(),
    estateId: access.estate.id,
    category,
    title: title.trim(),
    institution: (institution || '').trim(),
    accountRef: (accountRef || '').trim(),
    notes: (notes || '').trim(),
    shift: shift ? String(shift).trim() : null,
    paidBy: paidBy ? String(paidBy).trim() : null,
    backupContact: backupContact ? String(backupContact).trim() : null,
    expiresOn: req.body?.expiresOn ? String(req.body.expiresOn).trim() : null,
    files,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: req.user.id,
  };
  mutate((s) => {
    s.items.push(item);
    audit(s, {
      estateId: access.estate.id,
      userId: req.user.id,
      action: 'item_added',
      detail: `Added ${category}: ${item.title}`,
    });
  });
  res.status(201).json({ item });
});

app.post('/api/estates/:id/items/scan', authRequired, upload.single('photo'), async (req, res) => {
  const store = readStore();
  const access = canAccessEstate(store, req.user.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  if (!['owner', 'manager'].includes(access.role)) {
    return res.status(403).json({ error: 'Only owner/manager can scan' });
  }
  if (!req.file) return res.status(400).json({ error: 'Photo required' });
  try {
    assertCanAddItems(store, req.user, access.estate.id, 1);
  } catch (err) {
    return res.status(err.status || 400).json({
      error: err.message,
      code: err.code || (err.status === 402 ? 'PLAN_LIMIT' : undefined),
      upgradePlan: err.upgradePlan || (err.status === 402 ? 'family' : undefined),
    });
  }
  const draft = await draftFromPhoto({
    buffer: req.file.buffer,
    mime: req.file.mimetype,
    name: req.file.originalname,
    categoryHint: req.body?.category || '',
  });
  const saved = await saveUpload({
    name: req.file.originalname,
    mime: req.file.mimetype,
    buffer: req.file.buffer,
  });
  const item = {
    id: uuid(),
    estateId: access.estate.id,
    category: draft.category,
    title: draft.title,
    institution: draft.institution,
    accountRef: draft.accountRef,
    notes: draft.notes,
    expiresOn: null,
    files: [saved],
    source: draft.source || 'scan',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: req.user.id,
  };
  mutate((s) => {
    s.items.push(item);
    audit(s, {
      estateId: access.estate.id,
      userId: req.user.id,
      action: 'item_scanned',
      detail: `Photo draft: ${item.title} (${draft.source})`,
    });
  });
  res.status(201).json({ item, draftSource: draft.source });
});

app.patch('/api/estates/:id/items/:itemId', authRequired, (req, res) => {
  const store = readStore();
  const access = canAccessEstate(store, req.user.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  const item = mutate((s) => {
    const row = s.items.find(
      (i) => i.id === req.params.itemId && i.estateId === req.params.id
    );
    if (!row) return null;
    const fields = [
      'category',
      'title',
      'institution',
      'accountRef',
      'notes',
      'expiresOn',
      'shift',
      'paidBy',
      'backupContact',
    ];
    for (const f of fields) {
      if (req.body?.[f] != null) row[f] = String(req.body[f]).trim() || null;
    }
    row.updatedAt = new Date().toISOString();
    audit(s, {
      estateId: access.estate.id,
      userId: req.user.id,
      action: 'item_updated',
      detail: `Updated ${row.title}`,
    });
    return row;
  });
  if (!item) return res.status(404).json({ error: 'Item not found' });
  res.json({ item });
});

app.delete('/api/estates/:id/items/:itemId', authRequired, (req, res) => {
  const store = readStore();
  const access = canAccessEstate(store, req.user.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  if (access.role === 'viewer') {
    return res.status(403).json({ error: 'Viewers cannot delete' });
  }
  mutate((s) => {
    const idx = s.items.findIndex(
      (i) => i.id === req.params.itemId && i.estateId === req.params.id
    );
    if (idx >= 0) {
      const [removed] = s.items.splice(idx, 1);
      audit(s, {
        estateId: access.estate.id,
        userId: req.user.id,
        action: 'item_deleted',
        detail: `Deleted ${removed.title}`,
      });
    }
  });
  res.json({ ok: true });
});

// ── Members & invites ─────────────────────────────────
/** Durable multi-use family invite (Discord-style) — owner or manager. */
app.get('/api/estates/:id/family-link', authRequired, (req, res) => {
  const store = readStore();
  const access = canAccessEstate(store, req.user.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  if (access.role !== 'owner' && access.role !== 'manager') {
    return res.status(403).json({ error: 'Only owner or manager can share the family link' });
  }
  const role = req.query.role === 'viewer' ? 'viewer' : 'manager';
  let invite = findActiveFamilyInvite(store, access.estate.id, role);
  if (!invite) {
    invite = mutate((s) => {
      const created = ensureFamilyInvite(s, access.estate.id, {
        role,
        invitedBy: req.user.id,
      });
      audit(s, {
        estateId: access.estate.id,
        userId: req.user.id,
        action: 'family_link_created',
        detail: `Multi-use ${role} invite`,
      });
      return created;
    });
  }
  const fresh = readStore();
  const estate = fresh.estates.find((e) => e.id === access.estate.id);
  res.json({ invite: familyInvitePublicView(invite, fresh, estate) });
});

app.post('/api/estates/:id/family-link', authRequired, (req, res) => {
  const store = readStore();
  const access = canAccessEstate(store, req.user.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  if (access.role !== 'owner' && access.role !== 'manager') {
    return res.status(403).json({ error: 'Only owner or manager can share the family link' });
  }
  const role = req.body?.role === 'viewer' ? 'viewer' : 'manager';
  const rotate = Boolean(req.body?.rotate);
  const invite = mutate((s) => {
    if (rotate) {
      for (const inv of s.invites || []) {
        if (
          inv.estateId === access.estate.id &&
          inv.multiUse &&
          inv.status === 'pending' &&
          (inv.role || 'manager') === role
        ) {
          inv.status = 'revoked';
          inv.revokedAt = new Date().toISOString();
        }
      }
    }
    const created = ensureFamilyInvite(s, access.estate.id, {
      role,
      invitedBy: req.user.id,
    });
    audit(s, {
      estateId: access.estate.id,
      userId: req.user.id,
      action: rotate ? 'family_link_rotated' : 'family_link_ensured',
      detail: `Multi-use ${role} invite`,
    });
    return created;
  });
  const fresh = readStore();
  const estate = fresh.estates.find((e) => e.id === access.estate.id);
  res.status(201).json({ invite: familyInvitePublicView(invite, fresh, estate) });
});

app.post('/api/estates/:id/invites', authRequired, async (req, res) => {
  const store = readStore();
  const access = canAccessEstate(store, req.user.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  if (access.role !== 'owner' && access.role !== 'manager') {
    return res.status(403).json({ error: 'Only owner or manager can invite' });
  }
  const email = (req.body?.email || '').trim().toLowerCase();
  const role = req.body?.role === 'manager' ? 'manager' : 'viewer';

  // Open invite → durable multi-use family link
  if (!email) {
    const invite = mutate((s) => {
      const created = ensureFamilyInvite(s, access.estate.id, {
        role: role === 'viewer' ? 'viewer' : 'manager',
        invitedBy: req.user.id,
      });
      audit(s, {
        estateId: access.estate.id,
        userId: req.user.id,
        action: 'invite_created',
        detail: `Open multi-use WhatsApp invite as ${created.role}`,
      });
      return created;
    });
    const fresh = readStore();
    const view = familyInvitePublicView(invite, fresh, access.estate);
    return res.status(201).json({
      invite: {
        id: invite.id,
        email: null,
        role: invite.role,
        expiresAt: invite.expiresAt,
        link: view.link,
        token: invite.token,
        emailStatus: 'skipped',
        openInvite: true,
        multiUse: true,
        memberCount: view.memberCount,
        remaining: view.remaining,
      },
    });
  }

  const token = crypto.randomBytes(24).toString('hex');
  const invite = {
    id: uuid(),
    estateId: access.estate.id,
    email,
    role,
    token,
    invitedBy: req.user.id,
    status: 'pending',
    multiUse: false,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  };
  mutate((s) => {
    s.invites.push(invite);
    audit(s, {
      estateId: access.estate.id,
      userId: req.user.id,
      action: 'invite_created',
      detail: `Invite for ${email} as ${role}`,
    });
  });
  const base = (process.env.APP_URL || '').replace(/\/$/, '') || 'https://heirready.com';
  const link = `${base}/invite/${token}`;
  let emailStatus = 'skipped';
  try {
    const sent = await sendInviteEmail({
      to: email,
      estateName: access.estate.subjectName,
      role,
      link,
      inviterName: req.user.name,
    });
    emailStatus = sent.mode;
  } catch (err) {
    emailStatus = 'failed';
    console.error('invite email failed', err.message);
  }
  res.status(201).json({
    invite: {
      id: invite.id,
      email,
      role,
      expiresAt: invite.expiresAt,
      link,
      token,
      emailStatus,
      openInvite: false,
      multiUse: false,
    },
  });
});

/** Estate family thread — open notes for everyone on the estate; email-notify others. */
app.get('/api/estates/:id/thread', authRequired, (req, res) => {
  const store = readStore();
  const access = canAccessEstate(store, req.user.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  const posts = (store.estateThreadPosts || [])
    .filter((p) => p.estateId === access.estate.id && !p.deletedAt)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .slice(-200);
  res.json({ posts });
});

app.post('/api/estates/:id/thread', authRequired, async (req, res) => {
  const store = readStore();
  const access = canAccessEstate(store, req.user.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const body = String(req.body?.body || '').trim().slice(0, 2000);
  if (body.length < 1) return res.status(400).json({ error: 'Write a short note' });

  const author = store.users.find((u) => u.id === req.user.id);
  const post = {
    id: uuid(),
    estateId: access.estate.id,
    authorId: req.user.id,
    authorName: author?.name || req.user.name || 'Family',
    body,
    createdAt: new Date().toISOString(),
  };

  mutate((s) => {
    if (!s.estateThreadPosts) s.estateThreadPosts = [];
    s.estateThreadPosts.push(post);
    if (s.estateThreadPosts.length > 5000) {
      s.estateThreadPosts = s.estateThreadPosts.slice(-4000);
    }
    audit(s, {
      estateId: access.estate.id,
      userId: req.user.id,
      action: 'thread_post',
      detail: body.slice(0, 120),
    });
  });

  const fresh = readStore();
  const estate = fresh.estates.find((e) => e.id === access.estate.id);
  const recipients = [];
  const owner = fresh.users.find((u) => u.id === estate?.ownerId);
  if (owner?.email && owner.id !== req.user.id) {
    recipients.push({ email: owner.email, name: owner.name });
  }
  for (const m of fresh.members.filter((x) => x.estateId === estate.id && x.status === 'active')) {
    if (m.userId === req.user.id) continue;
    const u = fresh.users.find((x) => x.id === m.userId);
    if (u?.email) recipients.push({ email: u.email, name: u.name });
  }
  const seen = new Set();
  const unique = recipients.filter((r) => {
    const key = r.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const base = (process.env.APP_URL || 'https://heirready.com').replace(/\/$/, '');
  const link = `${base}/app/estates/${estate.id}?tab=family`;
  let notified = 0;
  await Promise.all(
    unique.map(async (r) => {
      try {
        await sendEstateThreadNotify({
          to: r.email,
          recipientName: r.name,
          estateName: estate.subjectName,
          authorName: post.authorName,
          body: post.body,
          link,
        });
        notified += 1;
      } catch (err) {
        console.error('thread notify failed', r.email, err.message);
      }
    })
  );

  const notifyIds = [];
  if (owner?.id && owner.id !== req.user.id) notifyIds.push(owner.id);
  for (const m of fresh.members.filter((x) => x.estateId === estate.id && x.status === 'active')) {
    if (m.userId && m.userId !== req.user.id) notifyIds.push(m.userId);
  }
  notifyUsers({
    userIds: notifyIds,
    title: `${estate.subjectName}: new family note`,
    body: `${post.authorName}: ${post.body.slice(0, 140)}`,
    url: `/app/estates/${estate.id}?tab=family`,
    type: 'family_note',
    estateId: estate.id,
  });

  res.status(201).json({ post, notified });
});

app.get('/api/invites/:token', (req, res) => {
  const store = readStore();
  const invite = store.invites.find((i) => i.token === req.params.token);
  if (!invite || !inviteIsAcceptable(invite)) {
    return res.status(404).json({ error: 'Invite not found or already used' });
  }
  const estate = store.estates.find((e) => e.id === invite.estateId);
  const openInvite = !invite.email;
  const members = (store.members || []).filter(
    (m) => m.estateId === invite.estateId && m.status === 'active'
  );
  res.json({
    email: invite.email || null,
    openInvite,
    multiUse: Boolean(invite.multiUse),
    role: invite.role,
    estateName: estate?.subjectName,
    expiresAt: invite.expiresAt,
    memberCount: members.length + 1,
    remaining: invite.multiUse
      ? Math.max(0, (invite.maxUses ?? 25) - (invite.useCount || 0))
      : 1,
  });
});

app.post('/api/invites/:token/accept', authRequired, async (req, res) => {
  const store = readStore();
  const invite = store.invites.find((i) => i.token === req.params.token);
  if (!invite || !inviteIsAcceptable(invite)) {
    return res.status(404).json({ error: 'Invite not found or already used' });
  }
  const estate = store.estates.find((e) => e.id === invite.estateId);
  if (!estate) return res.status(404).json({ error: 'Estate not found' });
  if (estate.ownerId === req.user.id) {
    return res.status(400).json({ error: 'You already own this file' });
  }
  const openInvite = !invite.email;
  if (!openInvite && req.user.email !== invite.email) {
    return res.status(403).json({
      error: `Sign in as ${invite.email} to accept this invite`,
    });
  }
  if (req.user.accountType === 'lawyer' || req.user.accountType === 'care') {
    return res.status(403).json({ error: 'Family accounts only — switch to a family login to join a vault' });
  }
  const already = store.members.find(
    (m) => m.estateId === invite.estateId && m.userId === req.user.id && m.status === 'active'
  );
  if (already) {
    const familyInvite = findActiveFamilyInvite(store, invite.estateId, 'manager');
    return res.json({
      ok: true,
      estateId: invite.estateId,
      alreadyMember: true,
      familyInviteLink: familyInvite ? inviteLinkFor(familyInvite.token) : null,
    });
  }

  mutate((s) => {
    const inv = s.invites.find((i) => i.id === invite.id);
    consumeInvite(inv, req.user.email);
    const exists = s.members.find(
      (m) => m.estateId === invite.estateId && m.userId === req.user.id
    );
    if (!exists) {
      s.members.push({
        id: uuid(),
        estateId: invite.estateId,
        userId: req.user.id,
        inviteEmail: inv.email || req.user.email,
        role: invite.role,
        status: 'active',
        createdAt: new Date().toISOString(),
      });
    }
    const e = s.estates.find((x) => x.id === invite.estateId);
    if (invite.role === 'manager' && e) {
      const ids = e.unlockRules.unlockerUserIds || [];
      if (!ids.includes(req.user.id)) ids.push(req.user.id);
      e.unlockRules.unlockerUserIds = ids;
    }
    // Keep a durable family link alive for the forward-loop
    ensureFamilyInvite(s, invite.estateId, {
      role: 'manager',
      invitedBy: req.user.id,
    });
    audit(s, {
      estateId: invite.estateId,
      userId: req.user.id,
      action: 'invite_accepted',
      detail: `${req.user.email} joined as ${invite.role}`,
    });
  });

  const fresh = readStore();
  const owner = fresh.users.find((u) => u.id === estate.ownerId);
  const familyInvite = findActiveFamilyInvite(fresh, invite.estateId, 'manager');
  const familyInviteLink = familyInvite ? inviteLinkFor(familyInvite.token) : null;
  const memberCount =
    (fresh.members || []).filter((m) => m.estateId === invite.estateId && m.status === 'active')
      .length + 1;
  const base = (process.env.APP_URL || '').replace(/\/$/, '') || 'https://heirready.com';
  if (owner?.email && owner.id !== req.user.id) {
    sendSiblingJoinedEmail({
      to: owner.email,
      ownerName: owner.name,
      siblingName: req.user.name || req.user.email,
      estateName: estate.subjectName,
      link: `${base}/app/estates/${estate.id}?tab=family`,
    }).catch((err) => console.error('sibling joined email failed', err.message));
  }
  if (owner?.id && owner.id !== req.user.id) {
    notifyUsers({
      userIds: [owner.id],
      title: `${req.user.name || 'A sibling'} joined ${estate.subjectName}`,
      body: `${memberCount} on the map — forward the family link to another sibling.`,
      url: `/app/estates/${estate.id}?tab=family`,
      type: 'sibling_joined',
      estateId: estate.id,
    });
  }
  // Loop: new joiner gets a nudge to invite the next sibling
  notifyUsers({
    userIds: [req.user.id],
    title: `You’re on ${estate.subjectName}`,
    body: 'WhatsApp the same family link to another sibling while it’s open.',
    url: `/app/estates/${estate.id}?tab=family&welcome=1`,
    type: 'sibling_joined_loop',
    estateId: estate.id,
  });

  res.json({
    ok: true,
    estateId: invite.estateId,
    celebrated: true,
    memberCount,
    familyInviteLink,
    message: `You’re in — ${owner?.name || 'the owner'} was notified. Invite another sibling with the same link.`,
  });
});

app.post('/api/estates/:id/members', authRequired, async (req, res) => {
  const store = readStore();
  const access = canAccessEstate(store, req.user.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  if (access.role !== 'owner' && access.role !== 'manager') {
    return res.status(403).json({ error: 'Only owner or manager can invite' });
  }
  const email = (req.body?.email || '').trim().toLowerCase();
  const role = req.body?.role === 'manager' ? 'manager' : 'viewer';

  // Open WhatsApp invite → durable multi-use family link
  if (!email) {
    const invite = mutate((s) => {
      const created = ensureFamilyInvite(s, access.estate.id, {
        role: role === 'viewer' ? 'viewer' : 'manager',
        invitedBy: req.user.id,
      });
      audit(s, {
        estateId: access.estate.id,
        userId: req.user.id,
        action: 'member_invited',
        detail: `Open multi-use WhatsApp invite as ${created.role}`,
      });
      return created;
    });
    const fresh = readStore();
    const view = familyInvitePublicView(invite, fresh, access.estate);
    return res.status(201).json({
      member: null,
      invite: {
        id: invite.id,
        email: null,
        role: invite.role,
        token: invite.token,
        link: view.link,
        emailStatus: 'skipped',
        status: invite.status,
        openInvite: true,
        multiUse: true,
        memberCount: view.memberCount,
        remaining: view.remaining,
      },
    });
  }

  const invitee = store.users.find((u) => u.email === email);
  const token = crypto.randomBytes(24).toString('hex');
  const invite = {
    id: uuid(),
    estateId: access.estate.id,
    email,
    role,
    token,
    invitedBy: req.user.id,
    status: 'pending',
    multiUse: false,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  };

  let member = null;
  mutate((s) => {
    s.invites.push(invite);
    if (invitee && invitee.id !== access.estate.ownerId) {
      const existing = s.members.find(
        (m) => m.estateId === access.estate.id && m.userId === invitee.id
      );
      if (!existing) {
        member = {
          id: uuid(),
          estateId: access.estate.id,
          userId: invitee.id,
          inviteEmail: email,
          role,
          status: 'active',
          createdAt: new Date().toISOString(),
        };
        s.members.push(member);
        invite.status = 'accepted';
        invite.acceptedAt = new Date().toISOString();
        const rules = s.estates.find((e) => e.id === access.estate.id).unlockRules;
        if (role === 'manager' && !rules.unlockerUserIds.includes(invitee.id)) {
          rules.unlockerUserIds.push(invitee.id);
        }
      }
    }
    audit(s, {
      estateId: access.estate.id,
      userId: req.user.id,
      action: 'member_invited',
      detail: `Invited ${email} as ${role}`,
    });
  });

  const base = (process.env.APP_URL || '').replace(/\/$/, '') || 'https://heirready.com';
  const publicLink = `${base}/invite/${token}`;
  let emailStatus = 'skipped';
  if (invite.status === 'pending' || !member) {
    try {
      const sent = await sendInviteEmail({
        to: email,
        estateName: access.estate.subjectName,
        role,
        link: publicLink,
        inviterName: req.user.name,
      });
      emailStatus = sent.mode;
    } catch (err) {
      emailStatus = 'failed';
      console.error('invite email failed', err.message);
    }
  }

  res.status(201).json({
    member: member ? { ...member, name: invitee.name, email } : null,
    invite: {
      id: invite.id,
      email,
      role,
      token,
      link: publicLink,
      emailStatus,
      status: invite.status,
      openInvite: false,
      multiUse: false,
    },
  });
});

// ── Unlock flow ───────────────────────────────────────
app.post('/api/estates/:id/unlock/request', authRequired, upload.single('proof'), async (req, res) => {
  const store = readStore();
  const access = canAccessEstate(store, req.user.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  if (access.estate.status === 'unlocked') {
    return res.status(400).json({ error: 'Already unlocked' });
  }
  const rules = access.estate.unlockRules || {};
  const allowed = rules.unlockerUserIds || [access.estate.ownerId];
  if (!allowed.includes(req.user.id) && access.role !== 'owner') {
    return res.status(403).json({ error: 'You are not an appointed unlocker' });
  }
  const proofType = req.body?.proofType === 'incapacity' ? 'incapacity' : 'death';
  if (rules.requireProof !== false && !req.file) {
    return res.status(400).json({ error: 'Upload death certificate or incapacity letter' });
  }
  let proofPath = null;
  if (req.file) {
    const saved = await saveUpload({
      name: req.file.originalname,
      mime: req.file.mimetype,
      buffer: req.file.buffer,
    });
    proofPath = saved.path;
  }
  const request = {
    id: uuid(),
    estateId: access.estate.id,
    requestedBy: req.user.id,
    proofType,
    proofPath,
    status: rules.mode === 'dual' ? 'pending_approval' : 'approved',
    approvals: [req.user.id],
    createdAt: new Date().toISOString(),
  };

  const result = mutate((s) => {
    s.unlockRequests.push(request);
    const estate = s.estates.find((e) => e.id === access.estate.id);
    if (request.status === 'approved') {
      return finalizeUnlock(s, estate, req.user, request);
    }
    estate.status = 'unlock_pending';
    audit(s, {
      estateId: estate.id,
      userId: req.user.id,
      action: 'unlock_requested',
      detail: `Unlock requested (${proofType}). Waiting for second approver.`,
    });
    return { estate, request, unlocked: false };
  });

  if (result && !result.unlocked) {
    const unlockers = (access.estate.unlockRules?.unlockerUserIds || []).filter(
      (id) => id && id !== req.user.id
    );
    notifyUsers({
      userIds: unlockers,
      title: `${access.estate.subjectName}: unlock needs your approval`,
      body: `${req.user.name || 'Someone'} started unlock (${proofType}).`,
      url: `/app/estates/${access.estate.id}?tab=unlock`,
      type: 'unlock_pending',
      estateId: access.estate.id,
    });
  } else if (result?.unlocked) {
    const memberIds = store.members
      .filter((m) => m.estateId === access.estate.id && m.status === 'active')
      .map((m) => m.userId)
      .filter((id) => id && id !== req.user.id);
    if (access.estate.ownerId !== req.user.id) memberIds.push(access.estate.ownerId);
    notifyUsers({
      userIds: memberIds,
      title: `${access.estate.subjectName}: unlocked`,
      body: 'Execution checklist is ready.',
      url: `/app/estates/${access.estate.id}?tab=execute`,
      type: 'unlocked',
      estateId: access.estate.id,
    });
  }

  res.json(result);
});

app.post('/api/estates/:id/unlock/approve', authRequired, (req, res) => {
  const store = readStore();
  const access = canAccessEstate(store, req.user.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  const pending = store.unlockRequests
    .filter((r) => r.estateId === access.estate.id && r.status === 'pending_approval')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!pending) return res.status(404).json({ error: 'No pending unlock request' });
  const allowed = access.estate.unlockRules?.unlockerUserIds || [];
  if (!allowed.includes(req.user.id)) {
    return res.status(403).json({ error: 'Not an appointed unlocker' });
  }
  if (pending.approvals.includes(req.user.id)) {
    return res.status(400).json({ error: 'You already approved' });
  }

  const result = mutate((s) => {
    const reqRow = s.unlockRequests.find((r) => r.id === pending.id);
    reqRow.approvals.push(req.user.id);
    const need = 2;
    if (reqRow.approvals.length >= need) {
      reqRow.status = 'approved';
      const estate = s.estates.find((e) => e.id === access.estate.id);
      return finalizeUnlock(s, estate, req.user, reqRow);
    }
    audit(s, {
      estateId: access.estate.id,
      userId: req.user.id,
      action: 'unlock_approved_partial',
      detail: `Approval ${reqRow.approvals.length}/2 recorded`,
    });
    return { unlocked: false, request: reqRow };
  });
  res.json(result);
});

function finalizeUnlock(store, estate, user, request) {
  estate.status = 'unlocked';
  estate.unlockedAt = new Date().toISOString();
  const items = store.items.filter((i) => i.estateId === estate.id);
  const tasks = buildExecutionTasks(estate, items);
  store.tasks = store.tasks.filter((t) => t.estateId !== estate.id);
  store.tasks.push(...tasks);
  audit(store, {
    estateId: estate.id,
    userId: user.id,
    action: 'estate_unlocked',
    detail: `Execution Mode opened (${request.proofType}). ${tasks.length} tasks generated.`,
  });
  return { unlocked: true, estate, request, taskCount: tasks.length };
}

app.patch('/api/estates/:id/tasks/:taskId', authRequired, (req, res) => {
  const store = readStore();
  const access = canAccessEstate(store, req.user.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  if (access.estate.status !== 'unlocked') {
    return res.status(400).json({ error: 'Estate is still locked' });
  }
  const task = mutate((s) => {
    const row = s.tasks.find(
      (t) => t.id === req.params.taskId && t.estateId === req.params.id
    );
    if (!row) return null;
    if (req.body?.status) row.status = req.body.status;
    if (req.body?.notes != null) row.notes = req.body.notes;
    row.updatedAt = new Date().toISOString();
    audit(s, {
      estateId: access.estate.id,
      userId: req.user.id,
      action: 'task_updated',
      detail: `${row.title} → ${row.status}`,
    });
    return row;
  });
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json({ task });
});

app.get('/api/estates/:id/tasks/:taskId/letter', authRequired, (req, res) => {
  const store = readStore();
  const access = canAccessEstate(store, req.user.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  if (access.estate.status !== 'unlocked') {
    return res.status(400).json({ error: 'Unlock required' });
  }
  const task = store.tasks.find(
    (t) => t.id === req.params.taskId && t.estateId === req.params.id
  );
  if (!task?.letterKey) return res.status(404).json({ error: 'No letter for this task' });
  const item = store.items.find((i) => i.id === task.itemId);
  const lastUnlock = store.unlockRequests
    .filter((r) => r.estateId === access.estate.id && r.status === 'approved')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const letter = renderLetter(task.letterKey, {
    estate: access.estate,
    item,
    requester: req.user,
    proofType: lastUnlock?.proofType,
  });
  mutate((s) => {
    audit(s, {
      estateId: access.estate.id,
      userId: req.user.id,
      action: 'letter_downloaded',
      detail: task.title,
    });
  });
  res.json({ filename: `${task.letterKey}.txt`, content: letter });
});

app.get('/api/public/business', (_req, res) => {
  const appUrl = (process.env.APP_URL || 'https://heirready.com').replace(/\/$/, '');
  const support = publicSupportEmail();
  res.json({
    brand: process.env.BUSINESS_BRAND || 'HeirReady',
    legalName: process.env.BUSINESS_LEGAL_NAME || 'Namah',
    address:
      process.env.BUSINESS_ADDRESS ||
      '1/172 Viraj Khand, Gomti Nagar, Lucknow, Uttar Pradesh 226010, India',
    email: support,
    phone: null,
    hours: process.env.BUSINESS_HOURS || 'Mon–Sat, 10:00–18:00 IST',
    grievanceName: process.env.BUSINESS_GRIEVANCE_NAME || 'HeirReady Support',
    grievanceEmail: process.env.BUSINESS_GRIEVANCE_EMAIL
      ? /shubhramishra/i.test(process.env.BUSINESS_GRIEVANCE_EMAIL)
        ? support
        : process.env.BUSINESS_GRIEVANCE_EMAIL
      : support,
    website: appUrl.includes('estate-os') ? 'https://heirready.com' : appUrl,
    country: process.env.BUSINESS_COUNTRY || 'India',
    gstin: process.env.BUSINESS_GSTIN || null,
  });
});

app.post('/api/public/contact', async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 120);
  const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 160);
  const message = String(req.body?.message || '').trim().slice(0, 4000);
  if (!name || !email?.includes('@') || message.length < 10) {
    return res.status(400).json({ error: 'Name, valid email, and message (10+ chars) required' });
  }
  const to = publicSupportEmail();
  mutate((s) => {
    if (!s.leads) s.leads = [];
    s.leads.push({
      id: uuid(),
      type: 'contact_form',
      name,
      email,
      message,
      at: new Date().toISOString(),
    });
  });
  try {
    await sendEmail({
      to,
      replyTo: email,
      subject: `HeirReady contact: ${name}`,
      text: `From: ${name} <${email}>\n\n${message}`,
      html: `<p><strong>${name}</strong> &lt;${email}&gt;</p><p>${message.replace(/\n/g, '<br/>')}</p>`,
    });
  } catch (err) {
    console.error('contact email failed', err.message);
  }
  res.json({ ok: true });
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    product: 'HeirReady',
    persistence: persistenceMode(),
    files: persistenceMode() === 'postgres' ? 'postgres' : 'local',
    mail: mailConfigured() ? 'resend' : 'outbox',
    billing: razorpayConfigured() ? 'razorpay' : 'direct',
    careNetwork: CARE_NETWORK_COMING_SOON ? 'coming_soon' : 'live',
    /** Flip: Railway CARE_NETWORK_COMING_SOON=false + restart */
    version: '1.19.1',
    push: pushConfigured(),
  });
});

app.get('/api/estates/:id/export', authRequired, async (req, res) => {
  const store = readStore();
  const access = canAccessEstate(store, req.user.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  const items = store.items.filter((i) => i.estateId === access.estate.id);
  const tasks = store.tasks.filter((t) => t.estateId === access.estate.id);
  const zip = new JSZip();
  zip.file(
    'README.txt',
    `HeirReady export — ${access.estate.subjectName}\nGenerated ${new Date().toISOString()}\nNot legal advice.\n`
  );
  zip.file(
    'life-map.json',
    JSON.stringify({ estate: access.estate, items, tasks }, null, 2)
  );
  const summary = [
    `Estate: ${access.estate.subjectName}`,
    `Status: ${access.estate.status}`,
    '',
    'Life Map',
    ...items.map(
      (i) => `- [${i.category}] ${i.title} | ${i.institution || ''} | ${i.accountRef || ''}`
    ),
    '',
    'Tasks',
    ...tasks.map((t) => `- [${t.status}] ${t.title}`),
  ].join('\n');
  zip.file('summary.txt', summary);
  const originals = zip.folder('originals');
  for (const item of items) {
    for (const f of item.files || []) {
      const fileId = f.id || path.basename(f.path || '');
      const stored = await readUpload(fileId);
      if (stored?.buffer) {
        originals.file(`${item.title.replace(/\W+/g, '_')}_${stored.name}`, stored.buffer);
      }
    }
  }
  mutate((s) => {
    audit(s, {
      estateId: access.estate.id,
      userId: req.user.id,
      action: 'estate_exported',
      detail: 'ZIP export downloaded',
    });
  });
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="EstateOS_${access.estate.subjectName.replace(/\s+/g, '_')}.zip"`
  );
  res.send(buf);
});

// ── Interview / emergency / review ────────────────────
app.post('/api/estates/:id/housewarming', authRequired, async (req, res) => {
  const store = readStore();
  const access = canAccessEstate(store, req.user.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  if (!['owner', 'manager'].includes(access.role)) {
    return res.status(403).json({ error: 'Only owner/manager can update housewarming' });
  }

  const { stepId, complete, completeAll, dismiss, setCurrent, reopen } = req.body || {};
  let justCompleted = false;
  const result = mutate((s) => {
    const e = s.estates.find((x) => x.id === access.estate.id);
    if (!e) return null;
    ensureEstateDefaults(e);
    if (!e.housewarming) e.housewarming = defaultHousewarmingState();
    const hw = e.housewarming;
    const wasComplete = Boolean(hw.completedAt);
    if (!hw.startedAt) hw.startedAt = new Date().toISOString();

    if (reopen) {
      hw.dismissed = false;
      hw.completedAt = null;
      hw.currentStepId = HOUSEWARMING_STEPS[0].id;
    }
    if (dismiss) {
      hw.dismissed = true;
    }
    if (setCurrent && stepId) {
      hw.currentStepId = stepId;
      hw.dismissed = false;
    }
    if (complete && stepId) {
      if (!hw.completedSteps.includes(stepId)) hw.completedSteps.push(stepId);
      const idx = HOUSEWARMING_STEPS.findIndex((st) => st.id === stepId);
      const next = HOUSEWARMING_STEPS[idx + 1];
      hw.currentStepId = next?.id || stepId;
      if (hw.completedSteps.length >= HOUSEWARMING_STEPS.length) {
        hw.completedAt = new Date().toISOString();
      }
    }
    if (completeAll) {
      hw.completedSteps = HOUSEWARMING_STEPS.map((st) => st.id);
      hw.completedAt = new Date().toISOString();
      hw.currentStepId = HOUSEWARMING_STEPS[HOUSEWARMING_STEPS.length - 1].id;
      hw.dismissed = false;
    }
    justCompleted = !wasComplete && Boolean(hw.completedAt);
    e.updatedAt = new Date().toISOString();
    audit(s, {
      estateId: e.id,
      userId: req.user.id,
      action: 'housewarming_progress',
      detail: completeAll
        ? 'Digital Housewarming completed'
        : dismiss
          ? 'Housewarming dismissed'
          : `Step ${stepId || hw.currentStepId}`,
    });
    const items = s.items.filter((i) => i.estateId === e.id);
    return housewarmingPublic(e, items);
  });

  if (!result) return res.status(404).json({ error: 'Estate not found' });

  if (justCompleted) {
    mutate((s) => {
      const e = s.estates.find((x) => x.id === access.estate.id);
      if (e) scheduleLightReview(e);
      ensureFamilyInvite(s, access.estate.id, {
        role: 'manager',
        invitedBy: req.user.id,
      });
    });
    const base = (process.env.APP_URL || '').replace(/\/$/, '') || 'https://heirready.com';
    const link = `${base}/app/estates/${access.estate.id}?tab=housewarming`;
    sendHousewarmingCompleteEmail({
      to: req.user.email,
      name: req.user.name,
      estateName: access.estate.subjectName,
      link,
    }).catch((err) => console.error('housewarming complete email failed', err.message));
    notifyUsers({
      userIds: [req.user.id],
      title: 'Housewarming complete — invite a sibling',
      body: `${access.estate.subjectName} is set up. Share WhatsApp invite + fridge QR.`,
      url: `/app/estates/${access.estate.id}?tab=housewarming`,
      type: 'housewarming_done',
      estateId: access.estate.id,
    });
  }

  const after = readStore();
  const estateAfter = after.estates.find((e) => e.id === access.estate.id);
  const health = estateAfter ? computeLifeMapHealth(estateAfter, after) : null;
  res.json({ housewarming: result, justCompleted, health });
});

app.post('/api/estates/:id/interview', authRequired, (req, res) => {
  const store = readStore();
  const access = canAccessEstate(store, req.user.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  if (!['owner', 'manager'].includes(access.role)) {
    return res.status(403).json({ error: 'Only owner/manager can run interview' });
  }
  const answers = req.body?.answers || {};
  const created = answersToItems(answers, access.estate.id, req.user.id);
  if (!created.length) {
    return res.status(400).json({ error: 'Add at least one answer' });
  }
  try {
    assertCanAddItems(store, req.user, access.estate.id, created.length);
  } catch (err) {
    return res.status(err.status || 400).json({
      error: err.message,
      code: err.code || (err.status === 402 ? 'PLAN_LIMIT' : undefined),
      upgradePlan: err.upgradePlan || (err.status === 402 ? 'family' : undefined),
    });
  }
  mutate((s) => {
    s.items.push(...created);
    audit(s, {
      estateId: access.estate.id,
      userId: req.user.id,
      action: 'interview_applied',
      detail: `Interview added ${created.length} Life Map items`,
    });
  });
  res.status(201).json({ added: created.length, items: created });
});

app.post('/api/estates/:id/review/complete', authRequired, (req, res) => {
  const store = readStore();
  const access = canAccessEstate(store, req.user.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  const next = new Date();
  next.setFullYear(next.getFullYear() + 1);
  const estate = mutate((s) => {
    const e = s.estates.find((x) => x.id === access.estate.id);
    ensureEstateDefaults(e);
    e.nextReviewAt = next.toISOString();
    e.reviewReminderSentAt = null;
    e.lastReviewedAt = new Date().toISOString();
    scheduleLightReview(e);
    audit(s, {
      estateId: e.id,
      userId: req.user.id,
      action: 'review_completed',
      detail: `Next review ${e.nextReviewAt}`,
    });
    return e;
  });
  res.json({ nextReviewAt: estate.nextReviewAt, lastReviewedAt: estate.lastReviewedAt });
});

app.post('/api/estates/:id/emergency/rotate', authRequired, (req, res) => {
  const store = readStore();
  const access = canAccessEstate(store, req.user.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  if (access.role !== 'owner') return res.status(403).json({ error: 'Owner only' });
  const token = crypto.randomBytes(16).toString('hex');
  mutate((s) => {
    const e = s.estates.find((x) => x.id === access.estate.id);
    e.emergencyToken = token;
    audit(s, {
      estateId: e.id,
      userId: req.user.id,
      action: 'emergency_token_rotated',
      detail: 'Emergency QR token rotated',
    });
  });
  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  res.json({ emergencyToken: token, emergencyUrl: `${appUrl}/e/${token}` });
});

app.get('/api/public/emergency/:token', (req, res) => {
  const store = readStore();
  const estate = store.estates.find((e) => e.emergencyToken === req.params.token);
  if (!estate) return res.status(404).json({ error: 'Emergency card not found' });
  const owner = store.users.find((u) => u.id === estate.ownerId);
  const unlockers = (estate.unlockRules?.unlockerUserIds || [])
    .map((id) => store.users.find((u) => u.id === id))
    .filter(Boolean)
    .map((u) => ({ name: u.name, email: u.email }));
  const contacts = store.items
    .filter((i) => i.estateId === estate.id && (i.category === 'contacts' || i.category === 'care'))
    .slice(0, 8)
    .map((i) => ({
      title: i.title,
      role: i.institution || (i.category === 'care' ? 'Caregiver' : null),
      phone: i.accountRef || null,
      notes: i.notes,
      shift: i.shift || null,
      paidBy: i.paidBy || null,
      backupContact: i.backupContact || null,
      kind: i.category,
    }));
  const familyInvite = findActiveFamilyInvite(store, estate.id, 'manager');
  const ownerFirst =
    String(owner?.name || '')
      .trim()
      .split(/\s+/)[0] || null;
  const memberCount =
    (store.members || []).filter((m) => m.estateId === estate.id && m.status === 'active').length +
    1;
  res.json({
    subjectName: estate.subjectName,
    subjectRelation: estate.subjectRelation,
    status: estate.status,
    unlockMode: estate.unlockRules?.mode || 'single',
    requireProof: estate.unlockRules?.requireProof !== false,
    unlockers,
    ownerName: owner?.name,
    ownerFirstName: ownerFirst,
    memberCount,
    /** Soft network loop: fridge QR → sibling can join if family link is live */
    siblingInvite: familyInvite
      ? {
          url: inviteLinkFor(familyInvite.token),
          memberCount,
        }
      : null,
    contacts,
    firstSteps: [
      'Call the unlockers listed here',
      'Call home caregivers (nurse / maid) if listed — confirm keys and overnight cover',
      'Get death certificate / doctor incapacity letter (multiple copies)',
      'Ask an unlocker to open HeirReady → Unlock tab → upload proof',
      'Do not share bank passwords casually — use the Execution checklist after unlock',
    ],
  });
});

registerLawyerRoutes(app, { canAccessEstate: canAccessEstateBase, upload, saveUpload });
registerCareRoutes(app);

// Production static
const dist = path.join(__dirname, '..', 'client', 'dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(dist)) {
  app.get('/sw.js', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Service-Worker-Allowed', '/');
    res.sendFile(path.join(dist, 'sw.js'));
  });
  app.use(express.static(dist, { index: false }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

async function boot() {
  await initDb();
  seedLawyersIfNeeded();
  mutate((s) => {
    for (const e of s.estates) ensureEstateDefaults(e);
  });
  await flushPersist();
  try {
    ensureVapidKeys();
  } catch (err) {
    console.warn('[push] VAPID init failed', err.message);
  }
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HeirReady on http://0.0.0.0:${PORT} [${persistenceMode()}]`);
  });
  setInterval(() => {
    runReminderPass().catch((err) => console.error('reminder pass', err));
  }, 60 * 60 * 1000);
  setTimeout(() => runReminderPass().catch(() => {}), 15_000);
}

boot().catch((err) => {
  console.error('Boot failed', err);
  process.exit(1);
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    try {
      await flushPersist();
    } finally {
      process.exit(0);
    }
  });
}
