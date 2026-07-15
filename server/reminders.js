import crypto from 'crypto';
import { mutate, readStore } from './db.js';
import { sendEmail, sendLightReviewNudgeEmail, sendActivationNudgeEmail } from './mail.js';
import { notifyUsers } from './notifications.js';
import {
  applyPlanExpiryInPlace,
  RENEWAL_WARN_DAYS,
  userHasPaidAccess,
} from './plans.js';

const LIGHT_REVIEW_MS = 90 * 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Family signup drip: 1h → 1d → 3d, only if they still own zero estates */
const ACTIVATION_STEPS = [
  { id: '1h', afterMs: 1 * HOUR_MS },
  { id: '1d', afterMs: 1 * DAY_MS },
  { id: '3d', afterMs: 3 * DAY_MS },
];

export async function runReminderPass() {
  const store = readStore();
  const now = Date.now();
  const day = DAY_MS;
  let sent = 0;
  const app = (process.env.APP_URL || 'https://heirready.com').replace(/\/$/, '');

  // ── Abandoned signup activation (family, zero estates) ──
  for (const user of store.users) {
    if (!user.email || !user.createdAt) continue;
    if (user.accountType === 'lawyer' || user.accountType === 'care') continue;
    const ownsEstate = store.estates.some((e) => e.ownerId === user.id);
    if (ownsEstate) continue;

    const age = now - new Date(user.createdAt).getTime();
    if (Number.isNaN(age) || age < 0) continue;
    const sentMap = { ...(user.activationNudges || {}) };

    for (const step of ACTIVATION_STEPS) {
      if (age < step.afterMs) break;
      if (sentMap[step.id]) continue;
      try {
        await sendActivationNudgeEmail({
          to: user.email,
          name: user.name,
          link: `${app}/app`,
          step: step.id,
        });
        notifyUsers({
          userIds: [user.id],
          title:
            step.id === '1h'
              ? 'Create Mum/Dad’s file (20 min)'
              : step.id === '1d'
                ? 'Still need to start housewarming?'
                : 'Last nudge: finish HeirReady setup',
          body: 'Tap to open your estates and map one parent.',
          url: '/app',
          type: 'activation',
        });
        mutate((s) => {
          const u = s.users.find((x) => x.id === user.id);
          if (!u) return;
          if (!u.activationNudges) u.activationNudges = {};
          u.activationNudges[step.id] = new Date().toISOString();
        });
        sent++;
      } catch (err) {
        console.error('activation nudge failed', step.id, err.message);
      }
      break; // one activation email per user per pass
    }
  }

  for (const user of store.users) {
    if (applyPlanExpiryInPlace(user)) {
      mutate((s) => {
        const u = s.users.find((x) => x.id === user.id);
        if (u) applyPlanExpiryInPlace(u);
      });
    }
    if (!user.email || !userHasPaidAccess(user) || !user.planExpiresAt) continue;
    // Auto-renewing card skips “please renew” mail — charge + webhook extends access
    const autoRenew =
      (user.paddleSubscriptionId || user.razorpaySubscriptionId) &&
      (user.subscriptionStatus === 'active' ||
        user.subscriptionStatus === 'authenticated' ||
        user.subscriptionStatus === 'pending');
    if (autoRenew) continue;
    const daysLeft = Math.ceil((new Date(user.planExpiresAt).getTime() - now) / day);
    if (daysLeft < 0 || daysLeft > RENEWAL_WARN_DAYS) continue;
    const key = `plan-renew:${user.id}:${user.planExpiresAt.slice(0, 10)}`;
    if (user.lastPlanRenewalAlertKey === key) continue;
    try {
      await sendEmail({
        to: user.email,
        subject: `Renew HeirReady ${user.plan} — ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`,
        text: `Your ${user.plan} plan expires on ${new Date(user.planExpiresAt).toLocaleDateString()}.\n\nRenew here (adds another year; auto-renew stays on until you cancel):\n${app}/pricing\n\nIf it lapses, paid features lock until you renew.`,
        html: `<p>Your <strong>${user.plan}</strong> plan expires on <strong>${new Date(user.planExpiresAt).toLocaleDateString()}</strong> (${daysLeft} days).</p><p><a href="${app}/pricing">Renew on Pricing</a> — card auto-charges yearly until you cancel.</p>`,
      });
      mutate((s) => {
        const u = s.users.find((x) => x.id === user.id);
        if (u) u.lastPlanRenewalAlertKey = key;
      });
      sent++;
    } catch (err) {
      console.error('plan renewal reminder failed', err.message);
    }
  }

  for (const estate of store.estates) {
    const owner = store.users.find((u) => u.id === estate.ownerId);
    if (!owner?.email) continue;
    const estateLink = `${app}/app/estates/${estate.id}`;

    if (estate.nextReviewAt) {
      const due = new Date(estate.nextReviewAt).getTime();
      if (due <= now && !estate.reviewReminderSentAt) {
        try {
          await sendEmail({
            to: owner.email,
            subject: `Yearly review: ${estate.subjectName}'s Life Map`,
            text: `It's time to review the Life Map for ${estate.subjectName}.\n\nOpen: ${estateLink}\n\nMark reviewed when done so we remind you again next year.`,
            html: `<p>Time to review <strong>${estate.subjectName}</strong>'s Life Map.</p><p><a href="${estateLink}">Open estate</a></p>`,
          });
          notifyUsers({
            userIds: [owner.id],
            title: `Yearly review: ${estate.subjectName}`,
            body: 'Open the Life Map and mark review done.',
            url: `/app/estates/${estate.id}`,
            type: 'yearly_review',
            estateId: estate.id,
          });
          mutate((s) => {
            const e = s.estates.find((x) => x.id === estate.id);
            if (e) e.reviewReminderSentAt = new Date().toISOString();
          });
          sent++;
        } catch (err) {
          console.error('review reminder failed', err.message);
        }
      }
    }

    const lightDueAt = estate.nextLightReviewAt;
    if (lightDueAt && estate.housewarming?.completedAt) {
      const lightDue = new Date(lightDueAt).getTime();
      if (lightDue <= now) {
        const key = `light:${estate.id}:${lightDueAt.slice(0, 10)}`;
        if (estate.lastLightReviewAlertKey !== key) {
          const waText =
            `Hi — quick check on ${estate.subjectName}: same maid/nurse phone? Same LIC/bank?\n\n` +
            `Update on HeirReady:\n${estateLink}`;
          try {
            await sendLightReviewNudgeEmail({
              to: owner.email,
              name: owner.name,
              estateName: estate.subjectName,
              link: estateLink,
              waText,
            });
            notifyUsers({
              userIds: [owner.id],
              title: `${estate.subjectName}: 90-day check-in`,
              body: 'Same maid/nurse phone? Same LIC/bank?',
              url: `/app/estates/${estate.id}?review=1`,
              type: 'light_review',
              estateId: estate.id,
            });
            mutate((s) => {
              const e = s.estates.find((x) => x.id === estate.id);
              if (e) {
                e.lastLightReviewAlertKey = key;
                e.nextLightReviewAt = new Date(now + LIGHT_REVIEW_MS).toISOString();
              }
            });
            sent++;
          } catch (err) {
            console.error('light review nudge failed', err.message);
          }
        }
      }
    }

    const items = store.items.filter((i) => i.estateId === estate.id && i.expiresOn);
    const expiring = items.filter((i) => {
      const t = new Date(i.expiresOn).getTime();
      return t >= now && t <= now + 30 * day;
    });
    if (expiring.length) {
      const key = `expiry:${estate.id}:${expiring.map((i) => i.id).sort().join(',')}`;
      if (estate.lastExpiryAlertKey === key) continue;
      const list = expiring.map((i) => `• ${i.title} — ${i.expiresOn}`).join('\n');
      try {
        await sendEmail({
          to: owner.email,
          subject: `Expiring documents: ${estate.subjectName}`,
          text: `These Life Map items expire within 30 days:\n\n${list}\n\n${estateLink}`,
          html: `<p>Expiring soon for <strong>${estate.subjectName}</strong>:</p><pre>${list}</pre><p><a href="${estateLink}">Open estate</a></p>`,
        });
        mutate((s) => {
          const e = s.estates.find((x) => x.id === estate.id);
          if (e) e.lastExpiryAlertKey = key;
        });
        sent++;
      } catch (err) {
        console.error('expiry alert failed', err.message);
      }
    }
  }
  if (sent) console.log(`Reminder pass sent ${sent} emails`);
  return sent;
}

export function ensureEstateDefaults(estate) {
  if (!estate.emergencyToken) estate.emergencyToken = crypto.randomBytes(16).toString('hex');
  if (!estate.nextReviewAt) {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    estate.nextReviewAt = d.toISOString();
  }
  if (!estate.housewarming) {
    estate.housewarming = {
      completedSteps: [],
      currentStepId: 'create',
      completedAt: null,
      dismissed: false,
      startedAt: new Date().toISOString(),
    };
  }
  return estate;
}

export function scheduleLightReview(estate, fromMs = Date.now()) {
  estate.nextLightReviewAt = new Date(fromMs + LIGHT_REVIEW_MS).toISOString();
  estate.lastLightReviewAlertKey = null;
  return estate;
}

export { LIGHT_REVIEW_MS };
