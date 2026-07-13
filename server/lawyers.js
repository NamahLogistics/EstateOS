import crypto from 'crypto';

const uuid = () => crypto.randomUUID();

/** India succession pathway intelligence — guidance, not legal advice */
export function analyzeLegalPathways(estate, items = []) {
  const pathways = [];
  const hasWillItem = items.some(
    (i) =>
      i.category === 'wishes' &&
      /will|testament|probate/i.test(`${i.title} ${i.notes}`)
  );
  const banks = items.filter((i) => i.category === 'bank');
  const insurance = items.filter((i) => i.category === 'insurance');
  const investments = items.filter((i) => i.category === 'investments');
  const property = items.filter((i) => i.category === 'property');
  const isNriContext = /nri|abroad|usa|uk|canada|dubai|gulf/i.test(
    `${estate.notes || ''} ${estate.subjectRelation || ''}`
  );

  pathways.push({
    id: 'core-strategy',
    title: 'Core estate strategy',
    severity: hasWillItem ? 'high' : 'critical',
    recommendation: hasWillItem
      ? 'Will referenced in vault — evaluate probate vs. nominee-led settlement in parallel.'
      : 'No will flagged in Life Map. Default track: nominee claims where present + succession certificate / legal heir certificate for residual assets.',
    counselActions: [
      'Confirm existence of registered / unregistered will',
      'Map Class I heirs under personal law',
      'Decide probate vs. succession certificate vs. Letter of Administration',
    ],
    statutes: ['Indian Succession Act, 1925', 'Hindu Succession Act, 1956 (if applicable)'],
  });

  if (banks.length) {
    pathways.push({
      id: 'bank-nominee',
      title: `Bank accounts (${banks.length})`,
      severity: 'medium',
      recommendation:
        'Nominee usually receives custody/payment — ownership among heirs may still need settlement. Parallel: bank deceased claim + counsel note on heirship.',
      counselActions: [
        'Collect nominee names from each bank',
        'Issue heirship / NOC letters if banks demand',
        'Freeze disputed accounts if sibling conflict risk',
      ],
      itemIds: banks.map((b) => b.id),
      statutes: ['Banking nominee circulars / RBI guidance'],
    });
  }

  if (insurance.length) {
    pathways.push({
      id: 'insurance',
      title: `Insurance (${insurance.length})`,
      severity: 'medium',
      recommendation:
        'Claim via nominee / assignee under policy terms. Counsel should verify nomination register and contest windows.',
      counselActions: ['File intimation + claim forms', 'Preserve policy bonds as originals'],
      itemIds: insurance.map((i) => i.id),
      statutes: ['Insurance Act nominee provisions'],
    });
  }

  if (investments.length) {
    pathways.push({
      id: 'investments',
      title: `Investments / demat / PF (${investments.length})`,
      severity: 'high',
      recommendation:
        'Demat / MF transmission often needs death certificate + client master + transmission form; PF/EPF has separate nominee rails.',
      counselActions: [
        'Depository participant transmission checklist',
        'EPF/PPF nomination claim track',
        'Capital gains / ITR continuity note for CA',
      ],
      itemIds: investments.map((i) => i.id),
      statutes: ['Depositories Act / SEBI transmission norms'],
    });
  }

  if (property.length) {
    pathways.push({
      id: 'property',
      title: `Immovable property (${property.length})`,
      severity: 'critical',
      recommendation:
        'Highest conflict surface. Mutation, society transfer, and title path before any sale. Avoid informal “family settlement” without stamped deed.',
      counselActions: [
        'Title diligence + encumbrance search',
        'Mutation / society share transfer',
        'Draft family settlement / release if multi-heir',
        'Advise on stamp duty for conveyance',
      ],
      itemIds: property.map((p) => p.id),
      statutes: ['Transfer of Property Act', 'State stamp & registration Acts', 'Society bye-laws'],
    });
  }

  if (isNriContext || estate.country === 'IN') {
    pathways.push({
      id: 'nri-crossborder',
      title: isNriContext ? 'NRI / cross-border family' : 'Diaspora readiness',
      severity: isNriContext ? 'high' : 'low',
      recommendation: isNriContext
        ? 'PoA, apostille/consular docs, FEMA property rules, and dual probate risk if foreign will exists.'
        : 'If any heir lives abroad, pre-stage PoA and document legalisation path.',
      counselActions: [
        'Durable PoA drafting for India counsel',
        'Apostille / embassy attestation plan',
        'FEMA / OCI document checklist',
      ],
      statutes: ['FEMA', 'Notaries / apostille practice'],
    });
  }

  pathways.push({
    id: 'digital-estate',
    title: 'Digital & subscription residue',
    severity: 'low',
    recommendation:
      'Preserve SIM/email for OTP during claims; cancel autopays; treat crypto separately with private-key custody caution.',
    counselActions: ['Provider deceased-user requests', 'Inventory crypto / domain assets if any'],
    statutes: [],
  });

  return {
    generatedAt: new Date().toISOString(),
    riskScore: scoreRisk(pathways),
    summary: summarize(pathways, estate, items),
    pathways,
  };
}

