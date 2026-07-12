import crypto from 'crypto';

export const ITEM_CATEGORIES = [
  { id: 'bank', label: 'Bank accounts', icon: 'bank' },
  { id: 'insurance', label: 'Insurance', icon: 'shield' },
  { id: 'investments', label: 'Investments / demat / PF', icon: 'chart' },
  { id: 'property', label: 'Property & papers', icon: 'home' },
  { id: 'digital', label: 'Phone, email, digital', icon: 'device' },
  { id: 'subscriptions', label: 'Subscriptions', icon: 'repeat' },
  { id: 'contacts', label: 'Key contacts', icon: 'people' },
  { id: 'wishes', label: 'Wishes & notes', icon: 'heart' },
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
