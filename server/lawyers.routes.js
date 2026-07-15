import { mutate, readStore, audit } from './db.js';
import { authRequired } from './auth.js';
import {
  analyzeLegalPathways,
  buildCounselBrief,
  purgeDemoCounsel,
} from './lawyers.js';
import {
  userHasCounselPro,
  MAX_OPEN_APPROACHES_PER_LAWYER,
  DEFAULT_MAX_APPROACHES_PER_LISTING,
} from './plans.js';
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
  const ratingCount = Number(lawyer.ratingCount) || 0;
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
    rating: ratingCount > 0 ? lawyer.rating : null,
    ratingCount,
    mattersCompleted: lawyer.mattersCompleted || 0,
    nriFriendly: !!lawyer.nriFriendly,
    verified: !!lawyer.verified,
    acceptingMatters: lawyer.acceptingMatters !== false,
    verificationRequestedAt: lawyer.verificationRequestedAt || null,
  };
}

function recomputeLawyerRating(s, lawyerId) {
  const lawyer = s.lawyers.find((l) => l.id === lawyerId);
  if (!lawyer) return null;
  const ratings = (s.engagements || [])
    .filter((e) => e.lawyerId === lawyerId && Number(e.familyRating) >= 1)
    .map((e) => Number(e.familyRating));
  lawyer.ratingCount = ratings.length;
  lawyer.rating = ratings.length
    ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
    : null;
  return lawyer;
}

function applyFamilyRating(s, row, { rating, review, actorId }) {
  const value = Number(rating);
  if (!Number.isFinite(value) || value < 1 || value > 5) {
    const err = new Error('Rating must be 1–5 stars');
    err.status = 400;
    throw err;
  }
  if (row.familyRating) {
    const err = new Error('This matter was already rated');
    err.status = 409;
    throw err;
  }
  row.familyRating = Math.round(value);
  row.familyReview = String(review || '')
    .trim()
    .slice(0, 500);
  row.ratedAt = new Date().toISOString();
  row.ratedBy = actorId;
  pushTimeline(row, {
    type: 'rated',
    actorId,
    detail: `Family rated ${row.familyRating}/5${row.familyReview ? ` — ${row.familyReview.slice(0, 80)}` : ''}`,
  });
  recomputeLawyerRating(s, row.lawyerId);
  return row;
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
    exclusive: !!listing.exclusive,
    maxApproaches: listing.maxApproaches || DEFAULT_MAX_APPROACHES_PER_LISTING,
    showContact: !!listing.showContact,
    estateStatus: estate?.status || null,
    subjectName: estate?.subjectName || null,
    familyLead: owner
      ? { name: owner.name, email: listing.showContact ? owner.email : undefined }
      : null,
    updatedAt: listing.updatedAt,
    createdAt: listing.createdAt,
  };
}

function leadMatchScore(listing, profile) {
  let score = 0;
  const urgencyPts = { critical: 30, high: 18, normal: 8 };
  score += urgencyPts[listing.urgency] || 8;

  const specs = new Set((profile?.specialties || []).map((s) => String(s).toLowerCase()));
  const scopes = listing.scopes || [];
  const overlap = scopes.filter((s) => specs.has(String(s).toLowerCase()));
  score += overlap.length * 12;
  if (scopes.length && overlap.length === 0) score -= 4;

  const city = String(listing.city || '').toLowerCase();
  const cityHit = (profile?.cities || []).some((c) => {
    const cc = String(c).toLowerCase();
    return city.includes(cc) || cc.includes(city);
  });
  if (cityHit) score += 15;

  if (profile?.verified) score += 5;
  if (listing.exclusive) score += 3;
  return score;
}

function countOpenApproachesOnListing(store, listingId, estateId) {
  return (store.engagements || []).filter(
    (e) =>
      (e.listingId === listingId || e.estateId === estateId) &&
      e.initiatedBy === 'lawyer' &&
      e.status === 'approached'
  ).length;
}

