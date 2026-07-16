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
  adminRequired,
  hashPassword,
  verifyPassword,
  signToken,
  signMfaPendingToken,
  verifyMfaPendingToken,
  isAppAdmin,
} from './auth.js';
import {
  generateTotpSecret,
  verifyTotpCode,
  generateBackupCodes,
  consumeBackupCode,
  mfaPublicFields,
} from './mfa.js';
import {
  verifyFileAccessToken,
  userCanAccessFile,
  signItemFiles,
} from './fileAccess.js';
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
import { sendInviteEmail, sendEmail, sendPasswordResetEmail, sendEstateThreadNotify, sendHousewarmingCompleteEmail, sendSiblingJoinedEmail, sendVaultChangeEmail, mailConfigured } from './mail.js';
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
import {
  createTrackedLinksForEmails,
  consumeClick,
  listClickStats,
  destinationWithClickAttribution,
  attachEmailClickOnRegister,
  createWhatsAppTrackedLink,
  scrubPreviewBotClicks,
} from './clickTrack.js';
import { recordActivity, listActivity, isClientActivityType } from './activity.js';
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

// Capture raw body for Razorpay webhook HMAC (must match exact bytes)
app.use(
  express.json({
    limit: '8mb',
    verify: (req, _res, buf) => {
      if (req.originalUrl === '/api/billing/webhook' || req.url === '/api/billing/webhook') {
        req.rawBody = buf;
      }
    },
  })
);
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
  const fileId = String(req.params.fileId || '').trim();
  const sig = String(req.query.sig || '').trim();
  const store = readStore();

  let allowed = false;
  const signed = verifyFileAccessToken(sig, fileId);
  if (signed?.sub && userCanAccessFile(store, signed.sub, fileId, canAccessEstate)) {
    allowed = true;
  } else {
    // Fallback: Bearer session for authenticated fetches
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (token) {
      try {
        const jwt = await import('jsonwebtoken');
        const SECRET = process.env.JWT_SECRET || 'estate-os-dev-secret';
        const payload = jwt.default.verify(token, SECRET);
        if (payload?.sub && !payload.mfaPending && userCanAccessFile(store, payload.sub, fileId, canAccessEstate)) {
          allowed = true;
        }
      } catch {
        /* ignore */
      }
    }
  }

  if (!allowed) {
    return res.status(401).send('Sign in required to view this document');
  }

  const file = await readUpload(fileId);
  if (!file) return res.status(404).send('Not found');
  const safeName = encodeURIComponent(file.name || 'document');
  const asDownload = String(req.query.download || '') === '1';
  res.setHeader('Content-Type', file.mime || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, no-store');
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

function categoryLabel(categoryId) {
  return ITEM_CATEGORIES.find((c) => c.id === categoryId)?.label || categoryId || '';
}

/** Owner + active members except the actor — for sibling vault emails. */
function estateFamilyRecipients(store, estate, exceptUserId) {
  if (!estate) return [];
  const out = [];
  const owner = store.users.find((u) => u.id === estate.ownerId);
  if (owner?.email && owner.id !== exceptUserId) {
    out.push({ id: owner.id, email: owner.email, name: owner.name });
  }
  for (const m of (store.members || []).filter(
    (x) => x.estateId === estate.id && x.status === 'active'
  )) {
    if (m.userId === exceptUserId) continue;
    const u = store.users.find((x) => x.id === m.userId);
    if (u?.email) out.push({ id: u.id, email: u.email, name: u.name });
  }
  const seen = new Set();
  return out.filter((r) => {
    const key = r.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function notifyVaultChange({
  estate,
  actor,
  actionLabel,
  itemTitle,
  category,
  type = 'vault_change',
}) {
  if (!estate || !actor) return;
  const store = readStore();
  const recipients = estateFamilyRecipients(store, estate, actor.id);
  if (!recipients.length) return;

  const base = (process.env.APP_URL || 'https://heirready.com').replace(/\/$/, '');
  const link = `${base}/app/estates/${estate.id}?tab=map`;
  const cat = categoryLabel(category);

  notifyUsers({
    userIds: recipients.map((r) => r.id),
    title: `${estate.subjectName}: vault update`,
    body: `${actor.name || 'A sibling'} ${actionLabel}${itemTitle ? ` — ${itemTitle}` : ''}`,
    url: `/app/estates/${estate.id}?tab=map`,
    type,
    estateId: estate.id,
  });

  if (!mailConfigured()) return;
  await Promise.all(
    recipients.map(async (r) => {
      try {
        await sendVaultChangeEmail({
          to: r.email,
          recipientName: r.name,
          estateName: estate.subjectName,
          actorName: actor.name,
          actionLabel,
          itemTitle,
          categoryLabel: cat,
          link,
        });
      } catch (err) {
        console.error('vault change email failed', r.email, err.message);
      }
    })
  );
}

function stripSensitiveIfE2ee(body) {
  const e2ee = Boolean(body?.e2ee && body?.enc);
  if (!e2ee) return body;
  return {
    ...body,
    institution: '',
    accountRef: '',
    notes: '',
    shift: null,
    paidBy: null,
    backupContact: null,
    e2ee: true,
    enc: body.enc,
  };
}

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
    autoRenew: plan.autoRenew,
    subscriptionStatus: plan.subscriptionStatus,
    subscriptionCancelAt: plan.subscriptionCancelAt,
    accountType: user.accountType || 'family',
    isAdmin: isAppAdmin(user),
    referralCode: user.referralCode || null,
    referralDiscountCredits: user.referralDiscountCredits || 0,
    cryptoEnabled: Boolean(user.cryptoBundle?.publicKeyJwk),
    cryptoBundle: user.cryptoBundle
      ? {
          version: user.cryptoBundle.version,
          kdf: user.cryptoBundle.kdf,
          iterations: user.cryptoBundle.iterations,
          salt: user.cryptoBundle.salt,
          privateKeyWrapped: user.cryptoBundle.privateKeyWrapped,
          publicKeyJwk: user.cryptoBundle.publicKeyJwk,
          recoverySalt: user.cryptoBundle.recoverySalt,
          privateKeyWrappedRecovery: user.cryptoBundle.privateKeyWrappedRecovery,
        }
      : null,
    ...mfaPublicFields(user),
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
  let emailAttr = null;
  mutate((s) => {
    if (!s.careWorkers) s.careWorkers = [];
    attachReferralOnRegister(s, user, referralCode || ref);
    ensureUserReferralFields(user, s);
    emailAttr = attachEmailClickOnRegister(
      s,
      user,
      req.body?.emailClickCode || req.body?.hr_ec
    );
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
  try {
    recordActivity({
      type: 'signup',
      userId: user.id,
      email: user.email,
      name: user.name,
      meta: {
        accountType: user.accountType,
        referral: Boolean(referralCode || ref),
        city: user.preferredCity || null,
        emailCampaign: emailAttr?.campaign || null,
        emailClickCode: emailAttr?.code || null,
        mailedEmail: emailAttr?.mailedEmail || null,
      },
    });
    if (emailAttr) {
      const signupType = emailAttr.channel === 'whatsapp' ? 'whatsapp_signup' : 'email_signup';
      recordActivity({
        type: signupType,
        userId: user.id,
        email: user.email,
        name: user.name,
        meta: {
          campaign: emailAttr.campaign,
          code: emailAttr.code,
          channel: emailAttr.channel,
          kind: emailAttr.kind || null,
          mailedEmail: emailAttr.mailedEmail || null,
          sharedByUserId: emailAttr.sharedByUserId || null,
          sharedByName: emailAttr.sharedByName || null,
          differentEmail: emailAttr.differentEmail,
        },
      });
    }
  } catch (err) {
    console.error('activity signup failed', err.message);
  }
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

  if (refreshed.mfaEnabled && refreshed.mfaSecret) {
    const mfaToken = signMfaPendingToken(refreshed);
    return res.json({
      mfaRequired: true,
      mfaToken,
      email: refreshed.email,
      message: 'Enter the 6-digit code from your authenticator app',
    });
  }

  const token = signToken(refreshed);
  res.json({ token, user: publicUser(refreshed) });
});

/** Complete login after password when MFA is enabled. Body: { mfaToken, code } */
app.post('/api/auth/mfa/verify-login', async (req, res) => {
  const pending = verifyMfaPendingToken(req.body?.mfaToken);
  if (!pending) {
    return res.status(401).json({ error: 'MFA session expired — sign in again' });
  }
  const store = readStore();
  const user = store.users.find((u) => u.id === pending.sub);
  if (!user?.mfaEnabled || !user.mfaSecret) {
    return res.status(400).json({ error: 'MFA is not enabled on this account' });
  }
  const code = String(req.body?.code || '').trim();
  let ok = verifyTotpCode(user.mfaSecret, code);
  if (!ok) {
    const fresh = readStore().users.find((u) => u.id === user.id);
    const usedBackup = await consumeBackupCode(fresh, code);
    if (usedBackup) {
      mutate((s) => {
        const u = s.users.find((x) => x.id === user.id);
        if (!u) return;
        u.mfaBackupCodeHashes = fresh.mfaBackupCodeHashes;
      });
      await flushPersist();
      ok = true;
    }
  }
  if (!ok) {
    return res.status(401).json({ error: 'Invalid authenticator or backup code' });
  }
  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

/** Start MFA setup — returns secret + otpauth URL (confirm before enabling). */
app.post('/api/auth/mfa/setup', authRequired, async (req, res) => {
  const store = readStore();
  const user = store.users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.mfaEnabled) {
    return res.status(400).json({ error: 'MFA is already on — turn it off first to reset' });
  }
  const { secret, otpauthUrl } = generateTotpSecret(user.email);
  mutate((s) => {
    const u = s.users.find((x) => x.id === user.id);
    if (!u) return;
    u.mfaPendingSecret = secret;
    u.mfaPendingAt = new Date().toISOString();
  });
  await flushPersist();
  res.json({
    secret,
    otpauthUrl,
    qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`,
  });
});

/** Confirm MFA with a live TOTP code — enables MFA + returns backup codes once. */
app.post('/api/auth/mfa/confirm', authRequired, async (req, res) => {
  const store = readStore();
  const user = store.users.find((u) => u.id === req.user.id);
  if (!user?.mfaPendingSecret) {
    return res.status(400).json({ error: 'Start MFA setup first' });
  }
  if (!verifyTotpCode(user.mfaPendingSecret, req.body?.code)) {
    return res.status(400).json({ error: 'That code is wrong or expired — try the next one' });
  }
  const { plain, hashes } = await generateBackupCodes(8);
  mutate((s) => {
    const u = s.users.find((x) => x.id === user.id);
    if (!u) return;
    u.mfaSecret = u.mfaPendingSecret;
    u.mfaEnabled = true;
    u.mfaEnabledAt = new Date().toISOString();
    u.mfaPendingSecret = null;
    u.mfaPendingAt = null;
    u.mfaBackupCodeHashes = hashes;
  });
  await flushPersist();
  const refreshed = readStore().users.find((u) => u.id === user.id);
  res.json({
    ok: true,
    user: publicUser(refreshed),
    backupCodes: plain,
    message: 'Save these backup codes somewhere safe — they won’t be shown again',
  });
});

/** Disable MFA — requires password + current TOTP (or backup code). */
app.post('/api/auth/mfa/disable', authRequired, async (req, res) => {
  const store = readStore();
  const user = store.users.find((u) => u.id === req.user.id);
  if (!user?.mfaEnabled) {
    return res.status(400).json({ error: 'MFA is not enabled' });
  }
  if (!(await verifyPassword(req.body?.password || '', user.passwordHash))) {
    return res.status(401).json({ error: 'Password incorrect' });
  }
  let ok = verifyTotpCode(user.mfaSecret, req.body?.code);
  if (!ok) {
    const fresh = { ...user, mfaBackupCodeHashes: [...(user.mfaBackupCodeHashes || [])] };
    ok = await consumeBackupCode(fresh, req.body?.code);
    if (ok) {
      mutate((s) => {
        const u = s.users.find((x) => x.id === user.id);
        if (u) u.mfaBackupCodeHashes = fresh.mfaBackupCodeHashes;
      });
    }
  }
  if (!ok) {
    return res.status(401).json({ error: 'Invalid authenticator or backup code' });
  }
  mutate((s) => {
    const u = s.users.find((x) => x.id === user.id);
    if (!u) return;
    u.mfaEnabled = false;
    u.mfaSecret = null;
    u.mfaPendingSecret = null;
    u.mfaBackupCodeHashes = [];
    u.mfaDisabledAt = new Date().toISOString();
  });
  await flushPersist();
  const refreshed = readStore().users.find((u) => u.id === user.id);
  res.json({ ok: true, user: publicUser(refreshed) });
});

/** Regenerate backup codes — requires TOTP. */
app.post('/api/auth/mfa/backup-codes', authRequired, async (req, res) => {
  const store = readStore();
  const user = store.users.find((u) => u.id === req.user.id);
  if (!user?.mfaEnabled || !user.mfaSecret) {
    return res.status(400).json({ error: 'Turn on MFA first' });
  }
  if (!verifyTotpCode(user.mfaSecret, req.body?.code)) {
    return res.status(401).json({ error: 'Invalid authenticator code' });
  }
  const { plain, hashes } = await generateBackupCodes(8);
  mutate((s) => {
    const u = s.users.find((x) => x.id === user.id);
    if (!u) return;
    u.mfaBackupCodeHashes = hashes;
  });
  await flushPersist();
  res.json({
    ok: true,
    backupCodes: plain,
    message: 'Save these backup codes — previous codes no longer work',
  });
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

/** Store client-generated E2EE key bundle (public key + wrapped private key). */
app.put('/api/me/crypto', authRequired, async (req, res) => {
  const bundle = req.body?.cryptoBundle;
  if (!bundle?.publicKeyJwk || !bundle?.privateKeyWrapped || !bundle?.salt) {
    return res.status(400).json({ error: 'cryptoBundle with publicKeyJwk, salt, privateKeyWrapped required' });
  }
  mutate((s) => {
    const u = s.users.find((x) => x.id === req.user.id);
    if (!u) return;
    u.cryptoBundle = {
      version: 1,
      kdf: bundle.kdf || 'PBKDF2-SHA256',
      iterations: bundle.iterations || 310000,
      salt: bundle.salt,
      privateKeyWrapped: bundle.privateKeyWrapped,
      publicKeyJwk: bundle.publicKeyJwk,
      recoverySalt: bundle.recoverySalt || null,
      privateKeyWrappedRecovery: bundle.privateKeyWrappedRecovery || null,
      updatedAt: new Date().toISOString(),
    };
  });
  await flushPersist();
  const user = readStore().users.find((u) => u.id === req.user.id);
  res.json({ ok: true, user: publicUser(user) });
});

/** Get this user's wrapped estate vault key (ciphertext only). */
app.get('/api/estates/:id/vault-key', authRequired, (req, res) => {
  const store = readStore();
  const access = canAccessEstate(store, req.user.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  const estate = store.estates.find((e) => e.id === access.estate.id);
  const wraps = estate?.vaultKeyWraps || [];
  const mine = wraps.find((w) => w.userId === req.user.id);
  const membersNeedingKey = (store.members || [])
    .filter((m) => m.estateId === estate.id && m.status === 'active')
    .map((m) => {
      const u = store.users.find((x) => x.id === m.userId);
      return {
        userId: m.userId,
        name: u?.name,
        hasWrap: wraps.some((w) => w.userId === m.userId),
        cryptoPublicKeyJwk: u?.cryptoBundle?.publicKeyJwk || null,
      };
    });
  const owner = store.users.find((u) => u.id === estate.ownerId);
  res.json({
    e2ee: Boolean(estate?.e2eeEnabled),
    wrappedKey: mine?.wrappedKey || null,
    members: [
      {
        userId: estate.ownerId,
        name: owner?.name,
        hasWrap: wraps.some((w) => w.userId === estate.ownerId),
        cryptoPublicKeyJwk: owner?.cryptoBundle?.publicKeyJwk || null,
      },
      ...membersNeedingKey,
    ],
  });
});

/** Create / replace vault key wraps (client generated). */
app.put('/api/estates/:id/vault-key', authRequired, async (req, res) => {
  const store = readStore();
  const access = canAccessEstate(store, req.user.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  if (!['owner', 'manager'].includes(access.role)) {
    return res.status(403).json({ error: 'Only owner/manager can set vault keys' });
  }
  const wraps = Array.isArray(req.body?.wraps) ? req.body.wraps : [];
  if (!wraps.length) return res.status(400).json({ error: 'wraps[] required' });
  mutate((s) => {
    const e = s.estates.find((x) => x.id === access.estate.id);
    if (!e) return;
    if (!e.vaultKeyWraps) e.vaultKeyWraps = [];
    for (const w of wraps) {
      if (!w.userId || !w.wrappedKey) continue;
      const idx = e.vaultKeyWraps.findIndex((x) => x.userId === w.userId);
      const row = {
        userId: w.userId,
        wrappedKey: w.wrappedKey,
        grantedBy: req.user.id,
        at: new Date().toISOString(),
      };
      if (idx >= 0) e.vaultKeyWraps[idx] = row;
      else e.vaultKeyWraps.push(row);
    }
    e.e2eeEnabled = true;
    e.updatedAt = new Date().toISOString();
  });
  await flushPersist();
  res.json({ ok: true, e2ee: true });
});

/** Grant vault key wrap to one member (after invite). */
app.post('/api/estates/:id/vault-key/grant', authRequired, async (req, res) => {
  const store = readStore();
  const access = canAccessEstate(store, req.user.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  if (!['owner', 'manager'].includes(access.role)) {
    return res.status(403).json({ error: 'Only owner/manager can grant vault keys' });
  }
  const userId = String(req.body?.userId || '').trim();
  const wrappedKey = String(req.body?.wrappedKey || '').trim();
  if (!userId || !wrappedKey) {
    return res.status(400).json({ error: 'userId and wrappedKey required' });
  }
  const targetAccess = canAccessEstate(store, userId, req.params.id);
  if (!targetAccess.ok) {
    return res.status(400).json({ error: 'Target user is not on this vault' });
  }
  mutate((s) => {
    const e = s.estates.find((x) => x.id === access.estate.id);
    if (!e) return;
    if (!e.vaultKeyWraps) e.vaultKeyWraps = [];
    const idx = e.vaultKeyWraps.findIndex((x) => x.userId === userId);
    const row = {
      userId,
      wrappedKey,
      grantedBy: req.user.id,
      at: new Date().toISOString(),
    };
    if (idx >= 0) e.vaultKeyWraps[idx] = row;
    else e.vaultKeyWraps.push(row);
    e.e2eeEnabled = true;
  });
  await flushPersist();
  res.json({ ok: true });
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

/**
 * Admin: create in-app alerts (+ web push) via the live process store.
 * Auth: signed-in app admin, or X-Admin-Key.
 */
app.post('/api/admin/notify', adminRequired, (req, res) => {
  const title = String(req.body?.title || '').trim();
  const body = String(req.body?.body || '').trim();
  if (!title) return res.status(400).json({ error: 'title required' });

  const store = readStore();
  const emailList = Array.isArray(req.body?.emails)
    ? req.body.emails.map((e) => String(e || '').trim().toLowerCase()).filter(Boolean)
    : [];
  let userIds = Array.isArray(req.body?.userIds)
    ? req.body.userIds.map(String).filter(Boolean)
    : [];
  if (emailList.length) {
    const fromEmail = store.users
      .filter((u) => emailList.includes(String(u.email || '').toLowerCase()))
      .map((u) => u.id);
    userIds = [...new Set([...userIds, ...fromEmail])];
  }
  if (!userIds.length) {
    return res.status(400).json({ error: 'No matching users for emails/userIds' });
  }

  const created = notifyUsers({
    userIds,
    title,
    body,
    url: String(req.body?.url || '/app').slice(0, 400),
    type: String(req.body?.type || 'admin').slice(0, 60),
    estateId: req.body?.estateId ? String(req.body.estateId) : null,
  });

  res.json({
    ok: true,
    count: created.length,
    recipients: created.map((n) => {
      const u = store.users.find((x) => x.id === n.userId);
      return { userId: n.userId, email: u?.email || null, notificationId: n.id };
    }),
  });
});

/**
 * Admin: mint per-recipient tracked email links (exact who-clicked).
 * Body: { emails: string[], campaign, destination, meta? }
 */
app.post('/api/admin/tracked-links', adminRequired, (req, res) => {
  const emails = Array.isArray(req.body?.emails) ? req.body.emails : [];
  const campaign = String(req.body?.campaign || '').trim();
  const destination = String(req.body?.destination || '').trim();
  if (!emails.length || !campaign || !destination) {
    return res.status(400).json({ error: 'emails[], campaign, and destination required' });
  }
  const links = createTrackedLinksForEmails(emails, {
    campaign,
    destination,
    meta: req.body?.meta || null,
  });
  res.json({ ok: true, count: links.length, links });
});

/** Admin: who clicked (exact email + count + times) */
app.get('/api/admin/clicks', adminRequired, (req, res) => {
  const campaign = String(req.query?.campaign || '').trim() || null;
  const channel = String(req.query?.channel || '').trim() || null;
  res.json(
    listClickStats({
      campaign,
      channel,
      limit: Number(req.query?.limit) || 200,
    })
  );
});

/**
 * Logged-in user: mint unique /r/:code for a WhatsApp share message.
 * Body: { destination, kind, estateId?, estateName?, city? }
 */
app.post('/api/share/tracked-link', authRequired, (req, res) => {
  const destination = String(req.body?.destination || '').trim();
  const kind = String(req.body?.kind || '').trim();
  if (!destination || !kind) {
    return res.status(400).json({ error: 'destination and kind required' });
  }
  try {
    const link = createWhatsAppTrackedLink(req.user, {
      kind,
      destination,
      estateId: req.body?.estateId || null,
      estateName: req.body?.estateName || null,
      city: req.body?.city || null,
    });
    res.json({ ok: true, ...link });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not create link' });
  }
});

/**
 * Logged-in product taps (WhatsApp share, copy link, checkout).
 * Body: { type: 'whatsapp_share'|'copy_link'|'checkout', meta?: object }
 */
app.post('/api/activity', authRequired, (req, res) => {
  const type = String(req.body?.type || '').trim();
  if (!isClientActivityType(type)) {
    return res.status(400).json({ error: 'Unsupported activity type' });
  }
  const meta = req.body?.meta && typeof req.body.meta === 'object' ? req.body.meta : {};
  if (type === 'whatsapp_share' && !meta.kind) {
    return res.status(400).json({ error: 'meta.kind required for whatsapp_share' });
  }
  const event = recordActivity({
    type,
    userId: req.user.id,
    email: req.user.email,
    name: req.user.name,
    meta,
    path: typeof req.body?.path === 'string' ? req.body.path : null,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.json({ ok: true, id: event?.id });
});

/** Admin: who did what (shares, signups, joins, email clicks, …) */
app.get('/api/admin/activity', adminRequired, (req, res) => {
  const type = String(req.query?.type || '').trim() || null;
  res.json({
    events: listActivity({ type, limit: Number(req.query?.limit) || 200 }),
  });
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
  try {
    recordActivity({
      type: 'estate_created',
      userId: req.user.id,
      email: req.user.email,
      name: req.user.name,
      meta: {
        estateId: estate.id,
        estateName: estate.subjectName,
        relation: estate.subjectRelation,
        countryPack: pack,
      },
    });
  } catch (err) {
    console.error('activity estate_created failed', err.message);
  }
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
  const items = store.items
    .filter((i) => i.estateId === access.estate.id)
    .map((i) => signItemFiles(i, req.user.id));
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
      ownerId: owner?.id || access.estate.ownerId,
      ownerName: owner?.name || null,
      iAmOwner: access.estate.ownerId === req.user.id,
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
  const rawBody = req.body || {};
  let enc = rawBody.enc || null;
  if (typeof enc === 'string' && enc.trim()) {
    try {
      enc = JSON.parse(enc);
    } catch {
      enc = null;
    }
  }
  const e2ee = String(rawBody.e2ee || '') === 'true' || rawBody.e2ee === true || Boolean(enc);
  const { category, title, institution, accountRef, notes, shift, paidBy, backupContact } =
    stripSensitiveIfE2ee({ ...rawBody, e2ee, enc });
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
    files.push({
      ...saved,
      e2ee: e2ee || String(f.originalname || '').endsWith('.e2ee.json'),
    });
  }
  const item = {
    id: uuid(),
    estateId: access.estate.id,
    category,
    title: title.trim(),
    institution: e2ee ? '' : (institution || '').trim(),
    accountRef: e2ee ? '' : (accountRef || '').trim(),
    notes: e2ee ? '' : (notes || '').trim(),
    shift: e2ee ? null : shift ? String(shift).trim() : null,
    paidBy: e2ee ? null : paidBy ? String(paidBy).trim() : null,
    backupContact: e2ee ? null : backupContact ? String(backupContact).trim() : null,
    expiresOn: rawBody.expiresOn ? String(rawBody.expiresOn).trim() : null,
    e2ee: Boolean(e2ee && enc),
    enc: e2ee && enc ? enc : null,
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
  await flushPersist();
  notifyVaultChange({
    estate: access.estate,
    actor: req.user,
    actionLabel: 'added to the vault',
    itemTitle: item.title,
    category: item.category,
    type: 'item_added',
  }).catch((err) => console.error('vault notify', err.message));
  res.status(201).json({ item: signItemFiles(item, req.user.id) });
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
  await flushPersist();
  notifyVaultChange({
    estate: access.estate,
    actor: req.user,
    actionLabel: 'added a photo draft',
    itemTitle: item.title,
    category: item.category,
    type: 'item_added',
  }).catch((err) => console.error('vault notify', err.message));
  res.status(201).json({ item: signItemFiles(item, req.user.id), draftSource: draft.source });
});

app.patch('/api/estates/:id/items/:itemId', authRequired, async (req, res) => {
  const store = readStore();
  const access = canAccessEstate(store, req.user.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  const item = mutate((s) => {
    const row = s.items.find(
      (i) => i.id === req.params.itemId && i.estateId === req.params.id
    );
    if (!row) return null;
    let enc = req.body?.enc;
    if (typeof enc === 'string' && enc.trim()) {
      try {
        enc = JSON.parse(enc);
      } catch {
        enc = undefined;
      }
    }
    if (req.body?.e2ee && enc) {
      row.e2ee = true;
      row.enc = enc;
      row.institution = '';
      row.accountRef = '';
      row.notes = '';
      row.shift = null;
      row.paidBy = null;
      row.backupContact = null;
    }
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
      if (req.body?.[f] != null) {
        if (row.e2ee && ['institution', 'accountRef', 'notes', 'shift', 'paidBy', 'backupContact'].includes(f)) {
          continue;
        }
        row[f] = String(req.body[f]).trim() || null;
      }
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
  notifyVaultChange({
    estate: access.estate,
    actor: req.user,
    actionLabel: 'updated',
    itemTitle: item.title,
    category: item.category,
    type: 'item_updated',
  }).catch((err) => console.error('vault notify', err.message));
  res.json({ item: signItemFiles(item, req.user.id) });
});

app.delete('/api/estates/:id/items/:itemId', authRequired, async (req, res) => {
  const store = readStore();
  const access = canAccessEstate(store, req.user.id, req.params.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  if (access.role === 'viewer') {
    return res.status(403).json({ error: 'Viewers cannot delete' });
  }
  let removedTitle = '';
  let removedCategory = '';
  mutate((s) => {
    const idx = s.items.findIndex(
      (i) => i.id === req.params.itemId && i.estateId === req.params.id
    );
    if (idx >= 0) {
      const [removed] = s.items.splice(idx, 1);
      removedTitle = removed.title;
      removedCategory = removed.category;
      audit(s, {
        estateId: access.estate.id,
        userId: req.user.id,
        action: 'item_deleted',
        detail: `Deleted ${removed.title}`,
      });
    }
  });
  if (removedTitle) {
    notifyVaultChange({
      estate: access.estate,
      actor: req.user,
      actionLabel: 'removed from the vault',
      itemTitle: removedTitle,
      category: removedCategory,
      type: 'item_deleted',
    }).catch((err) => console.error('vault notify', err.message));
  }
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

  try {
    recordActivity({
      type: 'invite_accepted',
      userId: req.user.id,
      email: req.user.email,
      name: req.user.name,
      meta: {
        estateId: invite.estateId,
        estateName: estate.subjectName,
        role: invite.role,
        invitedBy: invite.invitedBy || null,
      },
    });
  } catch (err) {
    console.error('activity invite_accepted failed', err.message);
  }

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
    version: '1.23.2',
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
    .map((i) => {
      if (i.e2ee && i.enc) {
        return {
          title: i.title,
          role: i.category === 'care' ? 'Caregiver' : 'Contact',
          phone: null,
          notes: 'Encrypted — open HeirReady with vault unlock to see phone / details',
          shift: null,
          paidBy: null,
          backupContact: null,
          kind: i.category,
          e2ee: true,
        };
      }
      return {
        title: i.title,
        role: i.institution || (i.category === 'care' ? 'Caregiver' : null),
        phone: i.accountRef || null,
        notes: i.notes,
        shift: i.shift || null,
        paidBy: i.paidBy || null,
        backupContact: i.backupContact || null,
        kind: i.category,
      };
    });
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

/** Public email click redirect — records who clicked, then sends them on with attribution. */
app.get('/r/:code', (req, res) => {
  const hit = consumeClick(req.params.code, {
    ip: req.ip || req.headers['x-forwarded-for'] || null,
    userAgent: req.get('user-agent'),
  });
  if (!hit?.destination || !hit?.link?.code) {
    return res.redirect(302, '/');
  }
  // Preview bots: redirect only — no cookie / attribution side effects.
  if (hit.previewOnly) {
    return res.redirect(302, hit.destination);
  }
  const dest = destinationWithClickAttribution(hit.destination, hit.link.code);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `hr_ec=${encodeURIComponent(hit.link.code)}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax${secure}`
  );
  return res.redirect(302, dest);
});

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
    if (req.path.startsWith('/r/')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

async function boot() {
  await initDb();
  seedLawyersIfNeeded();
  try {
    const n = scrubPreviewBotClicks();
    if (n) console.log(`[clicks] scrubbed ${n} preview-bot hit(s)`);
  } catch (err) {
    console.warn('[clicks] scrub failed', err.message);
  }
  mutate((s) => {
    for (const e of s.estates) ensureEstateDefaults(e);
    // Persist app-admin flag for allowlisted emails
    for (const u of s.users || []) {
      if (isAppAdmin(u) && !u.isAdmin) u.isAdmin = true;
    }
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