function scoreRisk(pathways) {
  const weights = { critical: 40, high: 25, medium: 12, low: 4 };
  const raw = pathways.reduce((n, p) => n + (weights[p.severity] || 8), 0);
  return Math.min(98, Math.max(12, raw));
}

function summarize(pathways, estate, items) {
  const crit = pathways.filter((p) => p.severity === 'critical').length;
  return `${estate.subjectName}: ${items.length} vault assets mapped. ${crit} critical legal track${crit === 1 ? '' : 's'}. Counsel should open property + heirship first, then run nominee rails in parallel.`;
}

export function buildCounselBrief({
  estate,
  items,
  members,
  tasks,
  unlockRequest,
  engagement,
  pathway,
  familyUser,
  lawyer,
}) {
  const lines = [];
  const today = new Date().toLocaleString('en-IN');
  lines.push('═══════════════════════════════════════════');
  lines.push('ESTATE OS — COUNSEL BRIEF (PRIVILEGED)');
  lines.push('═══════════════════════════════════════════');
  lines.push(`Generated: ${today}`);
  lines.push(`Matter: ${engagement?.matterTitle || estate.subjectName}`);
  lines.push(`Engagement ID: ${engagement?.id || '—'}`);
  lines.push(`Family lead: ${familyUser?.name || '—'} <${familyUser?.email || ''}>`);
  lines.push(`Counsel: ${lawyer?.name || '—'} · ${lawyer?.firm || ''}`);
  lines.push('');
  lines.push('—— SUBJECT ——');
  lines.push(`Name: ${estate.subjectName}`);
  lines.push(`Relation context: ${estate.subjectRelation || '—'}`);
  lines.push(`Country pack: ${estate.country || 'IN'}`);
  lines.push(`Estate status: ${estate.status}`);
  lines.push(`Notes: ${estate.notes || '—'}`);
  lines.push('');
  lines.push('—— UNLOCK / PROOF ——');
  if (unlockRequest) {
    lines.push(`Proof type: ${unlockRequest.proofType}`);
    lines.push(`Approved at: ${unlockRequest.createdAt}`);
    lines.push(`Proof file: ${unlockRequest.proofPath || 'on file'}`);
  } else {
    lines.push('Estate still locked — counsel engaged pre-event (readiness advisory).');
  }
  lines.push('');
  lines.push('—— SCOPE OF ENGAGEMENT ——');
  lines.push(`Scopes: ${(engagement?.scopes || []).join(', ') || 'general succession'}`);
  lines.push(`Urgency: ${engagement?.urgency || 'normal'}`);
  lines.push(`Family brief: ${engagement?.familyBrief || '—'}`);
  lines.push('');
  lines.push('—— LEGAL PATHWAY SNAPSHOT ——');
  lines.push(`Risk score: ${pathway?.riskScore ?? '—'}/100`);
  lines.push(pathway?.summary || '');
  for (const p of pathway?.pathways || []) {
    lines.push('');
    lines.push(`[${String(p.severity).toUpperCase()}] ${p.title}`);
    lines.push(`  ${p.recommendation}`);
    for (const a of p.counselActions || []) lines.push(`  • ${a}`);
  }
  lines.push('');
  lines.push('—— LIFE MAP INVENTORY ——');
  for (const item of items) {
    lines.push(
      `• [${item.category}] ${item.title} | ${item.institution || '—'} | ref ${item.accountRef || '—'}`
    );
    if (item.notes) lines.push(`    note: ${item.notes}`);
  }
  lines.push('');
  lines.push('—— FAMILY ACCESS ——');
  for (const m of members || []) {
    lines.push(`• ${m.name || m.email} (${m.role})`);
  }
  lines.push('');
  lines.push('—— EXECUTION TASKS ——');
  if (!tasks?.length) lines.push('(none — estate locked or empty)');
  for (const t of tasks || []) {
    lines.push(`• [${t.status}] ${t.title}`);
  }
  lines.push('');
  lines.push('—— COUNSEL OPERATING RULES ——');
  lines.push('1. Privileged notes in HeirReady are for matter coordination only.');
  lines.push('2. This brief is not a substitute for independent legal advice or court filings.');
  lines.push('3. Originals stay with family unless counsel issues a receipted custody list.');
  lines.push('4. Conflict check must be confirmed before appearing on record.');
  lines.push('');
  lines.push('—— END OF BRIEF ——');
  return lines.join('\n');
}

