import { mutate, readStore, audit } from './db.js';
import { authRequired } from './auth.js';
import {
  analyzeLegalPathways,
  buildCounselBrief,
  purgeDemoCounsel,
} from './lawyers.js';
import { userHasPaidAccess } from './plans.js';
import {
  notifyFamilyOfApproach,
  notifyLawyerOfRequest,
  notifyMatterActive,
  notifyMatterDeclined,
  notifyVerificationRequest,
} from './counselNotify.js';
import crypto from 'crypto';

const uuid = () => crypto.randomUUID();

const SPECIALTY_OPTIONS = [
  'succession',
  'property',
  'probate',
  'nri',
  'disputes',
  'insurance',
  'banking-claims',
  'family-settlement',
];

function splitList(value, fallback = []) {
  if (Array.isArray(value)) {
    return value.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,|/]/)
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return fallback;
}

function publicLawyer(lawyer) {
  return {
    id: lawyer.id,
    slug: lawyer.slug,
    name: lawyer.name,
    firm: lawyer.firm,
    cities: lawyer.cities || [],
    specialties: lawyer.specialties || [],
    languages: lawyer.languages || [],
    barId: lawyer.barId,
    years: lawyer.years,
    retainerBand: lawyer.retainerBand,
    slaHours: lawyer.slaHours,
    bio: lawyer.bio,
    rating: lawyer.mattersCompleted > 0 ? lawyer.rating : null,
    mattersCompleted: lawyer.mattersCompleted || 0,
    nriFriendly: !!lawyer.nriFriendly,
    verified: !!lawyer.verified,
    acceptingMatters: lawyer.acceptingMatters !== false,
    verificationRequestedAt: lawyer.verificationRequestedAt || null,
  };
}

function selfLawyer(lawyer, user) {
  return {
    ...publicLawyer(lawyer),
    email: user?.email || null,
  };
}

function adminAuthorized(req) {
  const key = process.env.ADMIN_API_KEY;
  if (!key) return false;
  return req.get('X-Admin-Key') === key || req.body?.adminKey === key;
}

function publicListing(listing, estate, owner) {
  return {
    id: listing.id,
    estateId: listing.estateId,
    city: listing.city,
    scopes: listing.scopes || [],
    blurb: listing.blurb || '',
    urgency: listing.urgency || 'normal',
    status: listing.status,
    estateStatus: estate?.status || null,
    subjectName: estate?.subjectName || null,
    familyLead: owner
      ? { name: owner.name, email: listing.showContact ? owner.email : undefined }
      : null,
    updatedAt: listing.updatedAt,
    createdAt: listing.createdAt,
  };
}

