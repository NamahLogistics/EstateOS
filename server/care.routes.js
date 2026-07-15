import crypto from 'crypto';
import { mutate, readStore, audit } from './db.js';
import { authRequired } from './auth.js';
import { userHasCareNetwork, CARE_NETWORK_COMING_SOON } from './plans.js';
import { CARE_ROLES } from './checklist.js';

const uuid = () => crypto.randomUUID();

export const CARE_ROLE_IDS = CARE_ROLES.map((r) => r.id);

function publicCareWorker(row, { revealContact = false } = {}) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    role: row.role,
    roleLabel: CARE_ROLES.find((r) => r.id === row.role)?.label || row.role,
    cities: row.cities || [],
    languages: row.languages || [],
    years: row.years ?? 0,
    rateBand: row.rateBand || '',
    shift: row.shift || '',
    bio: row.bio || '',
    verified: !!row.verified,
    acceptingWork: row.acceptingWork !== false,
    phone: revealContact ? row.phone || null : null,
    contactUnlocked: revealContact,
  };
}

function ensureCareArrays(store) {
  if (!store.careWorkers) store.careWorkers = [];
}

export function registerCareRoutes(app) {
  app.get('/api/care/roles', (_req, res) => {
    res.json({ roles: CARE_ROLES });
  });

  /** Aggregate city density — no PII, safe while browse is coming soon (Airbnb seed meter). */
  app.get('/api/care/stats', (req, res) => {
    const store = readStore();
    ensureCareArrays(store);
    const city = String(req.query.city || '').trim();
    const goal = 12;
    let list = (store.careWorkers || []).filter((c) => c.acceptingWork !== false);
    if (city) {
      const needle = city.toLowerCase();
      list = list.filter((c) =>
        (c.cities || []).some((x) => String(x).toLowerCase().includes(needle))
      );
    }
    const listed = list.length;
    const byRole = {};
    for (const w of list) {
      const r = w.role || 'other';
      byRole[r] = (byRole[r] || 0) + 1;
    }
    res.json({
      city: city || null,
      listed,
      goal,
      progress: Math.min(1, listed / goal),
      unlockHint: listed >= goal ? 'density_ready' : 'need_more',
      byRole,
      comingSoon: CARE_NETWORK_COMING_SOON,
    });
  });

  app.get('/api/care/me', authRequired, (req, res) => {
    const store = readStore();
    ensureCareArrays(store);
    const profile = store.careWorkers.find((c) => c.userId === req.user.id);
    if (!profile) return res.status(404).json({ error: 'Not a care worker account' });
    res.json({ worker: publicCareWorker(profile, { revealContact: true }) });
  });

  app.patch('/api/care/me', authRequired, (req, res) => {
    const store = readStore();
    ensureCareArrays(store);
    if (!store.careWorkers.some((c) => c.userId === req.user.id) && req.user.accountType !== 'care') {
      return res.status(403).json({ error: 'Care worker account required' });
    }
    const body = req.body || {};
    const worker = mutate((s) => {
      ensureCareArrays(s);
      let row = s.careWorkers.find((c) => c.userId === req.user.id);
      if (!row) {
        row = {
          id: uuid(),
          userId: req.user.id,
          name: req.user.name,
          role: 'maid',
          cities: [],
          languages: ['Hindi'],
          years: 1,
          rateBand: '',
          shift: '',
          phone: '',
          bio: '',
          verified: false,
          acceptingWork: true,
          createdAt: new Date().toISOString(),
        };
        s.careWorkers.push(row);
        const u = s.users.find((x) => x.id === req.user.id);
        if (u) u.accountType = 'care';
      }
      if (body.name != null) row.name = String(body.name).trim() || row.name;
      if (body.role != null) {
        const role = String(body.role).trim();
        row.role = CARE_ROLE_IDS.includes(role) ? role : row.role;
      }
      if (body.cities != null) {
        const raw = Array.isArray(body.cities) ? body.cities : String(body.cities).split(',');
        row.cities = raw.map((c) => String(c).trim()).filter(Boolean).slice(0, 8);
      }
      if (body.languages != null) {
        const raw = Array.isArray(body.languages)
          ? body.languages
          : String(body.languages).split(',');
        row.languages = raw.map((c) => String(c).trim()).filter(Boolean).slice(0, 8);
      }
      if (body.years != null) row.years = Math.max(0, Number(body.years) || 0);
      if (body.rateBand != null) row.rateBand = String(body.rateBand).trim().slice(0, 80);
      if (body.shift != null) row.shift = String(body.shift).trim().slice(0, 80);
      if (body.phone != null) row.phone = String(body.phone).trim().slice(0, 40);
      if (body.bio != null) row.bio = String(body.bio).trim().slice(0, 800);
      if (body.acceptingWork !== undefined) row.acceptingWork = !!body.acceptingWork;
      row.updatedAt = new Date().toISOString();
      return row;
    });
    res.json({ worker: publicCareWorker(worker, { revealContact: true }) });
  });

  app.get('/api/care/desk', authRequired, (req, res) => {
    const store = readStore();
    ensureCareArrays(store);
    const profile = store.careWorkers.find((c) => c.userId === req.user.id);
    if (!profile && req.user.accountType !== 'care') {
      return res.status(403).json({ error: 'Care worker account required' });
    }
    res.json({
      worker: publicCareWorker(profile, { revealContact: true }),
      plan: req.user.plan || 'free',
      roles: CARE_ROLES,
    });
  });

  /** Families with Care plans — browse by city (paused while coming soon) */
  app.get('/api/care/directory', authRequired, (req, res) => {
    if (CARE_NETWORK_COMING_SOON) {
      return res.status(403).json({
        error: 'City care network is coming soon. Caregivers can still join and list free.',
        code: 'CARE_COMING_SOON',
        careUnlocked: false,
        comingSoon: true,
      });
    }
    if (!userHasCareNetwork(req.user)) {
      return res.status(402).json({
        error: 'City nurses & maids unlock with Family + Care (₹2,998/yr) or Diaspora + Care (₹24,998/yr). Upgrade on Pricing.',
        code: 'PLAN_LIMIT',
        upgradePlan: 'family_care',
        careUnlocked: false,
      });
    }
    const store = readStore();
    ensureCareArrays(store);
    const city = String(req.query.city || '')
      .trim()
      .toLowerCase();
    const role = String(req.query.role || '').trim();
    let list = store.careWorkers.filter((c) => c.acceptingWork !== false);
    if (city) {
      list = list.filter((c) => (c.cities || []).some((x) => String(x).toLowerCase().includes(city)));
    }
    if (role && CARE_ROLE_IDS.includes(role)) {
      list = list.filter((c) => c.role === role);
    }
    list = list.slice(0, 50);
    res.json({
      careUnlocked: true,
      workers: list.map((c) => publicCareWorker(c, { revealContact: true })),
      roles: CARE_ROLES,
    });
  });

  /** Save a directory worker onto estate Life Map as care item */
  app.post('/api/estates/:id/care/save', authRequired, (req, res) => {
    if (CARE_NETWORK_COMING_SOON) {
      return res.status(403).json({
        error: 'City care network is coming soon — saving caregivers isn’t available yet.',
        code: 'CARE_COMING_SOON',
        comingSoon: true,
      });
    }
    if (!userHasCareNetwork(req.user)) {
      return res.status(402).json({
        error: 'Family + Care or Diaspora + Care required to save city caregivers. Upgrade on Pricing.',
        code: 'PLAN_LIMIT',
        upgradePlan: 'family_care',
      });
    }
    const store = readStore();
    const estate = store.estates.find((e) => e.id === req.params.id);
    if (!estate) return res.status(404).json({ error: 'Estate not found' });
    const isOwner = estate.ownerId === req.user.id;
    const member = store.members?.find((m) => m.estateId === estate.id && m.userId === req.user.id);
    if (!isOwner && !['owner', 'manager'].includes(member?.role)) {
      return res.status(403).json({ error: 'Only owner/manager can add care contacts' });
    }
    ensureCareArrays(store);
    const worker = store.careWorkers.find((c) => c.id === req.body?.workerId);
    if (!worker) return res.status(404).json({ error: 'Care worker not found' });
    const roleLabel = CARE_ROLES.find((r) => r.id === worker.role)?.label || worker.role;
    const item = mutate((s) => {
      const row = {
        id: uuid(),
        estateId: estate.id,
        category: 'care',
        title: worker.name,
        institution: roleLabel,
        accountRef: worker.phone || '',
        notes: [
          worker.rateBand && `Rate: ${worker.rateBand}`,
          worker.shift && `Shift: ${worker.shift}`,
          (worker.cities || []).length && `Cities: ${worker.cities.join(', ')}`,
          worker.bio,
          'Added from HeirReady city care',
        ]
          .filter(Boolean)
          .join(' · '),
        shift: worker.shift || null,
        paidBy: null,
        backupContact: null,
        expiresOn: null,
        files: [],
        careWorkerId: worker.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: req.user.id,
      };
      s.items.push(row);
      audit(s, {
        estateId: estate.id,
        userId: req.user.id,
        action: 'care_saved',
        detail: `Saved care network: ${worker.name} (${roleLabel})`,
      });
      return row;
    });
    res.status(201).json({ item });
  });
}
