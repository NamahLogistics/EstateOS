import { sendEmail } from './mail.js';

function appBase() {
  return (process.env.APP_URL || 'https://heirready.com').replace(/\/$/, '');
}

async function safeSend(payload) {
  try {
    await sendEmail({
      ...payload,
      tags: [{ name: 'category', value: 'counsel' }, ...(payload.tags || [])],
    });
  } catch (err) {
    console.error('counsel notify failed', payload.subject, err.message);
  }
}

/** Notify family that a paid lawyer approached their listing. */
export async function notifyFamilyOfApproach({ familyEmail, familyName, lawyerName, firm, estateName, estateId, pitch }) {
  if (!familyEmail) return;
  const link = `${appBase()}/app/estates/${estateId}?tab=counsel`;
  await safeSend({
    to: familyEmail,
    subject: `[Counsel] ${lawyerName} approached you on HeirReady`,
    text: `Hi ${familyName || 'there'},\n\n${lawyerName}${firm ? ` (${firm})` : ''} approached your counsel listing for ${estateName}.\n\n${pitch ? `Pitch:\n${pitch}\n\n` : ''}Review and accept/decline:\n${link}\n`,
    html: `<p>Hi ${familyName || 'there'},</p>
      <p><strong>${lawyerName}</strong>${firm ? ` · ${firm}` : ''} approached your counsel listing for <strong>${estateName}</strong>.</p>
      ${pitch ? `<p><em>“${pitch}”</em></p>` : ''}
      <p><a href="${link}">Open Counsel tab — accept or decline</a></p>`,
  });
}

/** Notify lawyer that a family requested them from the directory. */
export async function notifyLawyerOfRequest({ lawyerEmail, lawyerName, familyName, estateName, urgency, brief, estateId }) {
  if (!lawyerEmail) return;
  const link = `${appBase()}/app/counsel`;
  await safeSend({
    to: lawyerEmail,
    subject: `[Counsel] New matter request — ${estateName}`,
    text: `Hi ${lawyerName || 'Counsel'},\n\n${familyName || 'A family'} requested you for ${estateName} (${urgency || 'normal'}).\n\nBrief:\n${brief || '—'}\n\nAccept or decline on Counsel desk:\n${link}\n`,
    html: `<p>Hi ${lawyerName || 'Counsel'},</p>
      <p><strong>${familyName || 'A family'}</strong> requested you for <strong>${estateName}</strong> (${urgency || 'normal'}).</p>
      <p>${brief || '—'}</p>
      <p><a href="${link}">Open Counsel desk</a></p>`,
  });
}

/** Matter became active (lawyer or family accepted). */
export async function notifyMatterActive({ to, recipientName, otherPartyName, estateName, estateId, whoAccepted }) {
  if (!to) return;
  const link =
    whoAccepted === 'lawyer'
      ? `${appBase()}/app/estates/${estateId}?tab=counsel`
      : `${appBase()}/app/estates/${estateId}?tab=counsel`;
  const deskNote =
    whoAccepted === 'family'
      ? 'Family accepted your approach — matter is active.'
      : `${otherPartyName || 'Counsel'} accepted your request — matter is active.`;
  await safeSend({
    to,
    subject: `[Counsel] Matter active — ${estateName}`,
    text: `Hi ${recipientName || 'there'},\n\n${deskNote}\n\nOpen matter:\n${link}\n`,
    html: `<p>Hi ${recipientName || 'there'},</p>
      <p>${deskNote}</p>
      <p><a href="${link}">Open matter</a></p>`,
  });
}

/** Decline notifications (either side). */
export async function notifyMatterDeclined({ to, recipientName, estateName, reason, otherPartyName }) {
  if (!to) return;
  await safeSend({
    to,
    subject: `[Counsel] Declined — ${estateName}`,
    text: `Hi ${recipientName || 'there'},\n\n${otherPartyName || 'The other party'} declined the counsel engagement for ${estateName}.\n\nReason: ${reason || '—'}\n`,
    html: `<p>Hi ${recipientName || 'there'},</p>
      <p><strong>${otherPartyName || 'The other party'}</strong> declined the counsel engagement for <strong>${estateName}</strong>.</p>
      <p>Reason: ${reason || '—'}</p>`,
  });
}

/** Alert business inbox that a lawyer asked for verification. */
export async function notifyVerificationRequest({ lawyerName, email, barId, firm, cities, lawyerId }) {
  const to =
    process.env.ONBOARDING_EMAIL ||
    process.env.BUSINESS_EMAIL ||
    process.env.BUSINESS_GRIEVANCE_EMAIL;
  if (!to) return;
  await safeSend({
    to,
    subject: `[VERIFY] Counsel verification — ${lawyerName}`,
    text: `Lawyer requested verification\n\nName: ${lawyerName}\nEmail: ${email}\nFirm: ${firm}\nBar ID: ${barId}\nCities: ${(cities || []).join(', ')}\nLawyer id: ${lawyerId}\n\nVerify with:\nPOST /api/admin/lawyers/${lawyerId}/verify\nHeader X-Admin-Key: (ADMIN_API_KEY)\nBody: {"verified":true}\n`,
    html: `<p><strong>Counsel verification request</strong></p>
      <p>Name: ${lawyerName}<br/>Email: ${email}<br/>Firm: ${firm}<br/>Bar ID: ${barId}<br/>Cities: ${(cities || []).join(', ')}</p>
      <p class="small">Lawyer id: ${lawyerId}</p>`,
  });
}
