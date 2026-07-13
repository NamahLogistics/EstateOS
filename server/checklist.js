import crypto from 'crypto';

export const ITEM_CATEGORIES = [
  { id: 'bank', label: 'Bank accounts', icon: 'bank' },
  { id: 'insurance', label: 'Insurance', icon: 'shield' },
  { id: 'investments', label: 'Investments / demat / PF', icon: 'chart' },
  { id: 'property', label: 'Property & papers', icon: 'home' },
  { id: 'digital', label: 'Phone, email, digital', icon: 'device' },
  { id: 'subscriptions', label: 'Subscriptions', icon: 'repeat' },
  { id: 'care', label: 'Care at home', icon: 'care' },
  { id: 'contacts', label: 'Key contacts', icon: 'people' },
  { id: 'wishes', label: 'Wishes & notes', icon: 'heart' },
];

/** Roles for category=care (institution field stores the role label) */
export const CARE_ROLES = [
  { id: 'nurse', label: 'Nurse' },
  { id: 'attendant', label: 'Attendant / ayah' },
  { id: 'maid', label: 'Maid / domestic help' },
  { id: 'cook', label: 'Cook' },
  { id: 'driver', label: 'Driver' },
  { id: 'other', label: 'Other caregiver' },
];

/** India-first execution checklist generated when an estate unlocks */
export function buildIndiaExecutionTasks(estate, items) {
  const tasks = [];
  const push = (task) =>
    tasks.push({
      id: crypto.randomUUID(),
      estateId: estate.id,
      status: 'todo',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: '',
      ...task,
    });

  push({
    priority: 1,
    category: 'immediate',
    title: 'Secure death / incapacity proof',
    detail:
      'Collect death certificate (municipal / hospital) or doctor incapacity letter. Keep 10+ certified copies.',
    documents: ['Death certificate / incapacity letter', 'Your government ID'],
    letterKey: null,
  });

  push({
    priority: 2,
    category: 'immediate',
    title: 'Notify immediate family & key contacts',
    detail: 'Use the contacts listed in the Life Map. Log who was informed.',
    documents: [],
    letterKey: null,
  });

  const caregivers = items.filter((i) => i.category === 'care');
  if (caregivers.length) {
    push({
      priority: 3,
      category: 'immediate',
      title: 'Confirm home care coverage',
      detail:
        'Call nurse / attendant / maid listed in Care at home. Confirm who stays overnight, who has house keys, and who is paid this week. Do not leave the home empty if the parent needs continuous care.',
      documents: ['Caregiver phone numbers from Life Map'],
      letterKey: null,
    });
    for (const care of caregivers) {
      const phone = care.accountRef ? ` Phone: ${care.accountRef}.` : '';
      const shift = care.shift ? ` Shift: ${care.shift}.` : '';
      const paid = care.paidBy ? ` Paid by: ${care.paidBy}.` : '';
      const backup = care.backupContact ? ` Backup: ${care.backupContact}.` : '';
      push({
        priority: 4,
        category: 'immediate',
        title: `Call caregiver — ${care.title}`,
        detail: `${care.institution || 'Caregiver'}.${phone}${shift}${paid}${backup} ${care.notes || ''}`.trim(),
        documents: [],
        letterKey: null,
        itemId: care.id,
      });
    }
  } else {
    push({
      priority: 3,
      category: 'immediate',
      title: 'Arrange local care / house security',
      detail:
        'If the parent needed help at home, arrange a nurse, attendant, or trusted neighbour now. Add them under Life Map → Care at home for next time. Confirm who has keys.',
      documents: [],
      letterKey: null,
    });
  }

  const banks = items.filter((i) => i.category === 'bank');
  for (const bank of banks) {
    push({
      priority: 10,
      category: 'claims',
      title: `Bank nominee / claim — ${bank.title}`,
      detail: `${bank.institution || 'Bank'}: visit branch or net-banking deceased claim desk with death certificate, your ID, and account proof. Nominee process varies by bank.`,
      documents: ['Death certificate', 'Your ID', 'Passbook / statement photo', 'Nominee form if any'],
      letterKey: 'bank_claim',
      itemId: bank.id,
    });
  }

  const insurance = items.filter((i) => i.category === 'insurance');
  for (const pol of insurance) {
    push({
      priority: 11,
      category: 'claims',
      title: `Insurance claim — ${pol.title}`,
      detail: `${pol.institution || 'Insurer'}: file death / maturity claim. Policy number: ${pol.accountRef || 'see vault item'}.`,
      documents: ['Death certificate', 'Policy bond / photo', 'Your ID', 'Cancelled cheque'],
      letterKey: 'insurance_claim',
      itemId: pol.id,
    });
  }

  const investments = items.filter((i) => i.category === 'investments');
  for (const inv of investments) {
    push({
      priority: 12,
      category: 'claims',
      title: `Investment transfer — ${inv.title}`,
      detail: `${inv.institution || 'Institution'}: transmission / nominee claim for demat, PF, PPF, or mutual funds.`,
      documents: ['Death certificate', 'Client master / statement', 'Your ID', 'Transmission form'],
      letterKey: 'investment_transmission',
      itemId: inv.id,
    });
  }

  const property = items.filter((i) => i.category === 'property');
  for (const prop of property) {
    push({
      priority: 20,
      category: 'property',
      title: `Property succession — ${prop.title}`,
      detail:
        'Consult local advocate for mutation / succession. Do not sell until title path is clear. Keep all original papers in vault.',
      documents: ['Title deed copy', 'Death certificate', 'Will / succession docs if any'],
      letterKey: null,
      itemId: prop.id,
    });
  }

  const digital = items.filter((i) => i.category === 'digital');
  for (const dig of digital) {
    push({
      priority: 30,
      category: 'digital',
      title: `Secure digital access — ${dig.title}`,
      detail:
        dig.notes ||
        'Preserve access carefully. Prefer provider deceased-user / legacy contact flows. Do not share passwords casually.',
      documents: ['Death certificate (for provider requests)', 'Account identifiers'],
      letterKey: null,
      itemId: dig.id,
    });
  }

  const subs = items.filter((i) => i.category === 'subscriptions');
  for (const sub of subs) {
    push({
      priority: 31,
      category: 'digital',
      title: `Cancel subscription — ${sub.title}`,
      detail: `Stop recurring charges for ${sub.institution || sub.title}.`,
      documents: [],
      letterKey: null,
      itemId: sub.id,
    });
  }

  push({
    priority: 40,
    category: 'wrap',
    title: 'Update nominations & close loops',
    detail:
      'After major claims, update surviving family nominations, cancel unused SIMs if needed, and archive this estate pack.',
    documents: [],
    letterKey: null,
  });

  if (tasks.length <= 3) {
    push({
      priority: 15,
      category: 'claims',
      title: 'Add Life Map items, then refresh tasks',
      detail:
        'This estate has few vault items. Add banks, insurance, and property in Life Map before unlock for a fuller checklist.',
      documents: [],
      letterKey: null,
    });
  }

  return tasks.sort((a, b) => a.priority - b.priority);
}

