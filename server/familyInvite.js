import crypto from 'crypto';

const FAMILY_INVITE_DAYS = 90;
const FAMILY_INVITE_MAX_USES = 25;

function uuid() {
  return crypto.randomUUID();
}

function appBase() {
  return (process.env.APP_URL || '').replace(/\/$/, '') || 'https://heirready.com';
}

export function inviteLinkFor(token) {
  return `${appBase()}/invite/${token}`;
}

export function findActiveFamilyInvite(store, estateId, role = 'manager') {
  const now = Date.now();
  return (store.invites || []).find(
    (i) =>
      i.estateId === estateId &&
      i.multiUse &&
      !i.email &&
      i.status === 'pending' &&
      (i.role || 'manager') === role &&
      new Date(i.expiresAt).getTime() > now &&
      (i.maxUses == null || (i.useCount || 0) < i.maxUses)
  );
}

/**
 * Discord-style durable open invite — one link, many siblings.
 * Reuses an active multi-use invite when possible.
 */
export function ensureFamilyInvite(s, estateId, { role = 'manager', invitedBy } = {}) {
  if (!s.invites) s.invites = [];
  const existing = findActiveFamilyInvite(s, estateId, role);
  if (existing) return existing;

  const invite = {
    id: uuid(),
    estateId,
    email: '',
    role: role === 'viewer' ? 'viewer' : 'manager',
    token: crypto.randomBytes(24).toString('hex'),
    invitedBy: invitedBy || null,
    status: 'pending',
    multiUse: true,
    maxUses: FAMILY_INVITE_MAX_USES,
    useCount: 0,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + FAMILY_INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  };
  s.invites.push(invite);
  return invite;
}

export function familyInvitePublicView(invite, store, estate) {
  if (!invite) return null;
  const members = (store.members || []).filter(
    (m) => m.estateId === invite.estateId && m.status === 'active'
  );
  const onMap = members.length + 1; // + owner
  return {
    token: invite.token,
    link: inviteLinkFor(invite.token),
    role: invite.role,
    multiUse: true,
    maxUses: invite.maxUses ?? FAMILY_INVITE_MAX_USES,
    useCount: invite.useCount || 0,
    remaining: Math.max(0, (invite.maxUses ?? FAMILY_INVITE_MAX_USES) - (invite.useCount || 0)),
    expiresAt: invite.expiresAt,
    memberCount: onMap,
    estateName: estate?.subjectName || null,
  };
}

/** True if this invite can still be accepted (single or multi). */
export function inviteIsAcceptable(invite) {
  if (!invite) return false;
  if (invite.status !== 'pending') return false;
  if (new Date(invite.expiresAt).getTime() < Date.now()) return false;
  if (invite.multiUse) {
    const max = invite.maxUses ?? FAMILY_INVITE_MAX_USES;
    if ((invite.useCount || 0) >= max) return false;
  }
  return true;
}

/**
 * Mark invite consumed: single-use → accepted; multi-use → increment count.
 */
export function consumeInvite(inv, acceptedEmail) {
  if (inv.multiUse) {
    inv.useCount = (inv.useCount || 0) + 1;
    inv.lastAcceptedAt = new Date().toISOString();
    if (!inv.email && acceptedEmail) {
      /* keep open — do not bind email */
    }
    const max = inv.maxUses ?? FAMILY_INVITE_MAX_USES;
    if (inv.useCount >= max) {
      inv.status = 'exhausted';
      inv.exhaustedAt = new Date().toISOString();
    }
  } else {
    inv.status = 'accepted';
    inv.acceptedAt = new Date().toISOString();
    if (!inv.email && acceptedEmail) inv.email = acceptedEmail;
  }
}
