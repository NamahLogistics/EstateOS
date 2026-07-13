import crypto from 'crypto';
import { mutate, readStore } from './db.js';
import { sendEmail } from './mail.js';
import {
  applyPlanExpiryInPlace,
  RENEWAL_WARN_DAYS,
  userHasPaidAccess,
} from './plans.js';

export async function runReminderPass() {
  const store = readStore();
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  let sent = 0;
  const app = (process.env.APP_URL || 'https://estate-os-production.up.railway.app').replace(/\/$/, '');

  for (const user of store.users) {
    if (applyPlanExpiryInPlace(user)) {
      mutate((s) => {
        const u = s.users.find((x) => x.id === user.id);
        if (u) applyPlanExpiryInPlace(u);
      });
    }
    if (!user.email || !userHasPaidAccess(user) || !user.planExpiresAt) continue;
    const daysLeft = Math.ceil((new Date(user.planExpiresAt).getTime() - now) / day);
    if (daysLeft < 0 || daysLeft > RENEWAL_WARN_DAYS) continue;
    const key = `plan-renew:${user.id}:${user.planExpiresAt.slice(0, 10)}`;
    if (user.lastPlanRenewalAlertKey === key) continue;
    try {
      await sendEmail({
        to: user.email,
        subject: `Renew Estate OS ${user.plan} — ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`,
        text: `Your ${user.plan} plan expires on ${new Date(user.planExpiresAt).toLocaleDateString()}.\n\nRenew here (adds another year from your current end date):\n${app}/pricing\n\nIf it lapses, paid features lock until you renew.`,
        html: `<p>Your <strong>${user.plan}</strong> plan expires on <strong>${new Date(user.planExpiresAt).toLocaleDateString()}</strong> (${daysLeft} days).</p><p><a href="${app}/pricing">Renew on Pricing</a> — renewal stacks another year from your current end date.</p>`,
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

    // Yearly review
    if (estate.nextReviewAt) {
      const due = new Date(estate.nextReviewAt).getTime();
      if (due <= now && !estate.reviewReminderSentAt) {
        try {
          await sendEmail({
            to: owner.email,
            subject: `Yearly review: ${estate.subjectName}'s Life Map`,
            text: `It's time to review the Life Map for ${estate.subjectName}.\n\nOpen: ${app}/app/estates/${estate.id}\n\nMark reviewed when done so we remind you again next year.`,
            html: `<p>Time to review <strong>${estate.subjectName}</strong>'s Life Map.</p><p><a href="${app}/app/estates/${estate.id}">Open estate</a></p>`,
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

    // Doc expiry (within 30 days)
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
          text: `These Life Map items expire within 30 days:\n\n${list}\n\n${app}/app/estates/${estate.id}`,
          html: `<p>Expiring soon for <strong>${estate.subjectName}</strong>:</p><pre>${list}</pre><p><a href="${app}/app/estates/${estate.id}">Open estate</a></p>`,
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
  return estate;
}