function activateEngagement(s, row, actorUserId) {
  const estate = s.estates.find((e) => e.id === row.estateId);
  const items = s.items.filter((i) => i.estateId === estate.id);
  const tasks = s.tasks.filter((t) => t.estateId === estate.id);
  const pathway = analyzeLegalPathways(estate, items);
  row.status = 'active';
  row.conflictClearedByLawyer = true;
  row.acceptedAt = new Date().toISOString();
  row.updatedAt = row.acceptedAt;
  row.pathwaySnapshot = pathway;

  for (const p of pathway.pathways.filter((x) => ['critical', 'high'].includes(x.severity))) {
    for (const action of p.counselActions.slice(0, 2)) {
      s.legalActions.push({
        id: uuid(),
        estateId: estate.id,
        engagementId: row.id,
        title: action,
        pathwayId: p.id,
        status: 'todo',
        createdBy: actorUserId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  const needs = [
    'Death certificate / incapacity proof (certified copies)',
    'ID + address proof of all Class I heirs',
    'Any will / nomination forms / property title copies',
  ];
  for (const title of needs) {
    s.counselNeeds.push({
      id: uuid(),
      estateId: estate.id,
      engagementId: row.id,
      title,
      status: 'open',
      createdBy: actorUserId,
      createdAt: new Date().toISOString(),
    });
  }

  const members = s.members
    .filter((m) => m.estateId === estate.id)
    .map((m) => {
      const u = s.users.find((x) => x.id === m.userId);
      return { ...m, name: u?.name, email: u?.email };
    });
  const owner = s.users.find((u) => u.id === estate.ownerId);
  members.unshift({
    id: 'owner',
    role: 'owner',
    name: owner?.name,
    email: owner?.email,
  });
  const unlockRequest = s.unlockRequests
    .filter((r) => r.estateId === estate.id && r.status === 'approved')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const lawyer = s.lawyers.find((l) => l.id === row.lawyerId);
  const familyUser = s.users.find((u) => u.id === row.familyUserId);
  row.counselBrief = buildCounselBrief({
    estate,
    items,
    members,
    tasks,
    unlockRequest,
    engagement: row,
    pathway,
    familyUser,
    lawyer,
  });

  return { engagement: row, pathway, brief: row.counselBrief, lawyer };
}
/** One-time/boot: remove demo @estateos.dev counsel accounts. */
export function seedLawyersIfNeeded() {
  let stats = { removedUsers: 0, removedLawyers: 0, removedEngagements: 0 };
  mutate((s) => {
    stats = purgeDemoCounsel(s);
  });
  if (stats.removedLawyers || stats.removedUsers) {
    console.log(
      `Purged demo counsel: ${stats.removedLawyers} profiles, ${stats.removedUsers} users, ${stats.removedEngagements} matters`
    );
  }
  return stats;
}

function getEngagementAccess(store, userId, estateId) {
  return store.engagements.find(
    (e) =>
      e.estateId === estateId &&
      e.lawyerUserId === userId &&
      ['engaged', 'active'].includes(e.status)
  );
}

export function attachLawyerAccess(canAccessEstate) {
  return function canAccessEstateWithCounsel(store, userId, estateId) {
    const base = canAccessEstate(store, userId, estateId);
    if (base.ok) return base;
    const eng = getEngagementAccess(store, userId, estateId);
    if (eng) {
      const estate = store.estates.find((e) => e.id === estateId);
      return { ok: true, estate, role: 'counsel', engagement: eng };
    }
    // pending request: lawyer can see limited? no - only after accept
    return base;
  };
}

export function registerLawyerRoutes(app, { canAccessEstate }) {
  const accessFn = attachLawyerAccess(canAccessEstate);

  app.get('/api/lawyers', authRequired, (req, res) => {
    const store = readStore();
    let list = (store.lawyers || []).filter((l) => l.acceptingMatters);
    const { city, specialty, nri } = req.query;
    if (city) {
      const c = String(city).toLowerCase();
      list = list.filter((l) => l.cities.some((x) => x.toLowerCase().includes(c)));
    }
    if (specialty) {
      const s = String(specialty).toLowerCase();
      list = list.filter((l) => l.specialties.some((x) => x.toLowerCase().includes(s)));
    }
    if (nri === '1' || nri === 'true') list = list.filter((l) => l.nriFriendly);
    list.sort((a, b) => {
      if (!!b.verified !== !!a.verified) return b.verified ? 1 : -1;
      const ra = a.mattersCompleted > 0 ? a.rating : 0;
      const rb = b.mattersCompleted > 0 ? b.rating : 0;
      return rb - ra;
    });
    res.json({ lawyers: list.map(publicLawyer) });
  });

  app.get('/api/lawyers/me', authRequired, (req, res) => {
    const store = readStore();
    const profile = store.lawyers.find((l) => l.userId === req.user.id);
    if (!profile) return res.status(404).json({ error: 'Not a counsel account' });
    res.json({ lawyer: selfLawyer(profile, req.user), specialtyOptions: SPECIALTY_OPTIONS });
  });

  app.patch('/api/lawyers/me', authRequired, (req, res) => {
    const store = readStore();
    const profile = store.lawyers.find((l) => l.userId === req.user.id);
    if (!profile) return res.status(404).json({ error: 'Not a counsel account' });

    const body = req.body || {};
    const cities = body.cities !== undefined ? splitList(body.cities, profile.cities) : null;
    const specialties =
      body.specialties !== undefined ? splitList(body.specialties, profile.specialties) : null;
    const languages =
      body.languages !== undefined ? splitList(body.languages, profile.languages) : null;

    if (cities && !cities.length) {
      return res.status(400).json({ error: 'Add at least one city' });
    }
    if (specialties && !specialties.length) {
      return res.status(400).json({ error: 'Add at least one specialty' });
    }

    const updated = mutate((s) => {
      const row = s.lawyers.find((l) => l.id === profile.id);
      if (!row) return null;
      if (body.name !== undefined) row.name = String(body.name).trim() || row.name;
      if (body.firm !== undefined) row.firm = String(body.firm).trim() || row.firm;
      if (cities) row.cities = cities;
      if (specialties) row.specialties = specialties;
      if (languages) row.languages = languages;
      if (body.barId !== undefined) {
        const nextBar = String(body.barId).trim();
        if (nextBar && nextBar !== row.barId) {
          row.barId = nextBar;
          row.verified = false;
          row.verificationRequestedAt = null;
        } else if (nextBar) {
          row.barId = nextBar;
        }
      }
      if (body.years !== undefined) {
        const y = Number(body.years);
        if (Number.isFinite(y) && y >= 0 && y <= 60) row.years = y;
      }
      if (body.retainerBand !== undefined) {
        row.retainerBand = String(body.retainerBand).trim() || row.retainerBand;
      }
      if (body.slaHours !== undefined) {
        const h = Number(body.slaHours);
        if (Number.isFinite(h) && h >= 1 && h <= 168) row.slaHours = h;
      }
      if (body.bio !== undefined) row.bio = String(body.bio).trim().slice(0, 800);
      if (body.nriFriendly !== undefined) row.nriFriendly = !!body.nriFriendly;
      if (body.acceptingMatters !== undefined) row.acceptingMatters = !!body.acceptingMatters;
      row.updatedAt = new Date().toISOString();

      const user = s.users.find((u) => u.id === req.user.id);
      if (user && body.name !== undefined && String(body.name).trim()) {
        user.name = String(body.name).trim();
      }
      return row;
    });

    if (!updated) return res.status(404).json({ error: 'Profile not found' });
    res.json({ lawyer: selfLawyer(updated, req.user) });
  });

  app.post('/api/lawyers/me/request-verification', authRequired, async (req, res) => {
    const store = readStore();
    const profile = store.lawyers.find((l) => l.userId === req.user.id);
    if (!profile) return res.status(404).json({ error: 'Not a counsel account' });
    if (profile.verified) return res.json({ ok: true, lawyer: selfLawyer(profile, req.user) });
    const barId = String(profile.barId || '').trim();
    if (!barId || /pending/i.test(barId)) {
      return res.status(400).json({ error: 'Add a real bar / enrollment ID before requesting verification' });
    }

    mutate((s) => {
      const row = s.lawyers.find((l) => l.id === profile.id);
      if (row) row.verificationRequestedAt = new Date().toISOString();
    });

    await notifyVerificationRequest({
      lawyerName: profile.name,
      email: req.user.email,
      barId: profile.barId,
      firm: profile.firm,
      cities: profile.cities,
      lawyerId: profile.id,
    });

    const fresh = readStore().lawyers.find((l) => l.id === profile.id);
    res.json({
      ok: true,
      message: 'Verification requested — HeirReady will review your bar ID',
      lawyer: selfLawyer(fresh, req.user),
    });
  });

  app.post('/api/admin/lawyers/:id/verify', async (req, res) => {
    if (!adminAuthorized(req)) {
      return res.status(401).json({ error: 'Admin key required (X-Admin-Key)' });
    }
    const verified = req.body?.verified !== false;
    const updated = mutate((s) => {
      const row = s.lawyers.find((l) => l.id === req.params.id);
      if (!row) return null;
      row.verified = verified;
      row.verifiedAt = verified ? new Date().toISOString() : null;
      if (verified) row.verificationRequestedAt = null;
      row.updatedAt = new Date().toISOString();
      return row;
    });
    if (!updated) return res.status(404).json({ error: 'Lawyer not found' });
    res.json({ ok: true, lawyer: publicLawyer(updated) });
  });

  app.get('/api/counsel/desk', authRequired, (req, res) => {
    const store = readStore();
    const profile = store.lawyers.find((l) => l.userId === req.user.id);
    if (!profile && req.user.accountType !== 'lawyer') {
      return res.status(403).json({ error: 'Counsel desk is for lawyer accounts' });
    }
    const mine = store.engagements.filter((e) => e.lawyerUserId === req.user.id);
    const enriched = mine
      .map((e) => {
        const estate = store.estates.find((x) => x.id === e.estateId);
        const owner = store.users.find((u) => u.id === estate?.ownerId);
        return {
          ...e,
          estateName: estate?.subjectName,
          estateStatus: estate?.status,
          familyLead: owner ? { name: owner.name, email: owner.email } : null,
        };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const paid = userHasPaidAccess(req.user);
    res.json({
      lawyer: profile ? selfLawyer(profile, req.user) : null,
      engagements: enriched,
      leadsUnlocked: paid,
      plan: req.user.plan || 'free',
      planExpiresAt: req.user.planExpiresAt || null,
      specialtyOptions: SPECIALTY_OPTIONS,
      stats: {
        requested: enriched.filter((e) => e.status === 'requested' || e.status === 'approached').length,
        active: enriched.filter((e) => ['engaged', 'active'].includes(e.status)).length,
        closed: enriched.filter((e) => e.status === 'closed').length,
      },
    });
  });

  /** Paid counsel only — families who opted into city discovery */
  app.get('/api/counsel/leads', authRequired, (req, res) => {
    const store = readStore();
    const profile = store.lawyers.find((l) => l.userId === req.user.id);
    if (!profile && req.user.accountType !== 'lawyer') {
      return res.status(403).json({ error: 'Counsel leads are for lawyer accounts' });
    }
    if (!userHasPaidAccess(req.user)) {
      return res.status(402).json({
        error: 'Upgrade to Counsel Pro to see families looking for counsel in your cities',
        needsPayment: true,
        planSuggested: 'counsel',
        leadsUnlocked: false,
      });
    }

    let listings = (store.counselListings || []).filter((l) => l.status === 'open');
    const cityQ = String(req.query.city || '').trim().toLowerCase();
    if (cityQ) {
      listings = listings.filter((l) => String(l.city || '').toLowerCase().includes(cityQ));
    } else if (profile?.cities?.length) {
      listings = listings.filter((l) =>
        profile.cities.some((c) =>
          String(l.city || '')
            .toLowerCase()
            .includes(String(c).toLowerCase())
        )
      );
    }

    const leads = listings
      .map((listing) => {
        const estate = store.estates.find((e) => e.id === listing.estateId);
        if (!estate) return null;
        const owner = store.users.find((u) => u.id === estate.ownerId);
        const already = store.engagements.find(
          (e) =>
            e.estateId === listing.estateId &&
            e.lawyerUserId === req.user.id &&
            !['declined', 'closed'].includes(e.status)
        );
        return {
          ...publicListing(listing, estate, owner),
          alreadyApproached: !!already,
          engagementStatus: already?.status || null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    res.json({
      leadsUnlocked: true,
      leads,
      lawyerCities: profile?.cities || [],
    });
  });

  app.post('/api/counsel/leads/:listingId/approach', authRequired, async (req, res) => {
    const store = readStore();
    const profile = store.lawyers.find((l) => l.userId === req.user.id);
    if (!profile) return res.status(403).json({ error: 'Counsel profile required' });
    if (!userHasPaidAccess(req.user)) {
      return res.status(402).json({
        error: 'Upgrade to Counsel Pro to approach families',
        needsPayment: true,
        planSuggested: 'counsel',
      });
    }
    if (!req.body?.conflictCleared) {
      return res.status(400).json({ error: 'Conflict check clearance required before approaching' });
    }

    const listing = (store.counselListings || []).find(
      (l) => l.id === req.params.listingId && l.status === 'open'
    );
    if (!listing) return res.status(404).json({ error: 'Lead not found or no longer open' });

    const estate = store.estates.find((e) => e.id === listing.estateId);
    if (!estate) return res.status(404).json({ error: 'Estate not found' });
    const owner = store.users.find((u) => u.id === estate.ownerId);

    const open = store.engagements.find(
      (e) =>
        e.estateId === estate.id &&
        e.lawyerId === profile.id &&
        !['declined', 'closed'].includes(e.status)
    );
    if (open) return res.status(409).json({ error: 'You already have an open engagement on this estate' });

    const message = (req.body?.message || '').trim();
    const scopes =
      Array.isArray(req.body?.scopes) && req.body.scopes.length
        ? req.body.scopes
        : listing.scopes?.length
          ? listing.scopes
          : ['succession'];

    const engagement = {
      id: uuid(),
      estateId: estate.id,
      lawyerId: profile.id,
      lawyerUserId: profile.userId,
      familyUserId: estate.ownerId,
      listingId: listing.id,
      initiatedBy: 'lawyer',
      matterTitle: `${estate.subjectName} — succession matter`,
      scopes,
      familyBrief: listing.blurb || '',
      lawyerPitch: message,
      urgency: listing.urgency || 'normal',
      status: 'approached',
      conflictAck: true,
      conflictClearedByLawyer: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      acceptedAt: null,
      closedAt: null,
    };

    mutate((s) => {
      if (!s.counselListings) s.counselListings = [];
      s.engagements.push(engagement);
      audit(s, {
        estateId: estate.id,
        userId: req.user.id,
        action: 'counsel_approached_family',
        detail: `${profile.name} approached listing ${listing.id}`,
      });
    });

    await notifyFamilyOfApproach({
      familyEmail: owner?.email,
      familyName: owner?.name,
      lawyerName: profile.name,
      firm: profile.firm,
      estateName: estate.subjectName,
      estateId: estate.id,
      pitch: message,
    });

    res.status(201).json({ engagement, lawyer: publicLawyer(profile) });
  });

  app.get('/api/estates/:id/counsel/listing', authRequired, (req, res) => {
    const store = readStore();
    const access = accessFn(store, req.user.id, req.params.id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    if (!['owner', 'manager'].includes(access.role)) {
      return res.status(403).json({ error: 'Only owner/manager can manage counsel listing' });
    }
    const listing = (store.counselListings || []).find((l) => l.estateId === access.estate.id);
    res.json({ listing: listing || null });
  });

  app.put('/api/estates/:id/counsel/listing', authRequired, (req, res) => {
    const store = readStore();
    const access = accessFn(store, req.user.id, req.params.id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    if (!['owner', 'manager'].includes(access.role)) {
      return res.status(403).json({ error: 'Only owner/manager can publish a counsel listing' });
    }

    const city = String(req.body?.city || '').trim();
    const blurb = String(req.body?.blurb || '').trim();
    const scopes = Array.isArray(req.body?.scopes)
      ? req.body.scopes.map((s) => String(s).trim()).filter(Boolean)
      : [];
    const urgency =
      req.body?.urgency === 'critical' || req.body?.urgency === 'high' ? req.body.urgency : 'normal';
    const published = req.body?.published !== false;
    const showContact = !!req.body?.showContact;

    if (published && !city) return res.status(400).json({ error: 'City required to publish' });
    if (published && blurb.length < 20) {
      return res.status(400).json({ error: 'Blurb must be at least 20 characters (no vault details)' });
    }

    const listing = mutate((s) => {
      if (!s.counselListings) s.counselListings = [];
      let row = s.counselListings.find((l) => l.estateId === access.estate.id);
      const now = new Date().toISOString();
      if (!row) {
        row = {
          id: uuid(),
          estateId: access.estate.id,
          publishedByUserId: req.user.id,
          city,
          scopes: scopes.length ? scopes : ['succession'],
          blurb,
          urgency,
          showContact,
          status: published ? 'open' : 'paused',
          createdAt: now,
          updatedAt: now,
        };
        s.counselListings.push(row);
      } else {
        row.city = city || row.city;
        row.blurb = blurb || row.blurb;
        row.scopes = scopes.length ? scopes : row.scopes;
        row.urgency = urgency;
        row.showContact = showContact;
        row.status = published ? 'open' : 'paused';
        row.updatedAt = now;
        row.publishedByUserId = req.user.id;
      }
      audit(s, {
        estateId: access.estate.id,
        userId: req.user.id,
        action: published ? 'counsel_listing_published' : 'counsel_listing_paused',
        detail: `${row.city} · ${row.status}`,
      });
      return row;
    });

    res.json({ listing });
  });

  app.post('/api/counsel/engagements/:engagementId/family-respond', authRequired, async (req, res) => {
    const store = readStore();
    const eng = store.engagements.find((e) => e.id === req.params.engagementId);
    if (!eng) return res.status(404).json({ error: 'Engagement not found' });
    if (eng.status !== 'approached') {
      return res.status(400).json({ error: 'Not awaiting family response' });
    }
    const access = accessFn(store, req.user.id, eng.estateId);
    if (!access.ok || !['owner', 'manager'].includes(access.role)) {
      return res.status(403).json({ error: 'Only estate owner/manager can respond' });
    }

    const lawyer = store.lawyers.find((l) => l.id === eng.lawyerId);
    const lawyerUser = store.users.find((u) => u.id === eng.lawyerUserId);
    const estate = store.estates.find((e) => e.id === eng.estateId);

    const decision = req.body?.decision === 'accept' ? 'accept' : 'decline';
    if (decision === 'decline') {
      const reason = (req.body?.reason || '').trim() || 'Family declined approach';
      mutate((s) => {
        const row = s.engagements.find((e) => e.id === eng.id);
        row.status = 'declined';
        row.declineReason = reason;
        row.updatedAt = new Date().toISOString();
        audit(s, {
          estateId: row.estateId,
          userId: req.user.id,
          action: 'counsel_approach_declined',
          detail: reason,
        });
      });
      await notifyMatterDeclined({
        to: lawyerUser?.email,
        recipientName: lawyer?.name,
        estateName: estate?.subjectName,
        reason,
        otherPartyName: req.user.name || 'Family',
      });
      return res.json({ ok: true, status: 'declined' });
    }

    const result = mutate((s) => {
      const row = s.engagements.find((e) => e.id === eng.id);
      const activated = activateEngagement(s, row, req.user.id);
      const listing = (s.counselListings || []).find((l) => l.estateId === row.estateId);
      if (listing) {
        listing.status = 'closed';
        listing.updatedAt = new Date().toISOString();
      }
      audit(s, {
        estateId: row.estateId,
        userId: req.user.id,
        action: 'counsel_approach_accepted',
        detail: 'Family accepted lawyer approach — matter active',
      });
      return activated;
    });

    await notifyMatterActive({
      to: lawyerUser?.email,
      recipientName: lawyer?.name,
      otherPartyName: req.user.name,
      estateName: estate?.subjectName,
      estateId: eng.estateId,
      whoAccepted: 'family',
    });

    res.json(result);
  });

  app.post('/api/estates/:id/counsel/engage', authRequired, async (req, res) => {
    const store = readStore();
    const access = accessFn(store, req.user.id, req.params.id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    if (access.role === 'counsel') {
      return res.status(400).json({ error: 'Counsel cannot engage another counsel here' });
    }
    if (access.role === 'viewer') {
      return res.status(403).json({ error: 'Only owner/manager can engage counsel' });
    }
    const { lawyerId, scopes, familyBrief, urgency, conflictAck } = req.body || {};
    if (!lawyerId) return res.status(400).json({ error: 'lawyerId required' });
    if (!conflictAck) {
      return res.status(400).json({ error: 'Confirm no known conflict before engaging' });
    }
    const lawyer = store.lawyers.find((l) => l.id === lawyerId);
    if (!lawyer || !lawyer.acceptingMatters) {
      return res.status(404).json({ error: 'Counsel not available' });
    }
    const lawyerUser = store.users.find((u) => u.id === lawyer.userId);
    const open = store.engagements.find(
      (e) =>
        e.estateId === access.estate.id &&
        e.lawyerId === lawyerId &&
        !['declined', 'closed'].includes(e.status)
    );
    if (open) return res.status(409).json({ error: 'Engagement already open with this counsel' });

    const engagement = {
      id: uuid(),
      estateId: access.estate.id,
      lawyerId: lawyer.id,
      lawyerUserId: lawyer.userId,
      familyUserId: req.user.id,
      matterTitle: `${access.estate.subjectName} — succession matter`,
      scopes: Array.isArray(scopes) && scopes.length ? scopes : ['succession'],
      familyBrief: (familyBrief || '').trim(),
      urgency: urgency === 'critical' || urgency === 'high' ? urgency : 'normal',
      status: 'requested',
      conflictAck: true,
      conflictClearedByLawyer: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      acceptedAt: null,
      closedAt: null,
    };

    mutate((s) => {
      s.engagements.push(engagement);
      audit(s, {
        estateId: access.estate.id,
        userId: req.user.id,
        action: 'counsel_engaged_request',
        detail: `Requested ${lawyer.name} (${engagement.urgency})`,
      });
    });

    await notifyLawyerOfRequest({
      lawyerEmail: lawyerUser?.email,
      lawyerName: lawyer.name,
      familyName: req.user.name,
      estateName: access.estate.subjectName,
      urgency: engagement.urgency,
      brief: engagement.familyBrief,
      estateId: access.estate.id,
    });

    res.status(201).json({ engagement, lawyer: publicLawyer(lawyer) });
  });

  app.post('/api/counsel/engagements/:engagementId/accept', authRequired, async (req, res) => {
    const store = readStore();
    const eng = store.engagements.find((e) => e.id === req.params.engagementId);
    if (!eng) return res.status(404).json({ error: 'Engagement not found' });
    if (eng.lawyerUserId !== req.user.id) {
      return res.status(403).json({ error: 'Only appointed counsel can accept' });
    }
    if (eng.status !== 'requested') {
      return res.status(400).json({ error: 'Not awaiting acceptance' });
    }
    const conflictCleared = !!req.body?.conflictCleared;
    if (!conflictCleared) {
      return res.status(400).json({ error: 'Conflict check clearance required' });
    }

    const result = mutate((s) => {
      const row = s.engagements.find((e) => e.id === eng.id);
      row.status = 'active';
      row.conflictClearedByLawyer = true;
      row.acceptedAt = new Date().toISOString();
      row.updatedAt = row.acceptedAt;

      const estate = s.estates.find((e) => e.id === row.estateId);
      const items = s.items.filter((i) => i.estateId === estate.id);
      const tasks = s.tasks.filter((t) => t.estateId === estate.id);
      const pathway = analyzeLegalPathways(estate, items);
      row.pathwaySnapshot = pathway;

      // Seed counsel legal actions from pathway
      for (const p of pathway.pathways.filter((x) => ['critical', 'high'].includes(x.severity))) {
        for (const action of p.counselActions.slice(0, 2)) {
          s.legalActions.push({
            id: uuid(),
            estateId: estate.id,
            engagementId: row.id,
            title: action,
            pathwayId: p.id,
            status: 'todo',
            createdBy: req.user.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }

      // Ask family for core docs
      const needs = [
        'Death certificate / incapacity proof (certified copies)',
        'ID + address proof of all Class I heirs',
        'Any will / nomination forms / property title copies',
      ];
      for (const title of needs) {
        s.counselNeeds.push({
          id: uuid(),
          estateId: estate.id,
          engagementId: row.id,
          title,
          status: 'open',
          createdBy: req.user.id,
          createdAt: new Date().toISOString(),
        });
      }

      const members = s.members
        .filter((m) => m.estateId === estate.id)
        .map((m) => {
          const u = s.users.find((x) => x.id === m.userId);
          return { ...m, name: u?.name, email: u?.email };
        });
      const owner = s.users.find((u) => u.id === estate.ownerId);
      members.unshift({
        id: 'owner',
        role: 'owner',
        name: owner?.name,
        email: owner?.email,
      });
      const unlockRequest = s.unlockRequests
        .filter((r) => r.estateId === estate.id && r.status === 'approved')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      const lawyer = s.lawyers.find((l) => l.id === row.lawyerId);
      const familyUser = s.users.find((u) => u.id === row.familyUserId);
      const brief = buildCounselBrief({
        estate,
        items,
        members,
        tasks,
        unlockRequest,
        engagement: row,
        pathway,
        familyUser,
        lawyer,
      });
      row.counselBrief = brief;

      audit(s, {
        estateId: estate.id,
        userId: req.user.id,
        action: 'counsel_accepted',
        detail: `${lawyer?.name || 'Counsel'} accepted matter — brief generated`,
      });

      return { engagement: row, pathway, brief };
    });

    const familyUser = readStore().users.find((u) => u.id === eng.familyUserId);
    const estate = readStore().estates.find((e) => e.id === eng.estateId);
    await notifyMatterActive({
      to: familyUser?.email,
      recipientName: familyUser?.name,
      otherPartyName: req.user.name,
      estateName: estate?.subjectName,
      estateId: eng.estateId,
      whoAccepted: 'lawyer',
    });

    res.json(result);
  });

  app.post('/api/counsel/engagements/:engagementId/decline', authRequired, async (req, res) => {
    const reason = (req.body?.reason || '').trim() || 'Declined';
    const store = readStore();
    const eng = store.engagements.find((e) => e.id === req.params.engagementId);
    if (!eng) return res.status(404).json({ error: 'Engagement not found' });
    if (eng.lawyerUserId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    const familyUser = store.users.find((u) => u.id === eng.familyUserId);
    const estate = store.estates.find((e) => e.id === eng.estateId);
    mutate((s) => {
      const row = s.engagements.find((e) => e.id === eng.id);
      row.status = 'declined';
      row.declineReason = reason;
      row.updatedAt = new Date().toISOString();
      audit(s, {
        estateId: row.estateId,
        userId: req.user.id,
        action: 'counsel_declined',
        detail: reason,
      });
    });
    await notifyMatterDeclined({
      to: familyUser?.email,
      recipientName: familyUser?.name,
      estateName: estate?.subjectName,
      reason,
      otherPartyName: req.user.name || 'Counsel',
    });
    res.json({ ok: true });
  });

  app.post('/api/counsel/engagements/:engagementId/close', authRequired, (req, res) => {
    const store = readStore();
    const eng = store.engagements.find((e) => e.id === req.params.engagementId);
    if (!eng) return res.status(404).json({ error: 'Engagement not found' });
    const isCounsel = eng.lawyerUserId === req.user.id;
    const access = accessFn(store, req.user.id, eng.estateId);
    if (!isCounsel && access.role !== 'owner') {
      return res.status(403).json({ error: 'Only counsel or owner can close' });
    }
    mutate((s) => {
      const row = s.engagements.find((e) => e.id === eng.id);
      row.status = 'closed';
      row.closedAt = new Date().toISOString();
      row.updatedAt = row.closedAt;
      audit(s, {
        estateId: row.estateId,
        userId: req.user.id,
        action: 'counsel_closed',
        detail: 'Matter closed',
      });
    });
    res.json({ ok: true });
  });

  app.get('/api/estates/:id/counsel', authRequired, (req, res) => {
    const store = readStore();
    const access = accessFn(store, req.user.id, req.params.id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const items = store.items.filter((i) => i.estateId === access.estate.id);
    const pathway = analyzeLegalPathways(access.estate, items);
    const engagements = store.engagements
      .filter((e) => e.estateId === access.estate.id)
      .map((e) => {
        const lawyer = store.lawyers.find((l) => l.id === e.lawyerId);
        return {
          ...e,
          counselBrief: access.role === 'counsel' || ['owner', 'manager'].includes(access.role)
            ? e.counselBrief
            : undefined,
          lawyer: lawyer ? publicLawyer(lawyer) : null,
        };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const active = engagements.find((e) =>
      ['engaged', 'active', 'requested', 'approached'].includes(e.status)
    );
    const engagementId = active?.id;
    const notes = store.legalNotes
      .filter((n) => n.estateId === access.estate.id)
      .filter((n) => {
        if (!n.privileged) return true;
        return access.role === 'counsel' || ['owner', 'manager'].includes(access.role);
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const actions = store.legalActions
      .filter((a) => a.estateId === access.estate.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const needs = store.counselNeeds.filter((n) => n.estateId === access.estate.id);
    const listing = (store.counselListings || []).find((l) => l.estateId === access.estate.id) || null;

    res.json({
      role: access.role,
      pathway,
      engagements,
      activeEngagementId: engagementId || null,
      listing,
      notes: notes.map((n) => {
        const author = store.users.find((u) => u.id === n.authorId);
        return { ...n, authorName: author?.name || 'Unknown' };
      }),
      actions,
      needs,
    });
  });

  app.get('/api/estates/:id/counsel/brief', authRequired, (req, res) => {
    const store = readStore();
    const access = accessFn(store, req.user.id, req.params.id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    if (!['owner', 'manager', 'counsel'].includes(access.role)) {
      return res.status(403).json({ error: 'Brief restricted' });
    }
    const eng = store.engagements
      .filter((e) => e.estateId === access.estate.id && e.counselBrief)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (!eng?.counselBrief) {
      return res.status(404).json({ error: 'No counsel brief yet — counsel must accept first' });
    }
    mutate((s) => {
      audit(s, {
        estateId: access.estate.id,
        userId: req.user.id,
        action: 'counsel_brief_downloaded',
        detail: eng.id,
      });
    });
    res.json({
      filename: `CounselBrief_${access.estate.subjectName.replace(/\s+/g, '_')}.txt`,
      content: eng.counselBrief,
    });
  });

  app.post('/api/estates/:id/counsel/notes', authRequired, (req, res) => {
    const store = readStore();
    const access = accessFn(store, req.user.id, req.params.id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    if (!['owner', 'manager', 'counsel'].includes(access.role)) {
      return res.status(403).json({ error: 'Cannot post notes' });
    }
    const body = (req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Note body required' });
    const privileged = req.body?.privileged !== false;
    const note = {
      id: uuid(),
      estateId: access.estate.id,
      engagementId: req.body?.engagementId || null,
      authorId: req.user.id,
      authorRole: access.role,
      body,
      privileged,
      createdAt: new Date().toISOString(),
    };
    mutate((s) => {
      s.legalNotes.push(note);
      audit(s, {
        estateId: access.estate.id,
        userId: req.user.id,
        action: 'counsel_note',
        detail: privileged ? 'Privileged note added' : 'Note added',
      });
    });
    res.status(201).json({ note: { ...note, authorName: req.user.name } });
  });

  app.post('/api/estates/:id/counsel/actions', authRequired, (req, res) => {
    const store = readStore();
    const access = accessFn(store, req.user.id, req.params.id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    if (access.role !== 'counsel' && access.role !== 'owner') {
      return res.status(403).json({ error: 'Only counsel/owner can add legal actions' });
    }
    const title = (req.body?.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Title required' });
    const action = {
      id: uuid(),
      estateId: access.estate.id,
      engagementId: req.body?.engagementId || null,
      title,
      pathwayId: req.body?.pathwayId || null,
      status: 'todo',
      createdBy: req.user.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mutate((s) => {
      s.legalActions.push(action);
      audit(s, {
        estateId: access.estate.id,
        userId: req.user.id,
        action: 'legal_action_added',
        detail: title,
      });
    });
    res.status(201).json({ action });
  });

  app.patch('/api/estates/:id/counsel/actions/:actionId', authRequired, (req, res) => {
    const store = readStore();
    const access = accessFn(store, req.user.id, req.params.id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    const action = mutate((s) => {
      const row = s.legalActions.find(
        (a) => a.id === req.params.actionId && a.estateId === req.params.id
      );
      if (!row) return null;
      if (req.body?.status) row.status = req.body.status;
      if (req.body?.title) row.title = req.body.title;
      row.updatedAt = new Date().toISOString();
      return row;
    });
    if (!action) return res.status(404).json({ error: 'Action not found' });
    res.json({ action });
  });

  app.patch('/api/estates/:id/counsel/needs/:needId', authRequired, (req, res) => {
    const store = readStore();
    const access = accessFn(store, req.user.id, req.params.id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    const need = mutate((s) => {
      const row = s.counselNeeds.find(
        (n) => n.id === req.params.needId && n.estateId === req.params.id
      );
      if (!row) return null;
      if (req.body?.status) row.status = req.body.status;
      row.updatedAt = new Date().toISOString();
      return row;
    });
    if (!need) return res.status(404).json({ error: 'Need not found' });
    res.json({ need });
  });
}

export { publicLawyer };