/** Demo counsel removed — real lawyers register themselves. */
export const SEED_LAWYERS = [];

const DEMO_COUNSEL_EMAIL_SUFFIX = '@estateos.dev';

export function isDemoCounselEmail(email) {
  return String(email || '')
    .toLowerCase()
    .endsWith(DEMO_COUNSEL_EMAIL_SUFFIX);
}

/** Strip seeded demo lawyers (and their matters) from the store. */
export function purgeDemoCounsel(store) {
  if (!store.users) store.users = [];
  if (!store.lawyers) store.lawyers = [];
  if (!store.engagements) store.engagements = [];
  if (!store.legalNotes) store.legalNotes = [];
  if (!store.legalActions) store.legalActions = [];
  if (!store.counselNeeds) store.counselNeeds = [];

  const demoUserIds = new Set(
    store.users.filter((u) => isDemoCounselEmail(u.email)).map((u) => u.id)
  );
  const demoLawyerIds = new Set(
    store.lawyers
      .filter(
        (l) =>
          demoUserIds.has(l.userId) ||
          isDemoCounselEmail(l.email) ||
          /mehta-succession|rao-property|banerjee-nri|khan-claims/.test(l.slug || '')
      )
      .map((l) => l.id)
  );
  const demoEngagementIds = new Set(
    (store.engagements || [])
      .filter(
        (e) => demoLawyerIds.has(e.lawyerId) || demoUserIds.has(e.lawyerUserId)
      )
      .map((e) => e.id)
  );

  store.engagements = store.engagements.filter((e) => !demoEngagementIds.has(e.id));
  store.legalNotes = store.legalNotes.filter(
    (n) => !demoEngagementIds.has(n.engagementId) && !demoUserIds.has(n.authorId)
  );
  store.legalActions = store.legalActions.filter(
    (a) => !demoEngagementIds.has(a.engagementId) && !demoUserIds.has(a.createdBy)
  );
  store.counselNeeds = store.counselNeeds.filter(
    (n) => !demoEngagementIds.has(n.engagementId) && !demoUserIds.has(n.createdBy)
  );
  store.lawyers = store.lawyers.filter((l) => !demoLawyerIds.has(l.id));
  store.users = store.users.filter((u) => !demoUserIds.has(u.id));
  return {
    removedUsers: demoUserIds.size,
    removedLawyers: demoLawyerIds.size,
    removedEngagements: demoEngagementIds.size,
  };
}

export function ensureLawyerSeed(store) {
  if (!store.lawyers) store.lawyers = [];
  if (!store.engagements) store.engagements = [];
  if (!store.legalNotes) store.legalNotes = [];
  if (!store.legalActions) store.legalActions = [];
  if (!store.counselNeeds) store.counselNeeds = [];
  if (!store.counselListings) store.counselListings = [];
  return purgeDemoCounsel(store);
}

export { uuid as lawyerUuid };