function pushTimeline(row, event) {
  if (!row.timeline) row.timeline = [];
  row.timeline.push({
    id: uuid(),
    at: new Date().toISOString(),
    ...event,
  });
  if (row.timeline.length > 200) row.timeline = row.timeline.slice(-160);
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

  // Seed actions only if this engagement has none yet
  const hasActions = (s.legalActions || []).some((a) => a.engagementId === row.id);
  if (!hasActions) {
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
  }

  const hasNeeds = (s.counselNeeds || []).some((n) => n.engagementId === row.id);
  if (!hasNeeds) {
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
        files: [],
        createdBy: actorUserId,
        createdAt: new Date().toISOString(),
      });
    }
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
  row.briefGeneratedAt = new Date().toISOString();

  pushTimeline(row, {
    type: 'accepted',
    actorId: actorUserId,
    detail: 'Matter activated — brief and starter checklist generated',
  });

  return { engagement: row, pathway, brief: row.counselBrief, lawyer };
}

function rebuildCounselBrief(s, engagementId) {
  const row = s.engagements.find((e) => e.id === engagementId);
  if (!row) return null;
  const estate = s.estates.find((e) => e.id === row.estateId);
  if (!estate) return null;
  const items = s.items.filter((i) => i.estateId === estate.id);
  const tasks = s.tasks.filter((t) => t.estateId === estate.id);
  const pathway = analyzeLegalPathways(estate, items);
  row.pathwaySnapshot = pathway;
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
  row.briefGeneratedAt = new Date().toISOString();
  row.updatedAt = row.briefGeneratedAt;
  return { engagement: row, pathway, brief: row.counselBrief };
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

export function registerLawyerRoutes(app, { canAccessEstate, upload, saveUpload }) {
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
      const ra = (a.ratingCount || 0) > 0 ? a.rating : 0;
      const rb = (b.ratingCount || 0) > 0 ? b.rating : 0;
      if (rb !== ra) return rb - ra;
      return (b.mattersCompleted || 0) - (a.mattersCompleted || 0);
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
    const counselPro = userHasCounselPro(req.user);
    res.json({
      lawyer: profile ? selfLawyer(profile, req.user) : null,
      engagements: enriched,
      leadsUnlocked: counselPro,
      plan: req.user.plan || 'free',
      planExpiresAt: req.user.planExpiresAt || null,
      specialtyOptions: SPECIALTY_OPTIONS,
      approachLimits: {
        maxOpenApproaches: MAX_OPEN_APPROACHES_PER_LAWYER,
        openApproaches: mine.filter((e) => e.status === 'approached').length,
      },
      stats: {
        requested: enriched.filter((e) => e.status === 'requested' || e.status === 'approached').length,
        active: enriched.filter((e) => ['engaged', 'active'].includes(e.status)).length,
        closed: enriched.filter((e) => e.status === 'closed').length,
      },
    });
  });

  /** Counsel Pro only — families who opted into city discovery */
  app.get('/api/counsel/leads', authRequired, (req, res) => {
    const store = readStore();
    const profile = store.lawyers.find((l) => l.userId === req.user.id);
    if (!profile && req.user.accountType !== 'lawyer') {
      return res.status(403).json({ error: 'Counsel leads are for lawyer accounts' });
    }
    if (!userHasCounselPro(req.user)) {
      return res.status(402).json({
        error: 'Upgrade to Counsel Pro (₹1,499/yr) to see families looking for counsel in your cities',
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
        const openApproaches = countOpenApproachesOnListing(store, listing.id, listing.estateId);
        const maxApproaches = listing.maxApproaches || DEFAULT_MAX_APPROACHES_PER_LISTING;
        const exclusiveBlocked = !!listing.exclusive && openApproaches >= 1 && !already;
        const capped = openApproaches >= maxApproaches && !already;
        const matchScore = leadMatchScore(listing, profile);
        const specialtyOverlap = (listing.scopes || []).filter((s) =>
          (profile?.specialties || []).some((p) => String(p).toLowerCase() === String(s).toLowerCase())
        );
        return {
          ...publicListing(listing, estate, owner),
          alreadyApproached: !!already,
          engagementStatus: already?.status || null,
          matchScore,
          specialtyOverlap,
          openApproaches,
          approachSlotsLeft: Math.max(0, maxApproaches - openApproaches),
          canApproach: !already && !exclusiveBlocked && !capped,
          approachBlockedReason: already
            ? null
            : exclusiveBlocked
              ? 'Exclusive listing — another counsel already approached'
              : capped
                ? `Approach cap reached (${maxApproaches})`
                : null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
      });

    res.json({
      leadsUnlocked: true,
      leads,
      lawyerCities: profile?.cities || [],
      approachLimits: {
        maxOpenApproaches: MAX_OPEN_APPROACHES_PER_LAWYER,
        openApproaches: (store.engagements || []).filter(
          (e) => e.lawyerUserId === req.user.id && e.status === 'approached'
        ).length,
      },
    });
  });

  app.post('/api/counsel/leads/:listingId/approach', authRequired, async (req, res) => {
    const store = readStore();
    const profile = store.lawyers.find((l) => l.userId === req.user.id);
    if (!profile) return res.status(403).json({ error: 'Counsel profile required' });
    if (!userHasCounselPro(req.user)) {
      return res.status(402).json({
        error: 'Upgrade to Counsel Pro (₹1,499/yr) to approach families',
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

    const lawyerOpenApproaches = (store.engagements || []).filter(
      (e) => e.lawyerUserId === req.user.id && e.status === 'approached'
    ).length;
    if (lawyerOpenApproaches >= MAX_OPEN_APPROACHES_PER_LAWYER) {
      return res.status(429).json({
        error: `You have ${MAX_OPEN_APPROACHES_PER_LAWYER} open approaches waiting on families. Wait for a response or close old ones before approaching more.`,
      });
    }

    const openOnListing = countOpenApproachesOnListing(store, listing.id, listing.estateId);
    const maxApproaches = listing.maxApproaches || DEFAULT_MAX_APPROACHES_PER_LISTING;
    if (listing.exclusive && openOnListing >= 1) {
      return res.status(409).json({
        error: 'This family listed exclusively — another counsel already approached',
      });
    }
    if (openOnListing >= maxApproaches) {
      return res.status(409).json({
        error: `This listing already has ${maxApproaches} open approaches`,
      });
    }

    const message = (req.body?.message || '').trim();
    const feeNote = String(req.body?.feeNote || req.body?.retainerNote || '')
      .trim()
      .slice(0, 280);
    if (!feeNote && (!profile.retainerBand || /on request/i.test(profile.retainerBand))) {
      return res.status(400).json({
        error: 'Add a fee / retainer note (or set retainer band on your profile) before approaching',
      });
    }
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
      lawyerFeeNote: feeNote || profile.retainerBand || '',
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
      pitch: [message, engagement.lawyerFeeNote ? `Fee/retainer: ${engagement.lawyerFeeNote}` : '']
        .filter(Boolean)
        .join('\n\n'),
    });

    res.status(201).json({
      engagement,
      lawyer: publicLawyer(profile),
      familyContact: listing.showContact && owner ? { name: owner.name, email: owner.email } : null,
      matchScore: leadMatchScore(listing, profile),
    });
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
    const exclusive = !!req.body?.exclusive;
    let maxApproaches = Number(req.body?.maxApproaches);
    if (!Number.isFinite(maxApproaches) || maxApproaches < 1) {
      maxApproaches = exclusive ? 1 : DEFAULT_MAX_APPROACHES_PER_LISTING;
    }
    maxApproaches = Math.min(20, Math.max(1, Math.round(maxApproaches)));
    if (exclusive) maxApproaches = 1;

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
          exclusive,
          maxApproaches,
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
        row.exclusive = exclusive;
        row.maxApproaches = maxApproaches;
        row.status = published ? 'open' : 'paused';
        row.updatedAt = now;
        row.publishedByUserId = req.user.id;
      }
      audit(s, {
        estateId: access.estate.id,
        userId: req.user.id,
        action: published ? 'counsel_listing_published' : 'counsel_listing_paused',
        detail: `${row.city} · ${row.status}${row.exclusive ? ' · exclusive' : ''}`,
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
      const activated = activateEngagement(s, row, req.user.id);
      audit(s, {
        estateId: row.estateId,
        userId: req.user.id,
        action: 'counsel_accepted',
        detail: `${activated.lawyer?.name || 'Counsel'} accepted matter — brief generated`,
      });
      return activated;
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
    if (eng.status === 'closed') {
      return res.status(400).json({ error: 'Matter already closed' });
    }
    if (!['active'].includes(eng.status)) {
      return res.status(400).json({ error: 'Only active matters can be closed' });
    }
    const isCounsel = eng.lawyerUserId === req.user.id;
    const access = accessFn(store, req.user.id, eng.estateId);
    const isFamilyCloser = access.ok && access.role === 'owner';
    if (!isCounsel && !isFamilyCloser) {
      return res.status(403).json({ error: 'Only counsel or owner can close' });
    }

    let ratingError = null;
    const result = mutate((s) => {
      const row = s.engagements.find((e) => e.id === eng.id);
      row.status = 'closed';
      row.closedAt = new Date().toISOString();
      row.updatedAt = row.closedAt;
      row.closedBy = req.user.id;
      pushTimeline(row, {
        type: 'closed',
        actorId: req.user.id,
        detail: 'Matter closed',
      });
      const lawyer = s.lawyers.find((l) => l.id === row.lawyerId);
      if (lawyer && !row.closedCounted) {
        lawyer.mattersCompleted = (lawyer.mattersCompleted || 0) + 1;
        row.closedCounted = true;
      }

      if (isFamilyCloser && req.body?.rating != null && req.body?.rating !== '') {
        try {
          applyFamilyRating(s, row, {
            rating: req.body.rating,
            review: req.body.review,
            actorId: req.user.id,
          });
        } catch (err) {
          ratingError = err;
        }
      }

      audit(s, {
        estateId: row.estateId,
        userId: req.user.id,
        action: 'counsel_closed',
        detail: row.familyRating
          ? `Matter closed · rated ${row.familyRating}/5`
          : 'Matter closed',
      });
      return {
        engagement: row,
        lawyer: lawyer ? publicLawyer(lawyer) : null,
      };
    });

    if (ratingError && !result.engagement.familyRating) {
      // Matter still closed; surface rating issue separately
      return res.json({
        ok: true,
        closed: true,
        ratingError: ratingError.message,
        engagement: result.engagement,
        lawyer: result.lawyer,
      });
    }

    res.json({ ok: true, closed: true, engagement: result.engagement, lawyer: result.lawyer });
  });

  app.post('/api/counsel/engagements/:engagementId/rate', authRequired, (req, res) => {
    const store = readStore();
    const eng = store.engagements.find((e) => e.id === req.params.engagementId);
    if (!eng) return res.status(404).json({ error: 'Engagement not found' });
    if (eng.status !== 'closed') {
      return res.status(400).json({ error: 'Rate after the matter is closed' });
    }
    const access = accessFn(store, req.user.id, eng.estateId);
    if (!access.ok || access.role !== 'owner') {
      return res.status(403).json({ error: 'Only the estate owner can rate counsel' });
    }

    try {
      const updated = mutate((s) => {
        const row = s.engagements.find((e) => e.id === eng.id);
        applyFamilyRating(s, row, {
          rating: req.body?.rating,
          review: req.body?.review,
          actorId: req.user.id,
        });
        const lawyer = s.lawyers.find((l) => l.id === row.lawyerId);
        audit(s, {
          estateId: row.estateId,
          userId: req.user.id,
          action: 'counsel_rated',
          detail: `${row.familyRating}/5`,
        });
        return { engagement: row, lawyer: lawyer ? publicLawyer(lawyer) : null };
      });
      res.json({ ok: true, ...updated });
    } catch (err) {
      res.status(err.status || 400).json({ error: err.message || 'Rating failed' });
    }
  });

  app.get('/api/estates/:id/counsel', authRequired, (req, res) => {
    mutate((s) => {
      for (const e of s.engagements || []) {
        if (e.estateId === req.params.id && e.status === 'engaged') {
          e.status = 'active';
        }
      }
    });
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
      ['active', 'requested', 'approached'].includes(e.status)
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
    const needs = store.counselNeeds
      .filter((n) => n.estateId === access.estate.id)
      .map((n) => ({ ...n, files: n.files || [] }));
    const listing = (store.counselListings || []).find((l) => l.estateId === access.estate.id) || null;
    const timeline = (active?.timeline || [])
      .slice()
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .slice(0, 40)
      .map((ev) => {
        const actor = store.users.find((u) => u.id === ev.actorId);
        return { ...ev, actorName: actor?.name || null };
      });

    res.json({
      role: access.role,
      pathway,
      engagements,
      activeEngagementId: engagementId || null,
      listing,
      timeline,
      briefGeneratedAt: active?.briefGeneratedAt || null,
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
      .filter((e) => e.estateId === access.estate.id && e.counselBrief && ['active', 'closed'].includes(e.status))
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
      generatedAt: eng.briefGeneratedAt || eng.acceptedAt || null,
    });
  });

  app.post('/api/estates/:id/counsel/brief/regenerate', authRequired, (req, res) => {
    const store = readStore();
    const access = accessFn(store, req.user.id, req.params.id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    if (!['owner', 'manager', 'counsel'].includes(access.role)) {
      return res.status(403).json({ error: 'Cannot regenerate brief' });
    }
    const eng = store.engagements.find(
      (e) =>
        e.estateId === access.estate.id &&
        e.status === 'active' &&
        (access.role !== 'counsel' || e.lawyerUserId === req.user.id)
    );
    if (!eng) return res.status(404).json({ error: 'No active matter to regenerate brief for' });

    const result = mutate((s) => {
      const rebuilt = rebuildCounselBrief(s, eng.id);
      if (!rebuilt) return null;
      pushTimeline(rebuilt.engagement, {
        type: 'brief_regenerated',
        actorId: req.user.id,
        detail: 'Counsel brief regenerated from current Life Map',
      });
      audit(s, {
        estateId: access.estate.id,
        userId: req.user.id,
        action: 'counsel_brief_regenerated',
        detail: eng.id,
      });
      return rebuilt;
    });
    if (!result) return res.status(404).json({ error: 'Engagement not found' });
    res.json({
      ok: true,
      briefGeneratedAt: result.engagement.briefGeneratedAt,
      pathway: result.pathway,
      preview: String(result.brief || '').slice(0, 400),
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
    const engagementId =
      req.body?.engagementId ||
      store.engagements.find((e) => e.estateId === access.estate.id && e.status === 'active')?.id ||
      null;
    const note = {
      id: uuid(),
      estateId: access.estate.id,
      engagementId,
      authorId: req.user.id,
      authorRole: access.role,
      body,
      privileged,
      createdAt: new Date().toISOString(),
    };
    mutate((s) => {
      s.legalNotes.push(note);
      const eng = engagementId ? s.engagements.find((e) => e.id === engagementId) : null;
      if (eng) {
        pushTimeline(eng, {
          type: 'note',
          actorId: req.user.id,
          detail: body.slice(0, 120),
        });
        eng.updatedAt = new Date().toISOString();
      }
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
    const engagementId =
      req.body?.engagementId ||
      store.engagements.find((e) => e.estateId === access.estate.id && e.status === 'active')?.id ||
      null;
    const action = {
      id: uuid(),
      estateId: access.estate.id,
      engagementId,
      title,
      pathwayId: req.body?.pathwayId || null,
      status: 'todo',
      createdBy: req.user.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mutate((s) => {
      s.legalActions.push(action);
      const eng = engagementId ? s.engagements.find((e) => e.id === engagementId) : null;
      if (eng) {
        pushTimeline(eng, {
          type: 'action_added',
          actorId: req.user.id,
          detail: title,
        });
      }
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
      const prev = row.status;
      if (req.body?.status) row.status = req.body.status;
      if (req.body?.title) row.title = req.body.title;
      row.updatedAt = new Date().toISOString();
      if (req.body?.status && req.body.status !== prev && row.engagementId) {
        const eng = s.engagements.find((e) => e.id === row.engagementId);
        if (eng) {
          pushTimeline(eng, {
            type: 'action_status',
            actorId: req.user.id,
            detail: `${row.title} → ${row.status}`,
          });
        }
      }
      return row;
    });
    if (!action) return res.status(404).json({ error: 'Action not found' });
    res.json({ action });
  });

  app.post('/api/estates/:id/counsel/needs', authRequired, (req, res) => {
    const store = readStore();
    const access = accessFn(store, req.user.id, req.params.id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    if (!['counsel', 'owner', 'manager'].includes(access.role)) {
      return res.status(403).json({ error: 'Cannot add counsel needs' });
    }
    const title = String(req.body?.title || '').trim();
    if (!title || title.length < 3) {
      return res.status(400).json({ error: 'Need title required (3+ chars)' });
    }
    const engagementId =
      req.body?.engagementId ||
      store.engagements.find((e) => e.estateId === access.estate.id && e.status === 'active')?.id ||
      null;
    if (!engagementId) return res.status(400).json({ error: 'No active matter' });

    const need = {
      id: uuid(),
      estateId: access.estate.id,
      engagementId,
      title,
      status: 'open',
      files: [],
      createdBy: req.user.id,
      createdAt: new Date().toISOString(),
    };
    mutate((s) => {
      s.counselNeeds.push(need);
      const eng = s.engagements.find((e) => e.id === engagementId);
      if (eng) {
        pushTimeline(eng, {
          type: 'need_added',
          actorId: req.user.id,
          detail: title,
        });
      }
      audit(s, {
        estateId: access.estate.id,
        userId: req.user.id,
        action: 'counsel_need_added',
        detail: title,
      });
    });
    res.status(201).json({ need });
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
      const prev = row.status;
      if (req.body?.status) row.status = req.body.status;
      if (req.body?.title && ['counsel', 'owner'].includes(access.role)) {
        row.title = String(req.body.title).trim() || row.title;
      }
      row.updatedAt = new Date().toISOString();
      if (req.body?.status && req.body.status !== prev && row.engagementId) {
        const eng = s.engagements.find((e) => e.id === row.engagementId);
        if (eng) {
          pushTimeline(eng, {
            type: 'need_status',
            actorId: req.user.id,
            detail: `${row.title} → ${row.status}`,
          });
        }
      }
      return row;
    });
    if (!need) return res.status(404).json({ error: 'Need not found' });
    res.json({ need: { ...need, files: need.files || [] } });
  });

  app.post(
    '/api/estates/:id/counsel/needs/:needId/files',
    authRequired,
    upload.array('files', 5),
    async (req, res) => {
      if (!saveUpload) {
        return res.status(500).json({ error: 'Upload helper not configured' });
      }
      const store = readStore();
      const access = accessFn(store, req.user.id, req.params.id);
      if (!access.ok) return res.status(access.status).json({ error: access.error });
      if (!['owner', 'manager', 'counsel'].includes(access.role)) {
        return res.status(403).json({ error: 'Cannot attach files' });
      }
      const need = store.counselNeeds.find(
        (n) => n.id === req.params.needId && n.estateId === access.estate.id
      );
      if (!need) return res.status(404).json({ error: 'Need not found' });
      if (!req.files?.length) return res.status(400).json({ error: 'Attach at least one file' });

      const savedFiles = [];
      for (const f of req.files) {
        const saved = await saveUpload({
          name: f.originalname,
          mime: f.mimetype,
          buffer: f.buffer,
        });
        savedFiles.push({
          ...saved,
          uploadedAt: new Date().toISOString(),
          uploadedBy: req.user.id,
        });
      }

      const updated = mutate((s) => {
        const row = s.counselNeeds.find((n) => n.id === need.id);
        if (!row) return null;
        if (!row.files) row.files = [];
        row.files.push(...savedFiles);
        if (row.status === 'open') row.status = 'provided';
        row.updatedAt = new Date().toISOString();
        const eng = s.engagements.find((e) => e.id === row.engagementId);
        if (eng) {
          pushTimeline(eng, {
            type: 'need_file',
            actorId: req.user.id,
            detail: `Uploaded ${savedFiles.length} file(s) for: ${row.title}`,
          });
        }
        audit(s, {
          estateId: access.estate.id,
          userId: req.user.id,
          action: 'counsel_need_files',
          detail: `${row.title} · ${savedFiles.length} file(s)`,
        });
        return row;
      });

      res.status(201).json({ need: { ...updated, files: updated.files || [] } });
    }
  );
}

export { publicLawyer };