/** Extra tasks for diaspora packs (India assets + foreign residence) */
function buildDiasporaExtraTasks(estate, pack) {
  const tasks = [];
  const push = (task) =>
    tasks.push({
      id: crypto.randomUUID(),
      estateId: estate.id,
      status: 'todo',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: '',
      ...task,
    });

  if (pack === 'IN_US') {
    push({
      priority: 3,
      category: 'crossborder',
      title: 'US: order apostille / certified copies if needed',
      detail:
        'Indian death certificate often needs apostille or embassy attestation before US banks/insurers accept it. Start early — this is a common diaspora bottleneck.',
      documents: ['Death certificate', 'Apostille / MEA attestation'],
      letterKey: null,
    });
    push({
      priority: 4,
      category: 'crossborder',
      title: 'US: notify Social Security / employer benefits if applicable',
      detail:
        'If the parent had US SSA benefits, 401(k), or employer life cover, notify those administrators separately from India claims.',
      documents: ['Death certificate', 'SSN / benefit refs if known'],
      letterKey: null,
    });
    push({
      priority: 5,
      category: 'crossborder',
      title: 'Coordinate India branch visits while abroad',
      detail:
        'Appoint a local relative / counsel with power of attorney where banks require in-person. Use Estate OS letters + vault photos; do not courier original deeds casually.',
      documents: ['POA if any', 'Unlocker ID', 'Vault export ZIP'],
      letterKey: null,
    });
  }

  if (pack === 'IN_UK') {
    push({
      priority: 3,
      category: 'crossborder',
      title: 'UK: FCDO / solicitor-certified copy path',
      detail:
        'UK institutions may need legalised or solicitor-certified copies of Indian death docs. Confirm with the receiving bank/insurer before you fly.',
      documents: ['Death certificate', 'Certified copy plan'],
      letterKey: null,
    });
    push({
      priority: 4,
      category: 'crossborder',
      title: 'UK: check UK estate / probate need separately',
      detail:
        'UK assets (ISA, property, pensions) follow UK probate rules — separate from India nominee claims. Note which assets sit in which country in the Life Map.',
      documents: ['UK asset list from Life Map', 'Will if any'],
      letterKey: null,
    });
    push({
      priority: 5,
      category: 'crossborder',
      title: 'India remote claim logistics from UK',
      detail:
        'Plan courier of attested docs, local attorney visits, and time-zone follow-ups. Keep a single sibling as India ops lead in Family tab.',
      documents: ['Vault ZIP', 'Counsel brief if retained'],
      letterKey: null,
    });
  }

  return tasks;
}

