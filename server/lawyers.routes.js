import { mutate, readStore, audit } from './db.js';
import { authRequired, hashPassword } from './auth.js';
import {
  analyzeLegalPathways,
  buildCounselBrief,
  ensureLawyerSeed,
  SEED_LAWYERS,
} from './lawyers.js';
import crypto from 'crypto';

const uuid = () => crypto.randomUUID();

export async function seedLawyersIfNeeded() {
  const store = readStore();
  const missing = SEED_LAWYERS.some((s) => !store.lawyers?.some((l) => l.slug === s.slug));
  const needsHash = store.users.some(
    (u) => SEED_LAWYERS.some((s) => s.email === u.email) && !u.passwordHash
  );
  if (!missing && !needsHash && store.lawyers?.length) {
    // still ensure password for seed lawyers
    let changed = false;
    for (const seed of SEED_LAWYERS) {
      const u = store.users.find((x) => x.email === seed.email);
      if (u && !u.passwordHash) {
        u.passwordHash = await hashPassword('counsel12');
        changed = true;
      }
    }
    if (changed) {
      mutate((s) => {
        for (const seed of SEED_LAWYERS) {
          const u = s.users.find((x) => x.email === seed.email);
          if (u && !u.passwordHash) {
            /* filled below */
          }
        }
      });
    }
  }

  const passwordHash = await hashPassword('counsel12');
  mutate((s) => {
    ensureLawyerSeed(s, { passwordHash });
    for (const seed of SEED_LAWYERS) {
      const u = s.users.find((x) => x.email === seed.email);
      if (u && !u.passwordHash) u.passwordHash = passwordHash;
      if (u) u.accountType = 'lawyer';
      const law = s.lawyers.find((l) => l.slug === seed.slug);
      if (law && u) law.userId = u.id;
    }
  });
}

function publicLawyer(lawyer) {
  return {
    id: lawyer.id,
    slug: lawyer.slug,
    name: lawyer.name,
    firm: lawyer.firm,
    cities: lawyer.cities,
    specialties: lawyer.specialties,
    languages: lawyer.languages,
    barId: lawyer.barId,
    years: lawyer.years,
    retainerBand: lawyer.retainerBand,
    slaHours: lawyer.slaHours,
    bio: lawyer.bio,
    rating: lawyer.rating,
    mattersCompleted: lawyer.mattersCompleted,
    nriFriendly: lawyer.nriFriendly,
    verified: lawyer.verified,
    acceptingMatters: lawyer.acceptingMatters,
  };
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
    list.sort((a, b) => b.rating - a.rating);
    res.json({ lawyers: list.map(publicLawyer) });
  });

  app.get('/api/lawyers/me', authRequired, (req, res) => {
    const store = readStore();
    const profile = store.lawyers.find((l) => l.userId === req.user.id);
    if (!profile) return res.status(404).json({ error: 'Not a counsel account' });
    res.json({ lawyer: publicLawyer(profile) });
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
    res.json({
      lawyer: profile ? publicLawyer(profile) : null,
      engagements: enriched,
      stats: {
        requested: enriched.filter((e) => e.status === 'requested').length,
        active: enriched.filter((e) => ['engaged', 'active'].includes(e.status)).length,
        closed: enriched.filter((e) => e.status === 'closed').length,
      },
    });
  });

  app.post('/api/estates/:id/counsel/engage', authRequired, (req, res) => {
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

    res.status(201).json({ engagement, lawyer: publicLawyer(lawyer) });
  });

  app.post('/api/counsel/engagements/:engagementId/accept', authRequired, (req, res) => {
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

    res.json(result);
  });

  app.post('/api/counsel/engagements/:engagementId/decline', authRequired, (req, res) => {
    const reason = (req.body?.reason || '').trim() || 'Declined';
    const store = readStore();
    const eng = store.engagements.find((e) => e.id === req.params.engagementId);
    if (!eng) return res.status(404).json({ error: 'Engagement not found' });
    if (eng.lawyerUserId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
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

    const active = engagements.find((e) => ['engaged', 'active', 'requested'].includes(e.status));
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

    res.json({
      role: access.role,
      pathway,
      engagements,
      activeEngagementId: engagementId || null,
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

  // Instant demo: engage + auto-accept Mehta for testing god-flow in one click
  app.post('/api/estates/:id/counsel/demo-retain', authRequired, async (req, res) => {
    const store = readStore();
    const access = accessFn(store, req.user.id, req.params.id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    if (!['owner', 'manager'].includes(access.role)) {
      return res.status(403).json({ error: 'Owner/manager only' });
    }
    await seedLawyersIfNeeded();
    const fresh = readStore();
    const lawyer =
      fresh.lawyers.find((l) => l.slug === 'mehta-succession') || fresh.lawyers[0];
    if (!lawyer) return res.status(500).json({ error: 'No counsel seeded' });

    const engagement = {
      id: uuid(),
      estateId: access.estate.id,
      lawyerId: lawyer.id,
      lawyerUserId: lawyer.userId,
      familyUserId: req.user.id,
      matterTitle: `${access.estate.subjectName} — succession matter`,
      scopes: ['succession', 'property', 'nri'],
      familyBrief:
        req.body?.familyBrief ||
        'Demo retain: please take over pathway, brief, and legal action board.',
      urgency: 'high',
      status: 'requested',
      conflictAck: true,
      conflictClearedByLawyer: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      acceptedAt: null,
      closedAt: null,
    };

    mutate((s) => {
      s.engagements = s.engagements.filter(
        (e) =>
          !(
            e.estateId === access.estate.id &&
            e.lawyerId === lawyer.id &&
            e.status === 'requested'
          )
      );
      s.engagements.push(engagement);
    });

    // Accept as lawyer internally
    req.params.engagementId = engagement.id;
    // reuse accept logic via direct call simulation
    const acceptStore = readStore();
    const eng = acceptStore.engagements.find((e) => e.id === engagement.id);
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
      for (const p of pathway.pathways.filter((x) => ['critical', 'high'].includes(x.severity))) {
        for (const action of p.counselActions.slice(0, 2)) {
          s.legalActions.push({
            id: uuid(),
            estateId: estate.id,
            engagementId: row.id,
            title: action,
            pathwayId: p.id,
            status: 'todo',
            createdBy: lawyer.userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }
      for (const title of [
        'Death certificate / incapacity proof (certified copies)',
        'ID + address proof of all Class I heirs',
        'Any will / nomination forms / property title copies',
      ]) {
        s.counselNeeds.push({
          id: uuid(),
          estateId: estate.id,
          engagementId: row.id,
          title,
          status: 'open',
          createdBy: lawyer.userId,
          createdAt: new Date().toISOString(),
        });
      }
      const members = [
        {
          role: 'owner',
          name: s.users.find((u) => u.id === estate.ownerId)?.name,
          email: s.users.find((u) => u.id === estate.ownerId)?.email,
        },
      ];
      const unlockRequest = s.unlockRequests
        .filter((r) => r.estateId === estate.id && r.status === 'approved')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      row.counselBrief = buildCounselBrief({
        estate,
        items,
        members,
        tasks,
        unlockRequest,
        engagement: row,
        pathway,
        familyUser: s.users.find((u) => u.id === row.familyUserId),
        lawyer,
      });
      audit(s, {
        estateId: estate.id,
        userId: req.user.id,
        action: 'counsel_demo_retained',
        detail: `${lawyer.name} retained (demo) — brief + pathway live`,
      });
      return { engagement: row, lawyer: publicLawyer(lawyer), pathway };
    });

    res.status(201).json(result);
  });
}

export { publicLawyer, analyzeLegalPathways };
