/**
 * Child-led Digital Housewarming — onboarding script.
 * Parent is not the operator; adult child runs a ~20 min call/visit.
 */

export const HOUSEWARMING_META = {
  title: 'Digital Housewarming',
  duration: '~20 minutes',
  audience: 'Adult child abroad (or visiting) — with parent on a call or at home',
  framing:
    'This is not a death dossier. You are moving monthly life admin onto a secure dashboard so you can help from abroad — electricity, maid salary, insurance renewals, who has the keys.',
  openWith: {
    en: 'Mama/Papa — I want to set up a simple digital checklist for the house so I can help with bills and caregivers from abroad. It takes twenty minutes. No lawyers today.',
    hi: 'मम्मा/पापा — मैं घर के बिल और देखभाल वाले लोगों का एक सादा डिजिटल चेकलिस्ट बनाना चाहता/चाहती हूँ ताकि विदेश से मदद कर सकूँ। बीस मिनट लगेंगे। आज कोई वकील की बात नहीं।',
  },
  avoid: [
    'Will / inheritance / “when you die”',
    'Asking them to type passwords into the app',
    'Leaving them alone with a long form',
  ],
};

export const HOUSEWARMING_STEPS = [
  {
    id: 'create',
    order: 1,
    tab: null,
    title: 'Create the estate',
    childDoes: 'Name the estate after the parent (e.g. “Ramesh — Lucknow”). Pick India or India+US/UK pack.',
    sayAloud: 'I’m just labelling this under your name so everything about the house stays in one place.',
    why: 'Gives the map a home without sounding like estate planning.',
    doneWhen: 'Estate exists on your dashboard.',
    tips: ['Use the city they live in if it helps siblings recognise the file.'],
  },
  {
    id: 'call',
    order: 2,
    tab: 'interview',
    title: 'Join the call / sit together',
    childDoes: 'Open Interview. You type; they talk. Walk question by question.',
    sayAloud:
      'I’ll ask a few practical things — banks you use, LIC if any, who comes to clean, where the electricity bill app is. You just tell me; I’ll write it down.',
    why: 'Interview fills the Life Map without “fill out your death dossier.”',
    doneWhen: 'At least banks + one care contact OR submit interview once.',
    tips: [
      'WhatsApp video works fine from US/UK/UAE.',
      'If they tire, stop after care + banks and finish later — yearly review will nudge you.',
    ],
  },
  {
    id: 'care',
    order: 3,
    tab: 'map',
    title: 'Care at home',
    childDoes:
      'Life Map → Care at home: nurse, attendant, maid, cook, driver — name, phone, shift, who pays, backup.',
    sayAloud:
      'Who comes to the house in the morning? Who has spare keys? If something happens at night, who do we call first in the building?',
    why: 'Local staff are first responders; NRI kids need phones and payment paths before crisis.',
    doneWhen: 'At least one care contact with a phone number.',
    tips: ['Note who pays them (you via UPI to neighbour vs parent cash) — that matters when accounts freeze.'],
  },
  {
    id: 'unlock',
    order: 4,
    tab: 'rules',
    title: 'Who can unlock later',
    childDoes: 'Unlock rules: add sibling unlockers; keep proof required (death certificate / doctor letter).',
    sayAloud:
      'I’m putting [sibling name] as someone who can open this with me if there’s a hospital emergency — so we’re not stuck on one phone.',
    why: 'Verification gate without asking the parent to approve “death access.”',
    doneWhen: 'Unlock rules saved with proof on and at least you as unlocker.',
    tips: ['Dual unlock if siblings disagree often; single if one adult child is clearly lead.'],
  },
  {
    id: 'qr',
    order: 5,
    tab: 'emergency',
    title: 'Fridge QR',
    childDoes: 'Emergency QR → download/print or WhatsApp to sibling. Stick on fridge / wallet card.',
    sayAloud:
      'This code only shows who to call and caregiver phones — not bank details. If neighbours or hospital staff need a number fast, they scan this.',
    why: 'First responders get contacts without vault dump.',
    doneWhen: 'You’ve opened Emergency QR and shared or saved the link.',
    tips: ['Laminate or fridge magnet later; phone screenshot is enough for day one.'],
  },
  {
    id: 'review',
    order: 6,
    tab: 'map',
    title: 'Park the yearly ping',
    childDoes: 'Mark review complete when done, or note nextReview. Tell siblings the map exists.',
    sayAloud:
      'Once a year I’ll call again and ask — same maid? Same LIC? Same SIM for OTPs? — so this doesn’t go stale.',
    why: 'Beats the Ghost Parent Trap long-term: life-admin refresh, not morbid re-onboarding.',
    doneWhen: 'Housewarming marked complete.',
    tips: ['Invite a sibling from Family tab so you’re not the only one with access.'],
  },
];

export function defaultHousewarmingState() {
  return {
    completedSteps: [],
    currentStepId: HOUSEWARMING_STEPS[0].id,
    completedAt: null,
    dismissed: false,
    startedAt: null,
  };
}

export function housewarmingPublic(estate, items = []) {
  const hw = { ...defaultHousewarmingState(), ...(estate.housewarming || {}) };
  const hasCarePhone = items.some(
    (i) => i.category === 'care' && String(i.accountRef || '').trim().length >= 8
  );
  const hasInterviewOrBanks =
    items.some((i) => i.source === 'interview') || items.some((i) => i.category === 'bank');
  const suggested = {
    call: hasInterviewOrBanks,
    care: hasCarePhone,
    create: true,
  };
  return {
    meta: HOUSEWARMING_META,
    steps: HOUSEWARMING_STEPS,
    progress: hw,
    suggestedComplete: suggested,
    percent: Math.round((hw.completedSteps.length / HOUSEWARMING_STEPS.length) * 100),
  };
}