export function buildExecutionTasks(estate, items) {
  const base = buildIndiaExecutionTasks(estate, items);
  const pack = estate.countryPack || estate.country || 'IN';
  if (pack === 'IN_US' || pack === 'IN_UK') {
    return [...base, ...buildDiasporaExtraTasks(estate, pack)].sort(
      (a, b) => a.priority - b.priority
    );
  }
  return base;
}

export const COUNTRY_PACKS = [
  { id: 'IN', label: 'India', needsDiaspora: false },
  { id: 'IN_US', label: 'India + US', needsDiaspora: true },
  { id: 'IN_UK', label: 'India + UK', needsDiaspora: true },
];

export function renderLetter(key, { estate, item, requester, proofType }) {
  const today = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const person = estate.subjectName;
  const who = requester?.name || 'Family representative';
  const inst = item?.institution || '[Institution name]';
  const ref = item?.accountRef || '[Account / policy number]';
  const title = item?.title || '[Account]';

  const proof =
    proofType === 'incapacity'
      ? 'medical incapacity documentation'
      : 'death certificate';

  if (key === 'bank_claim') {
    return `Date: ${today}

To,
The Branch Manager
${inst}

Subject: Request for deceased / nominee account process — ${title} (${ref})

Respected Sir/Madam,

I, ${who}, am writing regarding the account(s) held by ${person} (${estate.subjectRelation || 'family member'}) at your branch, reference ${ref}.

Please find enclosed copies of the ${proof} and my identity document. I request you to guide us on the nominee / claim / transmission process and the forms required to proceed.

This letter was prepared using Estate OS as a family coordination aid and does not replace your bank’s official forms or legal advice.

Yours sincerely,
${who}
${requester?.email || ''}
`;
  }

  if (key === 'insurance_claim') {
    return `Date: ${today}

To,
Claims Department
${inst}

Subject: Intimation of claim — Policy ${ref} (${title})

Respected Sir/Madam,

I, ${who}, hereby intimate a claim in respect of policy ${ref} held by ${person}.

Enclosed: copy of ${proof}, policy details on record, and my KYC. Kindly advise the claim form set and documents checklist for settlement to the nominee / legal heir as applicable.

Prepared with Estate OS for family coordination — not a substitute for insurer forms or legal counsel.

Yours sincerely,
${who}
`;
  }

  if (key === 'investment_transmission') {
    return `Date: ${today}

To,
${inst}

Subject: Transmission / nominee request — ${title} (${ref})

Respected Sir/Madam,

Please process transmission / nominee claim for holdings related to ${person}, reference ${ref}.

Enclosed: ${proof} copy and identity proof of the requesting family member (${who}). Kindly share the exact transmission form and supporting list for your process.

Yours sincerely,
${who}
`;
  }

  return `Date: ${today}\n\nRegarding ${person} — ${title}\nPrepared via Estate OS.\n`;
}
