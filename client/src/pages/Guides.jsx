import { useEffect } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';

export const GUIDES = [
  {
    slug: 'nri-parent-documents-checklist',
    title: 'NRI parent documents checklist (India)',
    description:
      'What adult children abroad should map before a hospital scare — banks, LIC, property, keys, caregivers. Free HeirReady vault.',
    updated: '14 July 2026',
    lead:
      'If your parents are in India and you are abroad, the hard part is not “getting documents someday.” It’s knowing which ones exist, who has the keys, and who to call — before something happens. Tens of thousands of crores sit unclaimed in Indian banks, insurance, and IEPF partly because heirs never knew what existed.',
    sections: [
      {
        h: 'Unclaimed money is a clue — not your product pitch alone',
        body: [
          'RBI / IEPF / insurers hold large pools of unclaimed deposits, shares, and policy proceeds.',
          'Much of it sits idle because accounts were forgotten, KYC drifted, or heirs never had a map.',
          'HeirReady does not reclaim that money for you. It helps siblings share a Life Map so you are not guessing which bank, LIC, or key existed.',
        ],
      },
      {
        h: 'Start with what can lock the family out',
        body: [
          'Bank accounts / joint holders / OTP phone SIM',
          'LIC and other insurance (policy number, branch if known)',
          'Property papers: flat / house / plot / society NOC path',
          'Will / nomination status if they will say (optional — don’t force day one)',
          'Income tax / ITR login holder, if any',
        ],
      },
      {
        h: 'Home ops (often more urgent than papers)',
        body: [
          'Maid / nurse / attendant / cook — name + phone + shift',
          'Who pays them (parent cash vs you UPI to a neighbour)',
          'Spare keys / society security / building WhatsApp admin',
          'Electricity / gas / broadband apps and whose name they are in',
        ],
      },
      {
        h: 'How to collect this without a death-dossier vibe',
        body: [
          'Do it as a “house admin map so I can help with bills from abroad.”',
          'You type; they talk — WhatsApp video is enough.',
          'Stop after banks + care phone if they tire. Finish later.',
          'Invite a sibling so you are not the only vault holder.',
        ],
      },
    ],
    cta: 'Start free — map one parent',
  },
  {
    slug: 'lic-claim-what-family-needs',
    title: 'LIC claim: what your family actually needs ready',
    description:
      'Policy number, nominee, and papers NRI siblings should map early — not legal advice, a practical checklist.',
    updated: '14 July 2026',
    lead:
      'When a claim is needed, families lose weeks hunting a policy number and a branch contact. Mapping LIC (and other policies) into a shared family vault is boring until it isn’t.',
    sections: [
      {
        h: 'Capture while everyone is calm',
        body: [
          'Policy number(s) and product type if known (endowment / term / ULIP)',
          'Nominee name as recorded',
          'Issuing branch / agent name / phone if any',
          'Where the physical policy packet lives (steel cupboard? bank locker?)',
          'Login / app used for premium payments, if any',
        ],
      },
      {
        h: 'When a claim path starts (high level)',
        body: [
          'Death certificate / doctor letter copies (multiple)',
          'Nominee ID and bank details for payout',
          'Policy document or branch retrieval path',
          'Appointed family unlockers who can open the shared checklist',
        ],
      },
      {
        h: 'What HeirReady is for here',
        body: [
          'Store the map and scans before crisis — not as legal advice.',
          'After unlock with proof, Execution Mode can sequence India tasks.',
          'Counsel can be retained separately if you need an advocate on the same file.',
        ],
      },
    ],
    cta: 'Add LIC to a free Life Map',
  },
  {
    slug: 'sibling-unlockers-family-vault',
    title: 'Sibling unlockers: don’t be the only one with the map',
    description:
      'Why diaspora families appoint a second sibling as unlocker and how WhatsApp family invites work on HeirReady.',
    updated: '14 July 2026',
    lead:
      'One adult child abroad holding every password and every document photo is a single point of failure. Unlockers are how siblings share access without dumping the vault into a group chat.',
    sections: [
      {
        h: 'What an unlocker is',
        body: [
          'A trusted family member who can open Execution Mode with required proof (death certificate / doctor incapacity letter).',
          'Managers on the vault can edit the Life Map; unlockers are appointed in Unlock rules.',
          'Parents do not need an app account — you map for them.',
        ],
      },
      {
        h: 'The WhatsApp loop that works',
        body: [
          'Create one durable family invite link.',
          'Forward the same message to every sibling — multi-use, not one link per person.',
          'After someone joins, forward it again while the chat is open.',
        ],
      },
      {
        h: 'Good default for most families',
        body: [
          'You (owner) + one sibling as manager/unlocker',
          'Proof required on unlock',
          'Fridge QR at home for “who to call” without bank secrets',
        ],
      },
    ],
    cta: 'Create a free vault and invite a sibling',
  },
  {
    slug: 'fridge-qr-emergency-card',
    title: 'Fridge QR emergency card (no bank passwords)',
    description:
      'A scannable card for unlockers and caregiver phones — what to put on the fridge and what never to print.',
    updated: '14 July 2026',
    lead:
      'Neighbours, hospital staff, and siblings need a few numbers fast. They do not need your parent’s netbanking password. That’s what the HeirReady emergency QR is for.',
    sections: [
      {
        h: 'What the public card shows',
        body: [
          'Subject name and relation',
          'Who can unlock the vault',
          'First steps checklist',
          'Care / key contact phones you chose to store',
        ],
      },
      {
        h: 'What it never shows',
        body: [
          'Bank passwords or full vault notes',
          'Life Map item secrets beyond contacts you added',
          'Anything behind unlock-with-proof',
        ],
      },
      {
        h: 'How to place it',
        body: [
          'WhatsApp the QR to a sibling, or print for fridge / wallet',
          'Finish Digital Housewarming (solo is fine) to generate the family link + QR climax',
          'If a sibling scans it, they can join the vault when the family link is live',
        ],
      },
    ],
    cta: 'Get a fridge QR in minutes — start free',
  },
  {
    slug: 'unclaimed-deposits-iepf-what-heirs-should-map',
    title: 'Unclaimed deposits & IEPF: what heirs should map before they need to search',
    description:
      'Why crores sit unclaimed in Indian banks, insurance, and IEPF — and the practical Life Map adult children abroad should build so the family is not starting blind.',
    updated: '16 July 2026',
    lead:
      'Every few months another headline appears: tens of thousands of crores sitting unclaimed in banks, insurance, and the Investor Education and Protection Fund (IEPF). Those numbers are real — and they are usually a symptom. Someone opened an account, bought shares, or paid a premium years ago. KYC drifted. The phone number changed. Heirs never had a list. HeirReady does not reclaim that money for you. This guide is about mapping what exists so your family is not searching cold when something happens.',
    sections: [
      {
        h: 'What “unclaimed” usually means in India',
        paras: [
          '“Unclaimed” is not one government vault with your family’s name on it. It is a patchwork: dormant bank deposits, forgotten insurance proceeds, shares and dividends moved to IEPF after long inactivity, and similar pools at other institutions. Rules and timelines differ by product. The common thread is silence — no nominee update, no heir who knew the account existed, no paper trail at home.',
        ],
        body: [
          'Bank deposits left inactive for years can be classified dormant / unclaimed under RBI frameworks (exact treatment depends on product and circulars — verify with the bank).',
          'Insurance claims may sit unpaid when the insurer cannot find a nominee or when the family never knew a policy existed.',
          'Shares, mutual fund units, and related amounts can end up with IEPF after prolonged non-claim — reclaim is a process, not a WhatsApp favour.',
          'Public search tools (bank unclaimed portals, IEPF search, insurer helpdesks) help only if you know whose name to search and which institutions to try.',
        ],
      },
      {
        h: 'Why NRI siblings get blindsided',
        paras: [
          'If you live abroad, you often hear “everything is fine” until a hospital admission or a death certificate makes the paperwork urgent. Then the hunt starts: which SBI branch, which LIC policy, which demat, whose SIM receives OTPs. Weeks disappear while flights are booked and society offices are called.',
        ],
        body: [
          'Parents may have accounts opened decades ago that never appear in the “active” wallet they use for UPI.',
          'Joint accounts and nominee fields are often outdated after a sibling marriage, a new phone, or a name spelling change.',
          'Physical papers live in a steel cupboard, bank locker, or “with the CA” — and nobody wrote that down.',
          'One sibling abroad becomes the default project manager; without a shared map, the others cannot help efficiently.',
        ],
      },
      {
        h: 'What to map now (calm day checklist)',
        paras: [
          'You do not need every statement. You need a reliable inventory: institution, rough identity (last four digits / folio / policy no. if known), where papers live, and who holds the OTP phone. Capture that in a shared Life Map while parents can still answer on a video call.',
        ],
        body: [
          'Banks and post office: bank name, branch city if known, account type (savings / FD / joint), OTP SIM owner.',
          'Insurance: LIC and others — policy numbers, nominee as recorded, agent or branch contact if any.',
          'Investments: demat / broker, mutual fund folios, PPF / EPF if parents mention them.',
          'IEPF risk flags: old shares from employer ESOP, IPO allotments, or demat accounts they “don’t use anymore.”',
          'Property and society: flat / house / plot papers location; society secretary phone.',
          'People: CA, lawyer, family friend who “knows the papers,” maid / nurse phone.',
        ],
      },
      {
        h: 'How to search later without starting from zero',
        paras: [
          'If a claim path starts, a Life Map turns panic into a to-do list. You still work with banks, insurers, and — if needed — counsel. The difference is you are not inventing the list of places to call.',
        ],
        body: [
          'Use the mapped institution list first; then use official unclaimed / IEPF search tools for gaps.',
          'Keep death certificate / doctor letters in multiple copies once they exist — every counter asks for them.',
          'Appoint a sibling unlocker so one person abroad is not the single key.',
          'Do not paste full account passwords into a family WhatsApp group; use a vault with unlock rules.',
        ],
      },
      {
        h: 'What HeirReady is — and is not — in this story',
        paras: [
          'HeirReady is a family continuity vault: Life Map, sibling invite, fridge QR for contacts, unlock-with-proof, and India execution checklists. It is not a reclaim agency, not a bank, and not legal advice. Mapping early is how you avoid becoming another family that only discovers accounts when the unclaimed headlines feel personal.',
        ],
        body: [
          'Free plan: start one parent Life Map and invite a sibling.',
          'Store labels + encrypted secrets; finish housewarming for the emergency QR.',
          'Retain counsel on the same file only if you choose — optional, separate from the map itself.',
        ],
      },
    ],
    cta: 'Start a free Life Map before you need to search',
  },
  {
    slug: 'demat-mutual-fund-folios-nri-family-map',
    title: 'Demat & mutual fund folios: what NRI kids should capture for parents',
    description:
      'Broker, DP ID, folio numbers, and nominee fields — a practical checklist for adult children abroad mapping Indian investments without turning it into a scare conversation.',
    updated: '16 July 2026',
    lead:
      'Bank accounts get discussed. Demat and mutual fund folios often do not — until dividends bounce, KYC freezes, or an heir needs transmission. For adult children abroad, the goal is not to become the family broker. It is to know which platforms exist, under whose PAN, and who receives OTPs, so a future claim is not a scavenger hunt across apps your parents barely open anymore.',
    sections: [
      {
        h: 'Why investment maps go missing',
        paras: [
          'Many parents bought funds through a bank relationship manager, an office ESOP, or a one-time IPO. The app password was set once. The phone number on file is an old Airtel SIM. You see “some investments” in conversation and nothing structured in writing.',
        ],
        body: [
          'Multiple brokers / RTAs over the years (CAMS, KFin, different AMCs) mean multiple logins.',
          'Demat may sit with a bank broker while mutual funds are “direct” on another app.',
          'Nominee on the demat and nominee on each folio can disagree.',
          'NRI / resident status changes break KYC until someone updates it — often discovered at the worst time.',
        ],
      },
      {
        h: 'Calm-day capture list',
        paras: [
          'On a video call, ask parents to open the apps they still use — or to find the last CAS / statement email. You type into the Life Map. They narrate. Stop if they tire; partial is better than nothing.',
        ],
        body: [
          'Broker / depository participant name (e.g. bank broker, Zerodha, Groww — whatever they use).',
          'Demat / BO ID or client ID if visible; never store trading passwords in chat.',
          'Mutual fund folios: AMC name + folio number (or screenshot stored securely in the vault).',
          'Consolidated account statement (CAS) email address and which inbox receives it.',
          'PAN under which holdings sit; any second PAN in the household.',
          'Nominee name(s) as shown in the app — note if “not updated.”',
          'Who holds the OTP SIM and the email used for KYC.',
        ],
      },
      {
        h: 'Transmission vs everyday ops (high level)',
        paras: [
          'Everyday ops are premiums, SIPs, and KYC. Transmission / nomination payout paths start when an account holder dies or is incapacitated. Exact documents differ by broker and AMC. Your map should tell the family which doors to knock on first.',
        ],
        body: [
          'Keep death certificate / succession documents ready when a claim path starts (multiple certified copies).',
          'Expect each broker / RTA to ask for their own forms — the Life Map is the directory, not the form.',
          'If holdings may have gone dormant or toward IEPF timelines, note “old / unused demat” as a flag for later search.',
          'Optional: retain counsel when estates are large or contested — the vault can hold the engagement context.',
        ],
      },
      {
        h: 'Security hygiene for investment secrets',
        paras: [
          'Treat demat and folio identifiers as sensitive. HeirReady’s vault encryption is designed so account references and notes can stay locked on your device. Do not paste full login passwords into WhatsApp “for convenience.”',
        ],
        body: [
          'Prefer labels + last-four / folio in the map; keep passwords in a proper password manager if at all.',
          'Invite a sibling unlocker so one NRI is not the only person who can open the map with proof.',
          'Turn on authenticator 2FA on HeirReady; save the recovery key offline if you enable vault encryption.',
        ],
      },
      {
        h: 'How HeirReady fits',
        body: [
          'Add investments as Life Map items during housewarming or later review.',
          'Attach scans of CAS / folio pages if parents allow.',
          'Share the vault with siblings; keep parents off the app if they prefer.',
          'Not investment advice — continuity admin for the family.',
        ],
      },
    ],
    cta: 'Add demat & folios to a free Life Map',
  },
  {
    slug: 'property-papers-society-noc-nri-parents',
    title: 'Property papers & society NOC: an NRI checklist for parents’ homes',
    description:
      'Where title papers live, who the society secretary is, and what adult children abroad should map before a sale, mutation, or emergency — practical, not legal advice.',
    updated: '16 July 2026',
    lead:
      'A flat in Pune or a house in Lucknow is often the largest asset in an Indian parent’s Life Map — and the least documented in any shared sibling note. Society offices move slowly. Lockers hold originals. An NRI child discovers the gap when someone needs an NOC, a mutation, or proof of ownership after a crisis. This checklist is about capturing locations and contacts early, not about drafting deeds yourself.',
    sections: [
      {
        h: 'What usually goes missing',
        paras: [
          'Parents know “the papers are safe.” Siblings abroad do not know whether that means a bank locker, a relative’s almirah, or a builder’s pending registration. Society WhatsApp admins change. The person who “always handled society work” moves cities.',
        ],
        body: [
          'Sale deed / allotment letter / share certificate — physical location unknown to children.',
          'Society maintenance account and secretary phone only on one sibling’s contact list.',
          'Parking, storage, or servant-room rights never written down.',
          'Loan / home-loan closure papers mixed with old insurance files.',
          'Municipal / property tax login in an email nobody monitors.',
        ],
      },
      {
        h: 'Map these fields while parents can answer',
        paras: [
          'Use a calm framing: “So I can help with society bills and repairs from abroad.” You are building an operations map, not announcing a will discussion.',
        ],
        body: [
          'Property nickname + city + society / builder name.',
          'How title is held (single / joint / company) — only if parents volunteer; do not cross-examine.',
          'Where originals live (home cupboard / bank locker / CA office) and who has locker keys.',
          'Society secretary / manager phone; maintenance payment method (cheque / UPI / portal).',
          'Electricity / water / gas account names and consumer numbers if known.',
          'Any tenant, caretaker, or relative with informal access.',
          'Pending disputes, society dues, or “builder still has papers” flags — one honest line is enough.',
        ],
      },
      {
        h: 'NOC, mutation, and why contacts matter',
        paras: [
          'Many society and municipal steps are contact-driven. If the only person who knew the secretary retires, you lose weeks. Exact legal steps for sale, gift, or inheritance depend on state law and documents — use a lawyer when the stakes are high. Your Life Map should still hold the phone numbers and paper locations.',
        ],
        body: [
          'Keep society and advocate contacts in the vault’s care / contacts categories.',
          'Photograph index pages of deed packets (not every stamp) if parents allow — store encrypted.',
          'Note which sibling is local enough to visit the society office.',
          'Fridge QR can show caregiver / society phones without exposing title details.',
        ],
      },
      {
        h: 'NRI-specific friction',
        body: [
          'Time zones: society offices close before your evening abroad — map a local unlocker.',
          'Power of attorney conversations are separate from the Life Map; do not force them on day one.',
          'If parents travel between India and abroad, note which address receives society post.',
          'Diaspora plan on HeirReady exists for families who need more vaults / capacity — start free if you are testing the habit.',
        ],
      },
      {
        h: 'Disclaimer',
        paras: [
          'This is family admin guidance for continuity, not a property-law opinion. Registration, stamp duty, succession, and society bylaws need local professional advice when you act on a transaction.',
        ],
        body: [],
      },
    ],
    cta: 'Map one property into a free Life Map',
  },
  {
    slug: 'caregiver-maid-nurse-contacts-family-vault',
    title: 'Maid, nurse, attendant: the care contacts NRI families forget to write down',
    description:
      'Shifts, phones, who pays salary, and backup carers — how adult children abroad should map home-care people into a shared vault before a hospital week.',
    updated: '16 July 2026',
    lead:
      'When a parent falls ill, the first call is often not the bank. It is the maid who has a key, the nurse who knows the night medicines, or the neighbour who paid the cook last month. Adult children abroad frequently have those numbers only in a parent’s phone — or nowhere. Mapping care contacts is the highest-leverage “boring” work you can do in a twenty-minute video call.',
    sections: [
      {
        h: 'Why care contacts beat a perfect bank list on day one',
        paras: [
          'Papers matter. People unlock the house. If you cannot reach the person with the spare key, you cannot start half the India checklist. Hospitals also ask who has been giving medicines at home.',
        ],
        body: [
          'Maid / cook / driver — name, phone, usual shift, weekly off.',
          'Nurse / attendant / agency — rate band if known, who hired them, backup name.',
          'Neighbour / society security / watchman who will open for family.',
          'Who pays cash vs UPI (parent, you, local sibling).',
          'Medical: GP, chemist shop, any home-care agency WhatsApp.',
        ],
      },
      {
        h: 'How to ask without sounding like a takeover',
        paras: [
          'Frame it as logistics: “If my flight is delayed, who should I call for the morning medicines?” Parents usually answer that more easily than “list all your assets.”',
        ],
        body: [
          'Type while they speak; confirm spellings of names.',
          'Ask for a backup person for each critical role.',
          'Note languages spoken if carers and NRI kids do not share one.',
          'Stop after care + one bank if they are tired — resume next Sunday.',
        ],
      },
      {
        h: 'What belongs on the fridge QR vs inside the vault',
        paras: [
          'Public emergency cards should help a neighbour or unlocker act fast. They should not publish salary gossip or private medical narratives. Put rich notes in the vault; put phones you are willing to expose on the card.',
        ],
        body: [
          'Fridge / emergency QR: subject name, unlocker path, selected care phones.',
          'Vault notes: shift patterns, payment habits, allergies, “does not open door after 9pm.”',
          'Never put UPI PINs or bank passwords on a printed card.',
        ],
      },
      {
        h: 'Sibling coordination',
        body: [
          'Invite a sibling so care updates are not stuck in one NRI’s Notes app.',
          'When a carer changes, update the Life Map the same week — stale phones are worse than none.',
          'Light review nudges on HeirReady exist so you re-check “same maid / nurse phone?” periodically.',
        ],
      },
      {
        h: 'How HeirReady models this',
        body: [
          'Care category items with phone in the account/contact field.',
          'Housewarming steps that push you to capture attendants early.',
          'Optional care network features for families who want verified help later — mapping your existing people comes first.',
        ],
      },
    ],
    cta: 'Add care phones to a free vault',
  },
  {
    slug: 'sim-otp-upi-digital-access-parents-india',
    title: 'SIM, OTP & UPI: digital access your parents’ banks actually depend on',
    description:
      'Which phone receives bank OTPs, whose UPI is linked, and how NRI families should document digital access without dumping passwords into WhatsApp.',
    updated: '16 July 2026',
    lead:
      'Indian banking is phone-shaped. Reset a netbanking password and the OTP lands on a SIM. Pay a hospital deposit and UPI asks for a device that may be at home with a parent who cannot unlock it. Adult children abroad often have photocopies of passbooks and zero clarity on which mobile number is still KYC-linked. Fix that map early.',
    sections: [
      {
        h: 'The digital stack that quietly runs the household',
        paras: [
          'You do not need every app password on day one. You need a dependency map: which SIM, which email, which UPI ID, and who can physically hold the phone.',
        ],
        body: [
          'Primary mobile number for bank / demat / income-tax OTPs.',
          'Secondary number if parents use two SIMs (India + travel).',
          'Email inboxes that receive KYC and CAS — and who knows the password.',
          'UPI apps (GPay / PhonePe / bank app) and which VPA is printed on the chemist’s “usual.”',
          'DigiLocker / Aadhaar-linked mobile if they use it.',
          'Broadband / JioFiber / DTH account phones for “house still running” ops.',
        ],
      },
      {
        h: 'Failure modes NRI kids hit',
        body: [
          'OTP SIM is with a parent in ICU; nobody else can complete a transfer.',
          'Number was ported; banks still send OTP to the old MSISDN.',
          'UPI PIN known only to one parent; spouse never set it up.',
          'Email for bank alerts is an old Yahoo account nobody opens.',
          'Family shares passwords on WhatsApp — then a phone is stolen.',
        ],
      },
      {
        h: 'What to write in the Life Map',
        paras: [
          'Prefer operational facts over secrets. Where a secret is required, use vault encryption and unlock rules — not a sibling group chat.',
        ],
        body: [
          'Label: “HDFC OTP → Mum’s Airtel ending 1234 (phone in bedside drawer).”',
          'Label: “SBI UPI on Papa’s Android; backup is sibling X in India.”',
          'Note device locations and screen-lock habits if relevant (“Face ID; sister knows passcode”).',
          'Do not store full netbanking passwords in plain notes if you can avoid it.',
          'Record recovery contacts at the bank (registered email / alternate number) if parents know them.',
        ],
      },
      {
        h: 'Security habits that match how HeirReady works',
        body: [
          'Enable authenticator 2FA on HeirReady so a stolen login is not enough.',
          'Unusual device sign-in requires email confirmation.',
          'Vault encryption keeps account refs and notes as ciphertext on the server.',
          'Read /security for a plain-language split of what staff can and cannot see.',
        ],
      },
      {
        h: 'When incapacity or death starts',
        paras: [
          'OTP and UPI access become part of a larger India execution path — death certificate, bank visits, nominee claims. Your digital map tells unlockers which phone to secure first so fraud and lockouts do not compound grief.',
        ],
        body: [
          'Secure the OTP handset physically when possible.',
          'Use the vault checklist rather than inventing steps in a panic chat.',
          'Involve counsel when accounts are contested or large — optional on HeirReady.',
        ],
      },
    ],
    cta: 'Map OTP phones on a free Life Map',
  },
  {
    slug: 'talk-parents-life-admin-without-scare',
    title: 'How to talk to parents about life admin without making it a death conversation',
    description:
      'Scripts and pacing for NRI adult children who need a parent Life Map — house admin framing, what to skip on call one, and how to bring siblings in.',
    updated: '16 July 2026',
    lead:
      'The work is necessary. The tone is optional. Many families stall because the first message sounds like estate planning theatre. You can gather 80% of what matters — banks, care phones, keys, LIC labels — by talking about bills, travel cover, and “who I call if your phone is off.” This guide is about that conversation design.',
    sections: [
      {
        h: 'Frames that usually work',
        paras: [
          'Lead with usefulness to them and to you as a remote helper. Avoid opening with wills, death, or “when you’re gone.” Those topics can come later if the family wants counsel — not as the price of entry for a Life Map.',
        ],
        body: [
          '“I’m making a house admin note so I can pay society / electricity if I’m stuck at work abroad.”',
          '“If I’m on a flight and the maid needs to confirm something, who is the backup?”',
          '“Can we list LIC / banks so I’m not bothering you every time a premium SMS arrives?”',
          '“Khushboo / Sunny and I want the same list — no more contradictory WhatsApps.”',
        ],
      },
      {
        h: 'Frames that usually backfire',
        body: [
          'Opening with “We need your will and nominations sorted this weekend.”',
          'Interrogating net worth or implying they mismanage money.',
          'Recording the call secretly or putting strangers (RMs) on the call without asking.',
          'Making it a competition between siblings in front of parents.',
        ],
      },
      {
        h: 'A 20-minute call agenda',
        paras: [
          'HeirReady’s housewarming is built around short passes. Use the same pacing even if you are still on paper notes.',
        ],
        body: [
          'Minutes 0–3: purpose (“admin map for bills / care”).',
          'Minutes 3–10: care phones + spare keys + society.',
          'Minutes 10–16: banks / UPI OTP phone / one LIC if energy remains.',
          'Minutes 16–20: where paper packets live; schedule part two.',
          'After call: invite a sibling to the vault so the labour is shared.',
        ],
      },
      {
        h: 'Culture and language tips',
        body: [
          'Use the parent’s preferred language for sensitive bits; keep the vault labels bilingual if siblings differ.',
          'Let them save face — “we’ll finish later” is a valid outcome.',
          'If one parent talks and the other withdraws, do not force a joint confession on call one.',
          'Offer to type everything yourself; asking them to “fill a form” kills momentum.',
        ],
      },
      {
        h: 'After the first map exists',
        body: [
          'Celebrate the boring win: fridge QR, sibling invite, three real contacts.',
          'Add investments / property on a second sitting.',
          'Turn on security features (2FA, encryption recovery key) so trust matches the sensitivity of what you stored.',
          'Revisit lightly every few months — carers and phone numbers change.',
        ],
      },
      {
        h: 'Where HeirReady helps the conversation',
        paras: [
          'The product gives you a structured housewarming and a shared vault so the talk has a container. It does not replace empathy, and it is not a script for inheritance law. Used well, it keeps the tone on continuity — not on fear.',
        ],
        body: [
          'Start free → one parent map.',
          'Solo path available if siblings are slow.',
          'Read /security if parents ask “who can see this?”',
        ],
      },
    ],
    cta: 'Start the housewarming conversation — free',
  },
  {
    slug: 'parent-hospitalized-india-nri-what-to-do',
    title: 'Parent hospitalized in India while you’re abroad: what to do in the first 48 hours',
    description:
      'NRI checklist when a parent is admitted in India — who to call, which documents matter, OTP phones, money for deposits, and how a shared Life Map stops WhatsApp chaos.',
    updated: '16 July 2026',
    lead:
      'The call usually comes at a bad timezone. A neighbour, a sibling, or the hospital desk says your parent is admitted. You open WhatsApp and invent a plan under stress: who has the insurance card, which phone gets bank OTPs, who can sign consent, how to pay the deposit from abroad. Families that already mapped care contacts and papers move faster. Families that did not lose the first night to hunting. This is an operations guide for adult children abroad — not medical or legal advice.',
    sections: [
      {
        h: 'Hour 0–2: people and access, not paperwork perfection',
        paras: [
          'Before you book a flight, lock a human chain. Hospitals run on consent, payment, and someone who can answer the ward phone. Your Life Map should already name the maid, neighbour, local sibling, and GP. If it does not, build that list now in one shared place — not five private chats.',
        ],
        body: [
          'Confirm hospital name, ward, and admitting doctor phone — write it in the family vault / shared note once.',
          'Identify who is physically closest and can reach the bedside (sibling, cousin, trusted neighbour).',
          'Secure the parent’s phone if possible — OTP SIMs unlock insurance apps, UPI, and DigiLocker.',
          'Ask for admission type (emergency / planned) and whether an attendant bed is allowed.',
          'Appoint one abroad sibling as “comms lead” so the ward is not receiving six overlapping calls.',
        ],
      },
      {
        h: 'Documents hospitals and insurers commonly ask for',
        paras: [
          'Exact lists vary by hospital and policy. The point of mapping early is knowing where cards and IDs live — steel cupboard, wallet, DigiLocker — before midnight.',
        ],
        body: [
          'Aadhaar / PAN photocopies (multiple).',
          'Health insurance card / TPA details / corporate cover letter if any.',
          'Prior prescriptions and allergy list if known.',
          'Emergency contact list with India numbers.',
          'Payment method for deposits: UPI on whose phone, card, or local relative.',
        ],
      },
      {
        h: 'Money movement from abroad without making it worse',
        body: [
          'Prefer a local sibling or trusted person for same-day hospital deposits when possible.',
          'Know which UPI / netbanking OTP phone is active — see our SIM & OTP guide.',
          'Avoid pasting full banking passwords into the family group; use the vault for account labels.',
          'Keep a running ledger of who paid what so siblings do not argue later.',
        ],
      },
      {
        h: 'Insurance: cashless vs reimbursement (high level)',
        paras: [
          'Whether cashless works depends on network hospitals, waiting periods, and how updated the policy is. Do not assume “Papa has insurance” means the desk will approve instantly. Your map should include policy number, insurer, and TPA phone if known.',
        ],
        body: [
          'Call the insurer / TPA helpline early with policy number and hospital details.',
          'Ask the hospital billing desk what they need for cashless pre-auth.',
          'If cashless fails, track bills for reimbursement — photograph every receipt.',
          'Map LIC / health policies in peacetime so you are not searching PDFs mid-crisis.',
        ],
      },
      {
        h: 'What to prepare before the next scare',
        body: [
          'Run a calm housewarming: care phones, OTP SIM, insurance labels, spare keys.',
          'Invite a sibling unlocker so one NRI is not the single point of failure.',
          'Print or WhatsApp a fridge QR for neighbours — contacts only, not bank secrets.',
          'Agree a default “comms lead” for medical emergencies.',
        ],
      },
      {
        h: 'How HeirReady helps here',
        paras: [
          'HeirReady stores the Life Map and unlock path so siblings share one source of truth. It does not treat patients, approve claims, or replace doctors and counsel. Used well, it cuts the chaos that turns a hospital night into a second emergency.',
        ],
        body: [
          'Free: map one parent + invite siblings.',
          'Care category for maid / nurse / neighbour phones.',
          'Execution checklists later if incapacity or death starts — optional path with proof.',
        ],
      },
    ],
    cta: 'Map care + insurance before the next call — free',
  },
  {
    slug: 'nomination-vs-will-india-nri-guide',
    title: 'Nomination vs will in India: what NRI children should actually understand',
    description:
      'Clear explainer for adult children abroad — how nomination on banks, LIC, and demat differs from a will, what to map now, and when to talk to a lawyer. Not legal advice.',
    updated: '16 July 2026',
    lead:
      'NRI siblings often hear two sentences that conflict: “Everything is nominated, so we’re fine,” and “Without a will nothing moves.” Both oversimplify. Nomination and wills do different jobs across banks, insurance, demat, and property. You do not need to become an estate lawyer on a Sunday call — but you should know which nominations exist, whether they are outdated, and when the family needs counsel. This guide is educational continuity planning, not a substitute for licensed legal advice.',
    sections: [
      {
        h: 'Nomination in plain language',
        paras: [
          'A nomination tells an institution who they may pay or transfer to on death for that specific product — subject to that product’s rules. It is usually easier to update than drafting a full will. It is not always the final word on who owns the asset under succession law.',
        ],
        body: [
          'Banks, post office, LIC, EPFO, and demat all have nomination fields — they may not match each other.',
          'An outdated nominee (ex-spouse, deceased relative, wrong spelling) creates friction even when the family agrees.',
          'Joint accounts and nominations interact differently depending on “either or survivor” style mandates — verify with the bank.',
          'Mapping “nominee as recorded” in a Life Map beats arguing from memory.',
        ],
      },
      {
        h: 'Wills in plain language',
        paras: [
          'A will expresses how a person wants assets distributed and who should execute that wish. Validity, registration, probate, and challenges depend on facts and state practice. HeirReady is not a will product. If parents want a will, they should use a qualified professional.',
        ],
        body: [
          'Do not force a will conversation on the first Life Map call — it kills trust.',
          'If a will exists, map where the original is kept and who the executor is — location matters.',
          'A will that nobody can find is almost as bad as no will.',
          'For contested or large estates, retain counsel early rather than crowdsourcing law on WhatsApp.',
        ],
      },
      {
        h: 'Where families get confused',
        body: [
          'Assuming bank nomination automatically overrides every succession claim.',
          'Assuming a will is required before you can even list accounts.',
          'Updating a will but never updating LIC / demat nominees.',
          'Treating property mutation / society transfer as “the same as nomination.”',
          'NRI children rewriting parents’ wishes without the parents in the room.',
        ],
      },
      {
        h: 'What to capture in a Life Map (calm day)',
        body: [
          'For each bank / LIC / demat item: nominee name as shown, or “unknown / not updated.”',
          'Whether parents say a will exists — yes / no / won’t discuss — without interrogation.',
          'Where important packets live (locker / cupboard / CA).',
          'Advocate or CA contact if the family already has one.',
          'Sibling unlockers so discovery is shared.',
        ],
      },
      {
        h: 'When to involve a lawyer',
        paras: [
          'Use counsel when there is conflict, cross-border assets, unclear title, or parents ask for formal estate documents. HeirReady can keep the Life Map and optional counsel engagement in one family context — the lawyer still gives the legal advice.',
        ],
        body: [
          'Disagreement among siblings or between nominee and legal heirs.',
          'Property in multiple states or countries.',
          'Business ownership / partnership interests.',
          'Parents requesting will / trust / POA drafting.',
        ],
      },
      {
        h: 'Disclaimer',
        paras: [
          'Succession, nomination enforceability, and probate rules are fact-specific. This article helps families organise information. It is not legal advice and should not be relied on as a substitute for a licensed advocate.',
        ],
        body: [],
      },
    ],
    cta: 'Map nominees on a free Life Map',
  },
  {
    slug: 'power-of-attorney-india-nri-parents',
    title: 'Power of attorney in India for NRI families: when it helps, when it doesn’t',
    description:
      'Practical overview for adult children abroad considering POA for parents’ banking or property — risks, alternatives, and what to map first. Not legal advice.',
    updated: '16 July 2026',
    lead:
      '“Just make a POA” is common advice in NRI WhatsApp groups. Sometimes a power of attorney is the right tool for a specific bank or property task. Sometimes it is overkill, outdated, or dangerous in the wrong hands. Before anyone drafts anything, map what problem you are solving — hospital deposits, society paperwork, selling a flat — and talk to a qualified professional. HeirReady helps with the Life Map and sibling coordination around that decision; it does not create a POA for you.',
    sections: [
      {
        h: 'What people usually mean by POA',
        paras: [
          'A power of attorney authorises someone to act for another in defined matters. Banks and registrars care about form, attestation, and whether the document is accepted for that transaction. General internet templates are a common source of rejection and regret.',
        ],
        body: [
          'Specific POA (one bank, one sale) vs general POA — scope should match the job.',
          'Who holds the POA matters as much as the stamp paper — pick a trusted person, often a local sibling.',
          'Revocation and expiry are real operational issues; families forget to cancel old POAs.',
          'NRI execution / embassy attestation requirements depend on where the document is signed — get local advice.',
        ],
      },
      {
        h: 'Problems a POA does not magically solve',
        body: [
          'Not knowing which accounts exist — map first.',
          'OTP SIMs and UPI still needing the physical phone.',
          'Society or bank refusing a document that does not meet their checklist.',
          'Family conflict — a POA can intensify disputes if siblings disagree.',
          'Medical consent rules — do not assume a financial POA covers clinical decisions.',
        ],
      },
      {
        h: 'Safer sequence for most NRI families',
        paras: [
          'Do continuity admin before legal instruments. Many “we need a POA” moments are actually “we never wrote down the maid’s number or the OTP phone.”',
        ],
        body: [
          'Build the Life Map: banks, insurance, property location, care contacts, OTP SIM.',
          'Invite sibling unlockers; agree who is local ops.',
          'Identify the concrete task (close FD, collect papers, attend society).',
          'Then consult an advocate / bank about whether POA, joint mandate, or in-person visit is required.',
          'Store the final POA location and scope in the vault if one is executed.',
        ],
      },
      {
        h: 'Risk checklist if you proceed',
        body: [
          'Prefer narrow scope and time limits where appropriate.',
          'Keep originals safe; note who holds copies.',
          'Tell all adult siblings what was signed — secrecy breeds conflict.',
          'Revisit after major life events (death, divorce, moving countries).',
          'Never combine “full financial POA” with weak digital security on the attorney’s devices.',
        ],
      },
      {
        h: 'How HeirReady fits',
        body: [
          'Capture why a POA was discussed and what task it targets.',
          'Keep advocate contacts and document locations in the vault.',
          'Optional counsel desk for families who want an advocate on the same continuity file.',
          'Not a POA drafting service — continuity + coordination.',
        ],
      },
      {
        h: 'Disclaimer',
        paras: [
          'POA formalities, stamp duty, and acceptance by banks/registrars vary. Take advice from a licensed professional for your facts before signing or relying on any power of attorney.',
        ],
        body: [],
      },
    ],
    cta: 'Map the problem first — start a free Life Map',
  },
  {
    slug: 'after-parent-dies-india-nri-first-steps',
    title: 'After a parent dies in India: first steps for NRI sons and daughters',
    description:
      'A practical first-week continuity checklist for NRIs — certificates, bank/insurance maps, phones, rituals coordination, and sibling roles. Not legal or religious advice.',
    updated: '16 July 2026',
    lead:
      'Grief does not wait for paperwork — and paperwork does not pause for flights. Adult children abroad need a calm order of operations: secure the home and phones, obtain certificates, notify key institutions using a list that should already exist, and keep siblings aligned. This is a continuity checklist so you are not inventing steps while exhausted. It is not legal, tax, or religious advice. Rituals and succession law need your family’s practices and, when required, professionals.',
    sections: [
      {
        h: 'Immediate practical priorities',
        paras: [
          'Focus on safety, certificates, and communications. Large asset transfers can wait for the right documents; preventing lockouts and fraud cannot.',
        ],
        body: [
          'Confirm who is on the ground for hospital / home / society access.',
          'Secure phones that receive bank and DigiLocker OTPs.',
          'Begin death certificate process as guided by the hospital / local authority — keep multiple copies later.',
          'Notify closest family with one agreed message; avoid contradictory broadcasts.',
          'If a Life Map / fridge QR exists, open it — that is your directory.',
        ],
      },
      {
        h: 'Documents families typically gather (varies by case)',
        body: [
          'Death certificate copies (ask how many certified copies you may need).',
          'ID proofs of deceased and claimants.',
          'Marriage certificate / proof of relationship when institutions ask.',
          'Will location if one exists; nomination screenshots from the Life Map.',
          'Insurance policy numbers; bank list; employer / pension contacts if any.',
        ],
      },
      {
        h: 'Institutions to notify using your map',
        paras: [
          'Do not start with random branch visits. Use the Life Map inventory: banks, LIC, demat, employer, pension, society. Each has its own claim / transmission path.',
        ],
        body: [
          'Banks and post office — survivor / nominee / claim forms as applicable.',
          'Insurers — death claim intimation early.',
          'Broker / AMC — demat and folio transmission paths.',
          'Society / property tax — when ready; not always day-one.',
          'Digital: email, UPI, subscriptions — prevent misuse.',
        ],
      },
      {
        h: 'Sibling roles that reduce conflict',
        body: [
          'One local ops lead; one abroad paperwork/comms lead.',
          'Shared checklist in the vault — not parallel Excel sheets.',
          'Transparent money log for funeral and travel costs.',
          'Unlock-with-proof on HeirReady exists so the vault opens with agreed evidence — not with a password fight.',
        ],
      },
      {
        h: 'When to get professional help',
        body: [
          'Disputed nominations or sibling conflict.',
          'Business assets, large property, or cross-border estate questions.',
          'Tax filing / NRI repatriation questions — use a CA / counsel.',
          'Anything you do not understand on a bank form — ask the institution or an advocate, not a forward.',
        ],
      },
      {
        h: 'What HeirReady is for in this moment',
        paras: [
          'If the family mapped early, Execution Mode and checklists help sequence India tasks after unlock. If they did not, start capturing what you learn now so the second wave of claims is easier. HeirReady is not a funeral service, bank, or law firm.',
        ],
        body: [
          'Shared Life Map and sibling access.',
          'Encrypted storage for sensitive refs and scans.',
          'Optional counsel engagement when you need an advocate.',
        ],
      },
    ],
    cta: 'Build the map before you need it — start free',
  },
  {
    slug: 'find-parents-bank-accounts-india-nri',
    title: 'How to find your parents’ bank accounts in India (NRI guide)',
    description:
      'Step-by-step for adult children abroad: what to ask parents, where statements hide, unclaimed deposit tools, and how a Life Map prevents starting from zero.',
    updated: '16 July 2026',
    lead:
      '“How do I find all my parents’ bank accounts in India?” is one of the most common NRI searches — usually after a hospital week or a death certificate. There is no single national popup that lists every account. You combine conversation, paper trails, email/SMS archaeology, institution search tools, and patience. The winning move is to do most of that mapping while parents can still answer. This guide covers both timelines.',
    sections: [
      {
        h: 'If parents can still help (best path)',
        paras: [
          'Schedule a short video call. You type; they open apps or passbooks. Frame it as bill-pay admin from abroad, not an interrogation.',
        ],
        body: [
          'List every bank app on their phones — including ones they “don’t use.”',
          'Photograph passbook first pages / cheque books for bank name + account hints.',
          'Check email for “statement,” “OTP,” “KYC,” “FD receipt” from bank domains.',
          'Ask about post office, cooperative banks, and salary accounts from old employers.',
          'Note OTP SIM and registered email for each bank.',
          'Enter each into a shared Life Map the same day.',
        ],
      },
      {
        h: 'If you are searching after a crisis',
        paras: [
          'Start with what you can touch: phones, email, cupboards, CA files, known branches. Then use public unclaimed-deposit and institution processes. Expect incomplete results — that is why peacetime mapping matters.',
        ],
        body: [
          'Secure devices; check SMS threads for bank senders.',
          'Ask the local sibling / neighbour which branches parents visited.',
          'Check Form 26AS / AIS with a CA if you have legal access — tax trails reveal interest credits.',
          'Use bank unclaimed / dormant search flows where available (rules differ).',
          'Visit or write to likely branches with death certificate / claim docs when applicable.',
          'Track every lead in one checklist so siblings do not duplicate visits.',
        ],
      },
      {
        h: 'Clues people overlook',
        body: [
          'Auto-debit SMS for SIPs and insurance premiums naming a bank.',
          'Society maintenance cheques or UPI history.',
          'Old FD advice slips in diaries.',
          'Joint accounts with a spouse still active under a different nickname.',
          'Bank lockers — often imply a relationship account at that branch.',
        ],
      },
      {
        h: 'What not to do',
        body: [
          'Do not post Aadhaar / full account numbers in large WhatsApp groups.',
          'Do not pay random “recovery agents” who message on Instagram.',
          'Do not assume one bank’s “no account found” means no accounts exist elsewhere.',
          'Do not delay securing the OTP phone — fraud spikes when families are distracted.',
        ],
      },
      {
        h: 'Make the next search unnecessary',
        body: [
          'Finish a housewarming Life Map: banks, FDs, OTP phones, locker notes.',
          'Invite siblings so knowledge is not trapped abroad.',
          'Revisit yearly — accounts get opened quietly.',
          'Read our unclaimed / IEPF guide if old investments may have gone dormant.',
        ],
      },
      {
        h: 'How HeirReady helps',
        paras: [
          'HeirReady is the shared inventory and sibling coordination layer. It will not scrape RBI databases for you. It will make sure the accounts you do find are not lost again in a chat scroll.',
        ],
        body: [
          'Free parent Life Map + sibling invite.',
          'Encrypted notes for account refs.',
          'Checklists when execution starts after unlock-with-proof.',
        ],
      },
    ],
    cta: 'Start listing banks on a free Life Map',
  },
  {
    slug: 'legal-heir-vs-succession-certificate-india-nri',
    title: 'Legal heir certificate vs succession certificate in India: what NRI families need',
    description:
      'Plain-English guide for adult children abroad — when banks ask for a legal heir certificate vs succession certificate, what to prepare, and what to map first. Not legal advice.',
    updated: '17 July 2026',
    lead:
      'After a parent dies, bank desks and brokers often say: “Bring a legal heir certificate” or “We need a succession certificate.” Those are not the same document, and the wrong chase costs weeks. NRI siblings flying in on short leave need a clear picture of what institutions typically ask for, what your Life Map should already hold, and when to hire an advocate. This is an educational continuity guide — not legal advice for your facts.',
    sections: [
      {
        h: 'Legal heir certificate — what it usually is',
        paras: [
          'A legal heir certificate (sometimes issued by a revenue / tehsildar / municipal authority depending on state practice) lists the legal heirs of the deceased for certain administrative purposes. Families often need it for employer benefits, some local offices, and as supporting ID of relationship. Exact issuing authority and format vary by state — do not assume one PDF template works nationwide.',
        ],
        body: [
          'Used to show who the heirs are for many government / employer / local processes.',
          'Often faster than court processes when the local office’s checklist is clear.',
          'Not a universal substitute for every bank claim or every property transfer.',
          'Spellings of names must match Aadhaar / passports — mismatches stall everything.',
        ],
      },
      {
        h: 'Succession certificate — what it usually is',
        paras: [
          'A succession certificate is typically a court-issued document used to establish authority to collect debts and securities of the deceased (for example certain bank deposits, shares, or debts). Banks and companies sometimes insist on it when nomination is missing, disputed, or insufficient for their internal rules. Getting one involves court process, time, and usually a lawyer.',
        ],
        body: [
          'More formal and slower than a local legal heir certificate in most cases.',
          'Often relevant for movable assets / securities when institutions demand court authority.',
          'Not automatically the same as full probate of a will — different tracks.',
          'If nominations are clean and uncontested, some institutions may not need this — ask in writing.',
        ],
      },
      {
        h: 'Where NRI families get stuck',
        body: [
          'Assuming “legal heir = succession” and applying for the wrong thing twice.',
          'Sibling conflict — any certificate path slows or fails when heirs disagree.',
          'Missing death certificate copies and relationship proofs before the first branch visit.',
          'Outdated nominees on LIC / demat while chasing court papers for a simple nominated payout.',
          'Paying “agents” who promise same-week succession certificates online — high fraud risk.',
        ],
      },
      {
        h: 'Practical sequence before you book court time',
        paras: [
          'Inventory first. Many “we need succession” moments dissolve when you find a valid nomination, a joint survivor mandate, or the right claim form for that product.',
        ],
        body: [
          'Open the Life Map: list banks, FDs, LIC, demat, employer, pension.',
          'For each item, note nominee / joint holder status as recorded.',
          'Ask each institution in writing what document they accept for your case.',
          'Gather death certificate copies, IDs, and relationship proofs in one folder.',
          'If conflict or large estate — retain an advocate early rather than DIY forums.',
        ],
      },
      {
        h: 'What to capture in peacetime (so crisis week is shorter)',
        body: [
          'Nominee name on each bank / LIC / demat item — or “unknown.”',
          'Whether parents say a will exists and where the original is.',
          'CA / family advocate phone if any.',
          'Sibling unlockers so one NRI is not holding every PDF alone.',
          'Passport / OCI name spellings for every adult child who may appear on certificates.',
        ],
      },
      {
        h: 'How HeirReady helps — and what it does not',
        paras: [
          'HeirReady stores the shared inventory, scans, and sibling roles. It does not issue certificates, file petitions, or replace an advocate. Used early, it stops you from discovering on day three that nobody knows which bank even needs which paper.',
        ],
        body: [
          'Free Life Map + sibling invite.',
          'Encrypted notes for claim reference numbers.',
          'Optional counsel path when you need a lawyer on the same continuity file.',
        ],
      },
      {
        h: 'Disclaimer',
        paras: [
          'Certificate names, issuing authorities, and bank acceptance rules are state- and fact-specific. Confirm with the relevant office or a licensed advocate before relying on any path described here.',
        ],
        body: [],
      },
    ],
    cta: 'Map nominees and papers on a free Life Map',
  },
  {
    slug: 'bank-locker-after-death-india-nri',
    title: 'Bank locker after death in India: what NRI families should know and map',
    description:
      'How families typically approach a deceased parent’s bank safe deposit locker — nomination, inventory, documents, and what to record now. Practical guide, not legal advice.',
    updated: '17 July 2026',
    lead:
      'A steel bank locker is one of the most stressful finds after a parent dies: jewellery, property papers, wills, cash, and old passbooks may all be inside — and the bank will not casually open it for a WhatsApp forward. NRI children often learn a locker exists only when a passbook shows rent or a neighbour mentions “Papa’s locker at SBI.” Map the branch and nomination while parents can still answer. This guide covers the usual operational path families face; exact bank rules differ.',
    sections: [
      {
        h: 'Why lockers are different from savings accounts',
        paras: [
          'A locker is a bailment / custody relationship with the bank, not “just another account balance.” Access after death usually follows nomination (if registered), survivor mandates for joint hirers, or a formal claim / inventory process. Banks care about who is authorised to be present when the locker is opened.',
        ],
        body: [
          'Locker nomination is separate from account nomination — check both.',
          'Joint locker hirers may have “either or survivor” style access — verify the mandate.',
          'Banks often prepare an inventory of contents in the presence of heirs / nominees / officials as per their procedure.',
          'Losing the key or forgetting the branch wastes precious leave days.',
        ],
      },
      {
        h: 'What to ask parents on a calm video call',
        body: [
          'Which bank and which branch (full address, not “the one near the temple”).',
          'Locker number if known — or at least the customer ID / account linked to rent.',
          'Who is the nominee / joint hirer on the locker agreement.',
          'Where the keys are kept at home (and whether there is a spare).',
          'Rough contents category: jewellery only, papers, mixed — without photographing valuables into group chats.',
          'Annual rent debit account — that SMS trail often proves a locker exists.',
        ],
      },
      {
        h: 'After death: typical operational steps (varies by bank)',
        paras: [
          'Do not force the locker open at home lore. Go through the bank’s deceased-hirer process. Bring death certificate, IDs, and whatever nomination / claim forms they specify. If there is conflict among heirs, expect delay — that is when counsel matters.',
        ],
        body: [
          'Notify the branch; ask for the written checklist for deceased locker hirers.',
          'Secure keys; do not leave them with unverified helpers.',
          'Attend inventory appointment if required — plan NRI travel around that date.',
          'Photograph the bank’s inventory list for the family vault after the visit.',
          'Separately start claim paths for accounts / FDs at the same branch if linked.',
        ],
      },
      {
        h: 'Fraud and conflict risks',
        body: [
          'Unsupervised “relative opens locker first” stories — insist on bank procedure.',
          'Jewellery disputes among siblings — inventory under bank process reduces later accusations.',
          'WhatsApp photos of contents leaking outside the family.',
          'Fake “locker recovery consultants” asking for advance fees online.',
        ],
      },
      {
        h: 'Map it in HeirReady before you need it',
        body: [
          'Life Map item: bank + branch + “locker: yes” + nominee note + key location.',
          'Do not store full jewellery valuations in insecure chats.',
          'Invite a sibling unlocker who can attend the branch if you cannot fly.',
          'Link related property paper locations if the locker holds title deeds.',
        ],
      },
      {
        h: 'Disclaimer',
        paras: [
          'Locker access after death is governed by the bank’s terms, nomination rules, and applicable law for your facts. Confirm the checklist with the branch or an advocate. HeirReady does not open lockers or mediate jewellery disputes.',
        ],
        body: [],
      },
    ],
    cta: 'Add bank locker details to a free Life Map',
  },
  {
    slug: 'epf-claim-after-death-nominee-nri',
    title: 'EPF claim after death: what NRI nominees and heirs should prepare',
    description:
      'Practical checklist for claiming Employees’ Provident Fund / EPS benefits when a parent or spouse dies — UAN, nominee, documents, and what to map early. Not official EPFO advice.',
    updated: '17 July 2026',
    lead:
      'EPF balances and EPS pensions are easy to forget when a parent’s last private-sector job ended years ago — until someone finds an old UAN SMS or Form 26AS shows PF interest. For NRI children, the claim path is document-heavy and slow if the nominee is wrong or the UAN is unknown. Map UAN, employer, and nominee while the member can still log in. This is a family-operations guide based on common claim friction; always follow current EPFO / employer instructions for your case.',
    sections: [
      {
        h: 'What you are usually claiming',
        paras: [
          'Depending on the member’s status, families may deal with provident fund accumulations, EPS-related benefits, or employer-specific gratuity / insurance that sits beside EPF. Treat “Papa had PF” as a label — verify UAN, member ID, and which benefit applies after death.',
        ],
        body: [
          'UAN (Universal Account Number) is the key search handle when known.',
          'Nominee registered in EPFO may differ from bank / LIC nominees.',
          'EPS widow/widower or children pensions have separate eligibility rules — check official guidance.',
          'Old exempted trusts / company PF may not be on the same portal as EPFO — ask the last employer HR.',
        ],
      },
      {
        h: 'Peacetime capture (best ROI for NRIs)',
        body: [
          'UAN and registered mobile / email on the member account.',
          'Last employer name and HR / payroll contact if any.',
          'Nominee name as shown in the passbook / portal.',
          'Aadhaar / PAN seed status — KYC mismatches block claims.',
          'Whether the member still has the UAN app OTP phone.',
          'Store these as a Life Map item under retirement / employment.',
        ],
      },
      {
        h: 'After death: documents families commonly gather',
        paras: [
          'Exact forms change; EPFO and employers publish current checklists. Expect identity, death, and relationship proofs. NRI claimants should plan bank account details that can receive the credit and name-matching across passports.',
        ],
        body: [
          'Death certificate.',
          'Claimant ID and bank details for payout.',
          'Proof of relationship / nominee status as required.',
          'Member’s UAN / PF details from the Life Map.',
          'Any employer NOC or forms if the trust is company-managed.',
        ],
      },
      {
        h: 'Where claims stall',
        body: [
          'Unknown UAN — search via employer, old salary slips, or member’s email.',
          'Nominee is deceased or never updated after remarriage / divorce.',
          'Aadhaar name mismatch with bank account.',
          'Multiple UANs never merged.',
          'Family filing overlapping claims without coordination.',
        ],
      },
      {
        h: 'NRI-specific practical tips',
        body: [
          'Appoint a local sibling or trusted person for physical form submission if required.',
          'Keep one shared checklist — do not run parallel claims from two countries.',
          'Do not share UAN passwords in large groups; use the vault for refs.',
          'Track acknowledgement / claim numbers in the Life Map notes.',
        ],
      },
      {
        h: 'How HeirReady fits',
        paras: [
          'HeirReady is where the UAN, employer, and nominee facts live for every sibling. It does not file EPFO claims or replace the member portal. Combined with unlock-with-proof later, it stops the “which UAN was it?” week.',
        ],
        body: [
          'Map PF / EPS as a vault item with encrypted refs.',
          'Invite sibling managers for shared follow-up.',
          'Link related insurance / gratuity items from the same employer.',
        ],
      },
      {
        h: 'Disclaimer',
        paras: [
          'EPFO rules, forms, and EPS eligibility change. Use official EPFO / employer channels for filing. This article helps families organise information; it is not official EPFO guidance or legal advice.',
        ],
        body: [],
      },
    ],
    cta: 'Add UAN and nominee to a free Life Map',
  },
  {
    slug: 'property-mutation-after-death-india-nri',
    title: 'Property mutation after death in India: an NRI heir’s practical checklist',
    description:
      'What adult children abroad should know about mutating / transferring a deceased parent’s property records — papers to gather, society vs municipal steps, and what to map early. Not legal advice.',
    updated: '17 July 2026',
    lead:
      '“Mutation” is the administrative updating of land / property records to reflect a new owner after death or transfer. It is not the same as a sale deed, and it is not automatic when a will exists. NRI heirs often face society NOCs, municipal / revenue offices, name mismatches, and sibling disagreements — usually while still hunting the original sale deed. Map title papers and society contacts before the crisis. This guide is operational orientation, not conveyancing advice.',
    sections: [
      {
        h: 'Mutation vs ownership — keep them straight',
        paras: [
          'Title comes from registered documents and succession law / will processes as applicable. Mutation updates revenue or municipal records for tax and local administration. Families sometimes mutate without resolving disputes — or resolve succession but forget mutation and keep getting tax notices in the deceased’s name.',
        ],
        body: [
          'Find the registered sale deed / gift deed / allotment letter first.',
          'Check whether property is freehold, leasehold, society flat, or builder allotment — paths differ.',
          'Society share certificate transfer is often a parallel track to municipal mutation.',
          'Agricultural land and urban flats can have completely different offices.',
        ],
      },
      {
        h: 'Papers NRI families should locate early',
        body: [
          'Registered title deed and previous chain if available.',
          'Society share certificate / allotment / maintenance account name.',
          'Property tax receipts and assessment number.',
          'Encumbrance certificate habits — know which Sub-Registrar covers the property.',
          'Will / probate status if relevant; legal heir / succession docs when offices demand them.',
          'Khata / property ID / survey numbers as used locally.',
        ],
      },
      {
        h: 'Typical friction points',
        body: [
          'Deed in a bank locker nobody mapped.',
          'Name spelling differs across deed, Aadhaar, and passport.',
          'Unpaid society dues blocking transfer.',
          'Co-owners / siblings not signing required forms.',
          'Power of attorney assumptions that the society or registrar rejects.',
          'NRI heir unable to appear in person when the office insists.',
        ],
      },
      {
        h: 'Sensible order of operations',
        paras: [
          'Secure the home and papers, align siblings, then follow the society and local authority checklists. Do not start with random “mutation agents” on Instagram who ask for scans of every heir’s passport.',
        ],
        body: [
          'Inventory documents into the Life Map (location + scan if parents agree).',
          'Ask the society secretary for the written transfer checklist.',
          'Ask the municipal / revenue office what they need for mutation after death.',
          'Engage a local advocate / conveyancer when the file is non-standard or contested.',
          'Track application numbers and receipts in one shared vault.',
        ],
      },
      {
        h: 'What to map while parents are well',
        body: [
          'Every property: city, society name, approximate value band optional, deed location.',
          'Secretary / manager phone for the society.',
          'Whether a will mentions the flat — without forcing the will talk on day one.',
          'Who pays property tax and from which account.',
          'Sibling unlocker who can visit offices if you cannot.',
        ],
      },
      {
        h: 'How HeirReady helps',
        paras: [
          'HeirReady holds the property inventory, contacts, and scans so heirs are not reconstructing a title chase from memory. It does not mutate records or replace a registrar. Optional counsel can sit on the same family file when you need an advocate.',
        ],
        body: [
          'Property category on the Life Map.',
          'Encrypted storage for deed scans.',
          'Shared sibling checklist during transfer.',
        ],
      },
      {
        h: 'Disclaimer',
        paras: [
          'Mutation, stamp, registration, and succession requirements are fact- and state-specific. Take advice from a licensed professional before filing or paying anyone to “fast-track” mutation.',
        ],
        body: [],
      },
    ],
    cta: 'Map property papers on a free Life Map',
  },
  {
    slug: 'death-certificate-india-nri-how-to-get',
    title: 'How to get a death certificate in India when you’re an NRI',
    description:
      'First-week guide for adult children abroad — hospital vs municipal registration, copies you’ll need, common delays, and what to prepare. Practical continuity, not legal advice.',
    updated: '17 July 2026',
    lead:
      'Almost every bank, insurer, EPFO, and society process after a death starts with the death certificate. For NRI sons and daughters, the certificate is often obtained by a local sibling, hospital desk, or funeral organiser while you are still on a flight. Knowing who registers the death, how many copies to request, and which spellings must match Aadhaar saves a second trip. This is a practical continuity checklist — registration rules and portals differ by state and municipality.',
    sections: [
      {
        h: 'Who typically starts the registration',
        paras: [
          'If the death occurred in a hospital, the facility often initiates medical documentation and guides the family toward municipal / local body registration. If the death occurred at home, the family usually works with the local registrar / municipal office with the required medical certificate. Confirm the local checklist — do not rely on a pan-India WhatsApp forward.',
        ],
        body: [
          'Hospital deaths: ask the billing / medical records desk what they issue and what you must file next.',
          'Home deaths: identify the correct local registrar early; wrong office = wasted day.',
          'Appoint one local ops person; abroad siblings supply passport name spellings by scan.',
          'Keep the deceased’s Aadhaar / voter / ration details handy for form fields.',
        ],
      },
      {
        h: 'How many copies and why',
        paras: [
          'Families underestimate copy count. Banks, LIC, demat, employer, society, and passport offices may each want a certified copy or attested photocopy. Ask the issuing office about additional certified copies while you are there — returning from abroad for one more stamp is painful.',
        ],
        body: [
          'Request multiple certified copies up front when the office allows.',
          'Scan one clear colour copy into the family vault immediately.',
          'Never send the only original through unreliable couriers without tracking.',
          'Note the registration number / certificate number in the Life Map.',
        ],
      },
      {
        h: 'Name and detail mismatches that block later claims',
        body: [
          'Deceased name spelling vs bank KYC / Aadhaar.',
          'Wrong date or place of death vs hospital records.',
          'Parent / spouse name fields that disagree with old passbooks.',
          'Address that does not match society or bank records — fix via the proper correction process, not Tippex.',
        ],
      },
      {
        h: 'NRI coordination checklist',
        body: [
          'Share passport / OCI name strings for every heir who will appear on later certificates.',
          'Use one shared folder for scans — not six WhatsApp threads.',
          'If you need the certificate apostilled / attested for a foreign process, ask counsel which stamp path applies — it is separate from municipal issue.',
          'Do not pay unknown “online certificate agents” your Aadhaar OTP.',
        ],
      },
      {
        h: 'After you have the certificate — what the Life Map unlocks',
        paras: [
          'The certificate is the key that starts institution notices. Your Life Map should already list banks, LIC, EPF, demat, and society contacts so you are not inventing the distribution list under grief.',
        ],
        body: [
          'Open the inventory and tick who was notified.',
          'Secure OTP phones and home access in parallel.',
          'Start insurer intimations early where applicable.',
          'See our after-parent-dies and bank-discovery guides for the next wave of tasks.',
        ],
      },
      {
        h: 'How HeirReady helps',
        body: [
          'Store certificate scans and registration numbers encrypted in the vault.',
          'Shared sibling checklist for who holds originals.',
          'Fridge QR / unlockers so local helpers know who to call — not bank secrets.',
          'Not a government registration portal — continuity and coordination.',
        ],
      },
      {
        h: 'Disclaimer',
        paras: [
          'Birth and death registration is governed by local law and municipal practice. Confirm steps with the hospital and the competent local authority. HeirReady does not issue death certificates.',
        ],
        body: [],
      },
    ],
    cta: 'Build the family map before you need certificates — free',
  },
];

export function getGuide(slug) {
  return GUIDES.find((g) => g.slug === slug) || null;
}

function usePageMeta({ title, description, path }) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = `${title} — HeirReady`;
    let meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute('content') || '';
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', description);

    let canonical = document.querySelector('link[rel="canonical"]');
    const prevCanon = canonical?.getAttribute('href') || '';
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', `https://heirready.com${path}`);

    return () => {
      document.title = prevTitle;
      if (meta) meta.setAttribute('content', prevDesc);
      if (canonical) canonical.setAttribute('href', prevCanon || 'https://heirready.com/');
    };
  }, [title, description, path]);
}

const ctaStyle = {
  display: 'inline-block',
  marginTop: '0.35rem',
  textDecoration: 'none',
};

export function GuidesIndex() {
  usePageMeta({
    title: 'Guides for adult children abroad',
    description:
      'Practical guides for NRI families — parent documents, LIC, EPF, bank lockers, legal heir certificates, property mutation, death certificates, caregivers, OTP/UPI. Start free on HeirReady.',
    path: '/guides',
  });

  return (
    <section style={{ padding: '1rem 0 3rem', maxWidth: 720 }}>
      <h1 className="display" style={{ fontSize: '2.1rem', marginTop: 0 }}>
        Guides
      </h1>
      <p className="muted" style={{ marginTop: 0, lineHeight: 1.55 }}>
        Short, practical guides for adult children abroad — written to be useful, not thin. Not legal
        advice; coordination so siblings aren’t guessing on WhatsApp.
      </p>
      <div style={{ display: 'grid', gap: '0.85rem', marginTop: '1.25rem' }}>
        {GUIDES.map((g) => (
          <Link
            key={g.slug}
            to={`/guides/${g.slug}`}
            className="card"
            style={{ padding: '1.1rem 1.2rem', textDecoration: 'none', color: 'inherit', display: 'block' }}
          >
            <strong style={{ fontSize: '1.1rem' }}>{g.title}</strong>
            <p className="small muted" style={{ margin: '0.4rem 0 0', lineHeight: 1.5 }}>
              {g.description}
            </p>
          </Link>
        ))}
      </div>
      <p style={{ marginTop: '1.5rem' }}>
        <Link className="btn btn-primary" style={ctaStyle} to="/auth?mode=register">
          Start free — map one parent
        </Link>
      </p>
    </section>
  );
}

export function GuideArticle() {
  const { slug } = useParams();
  const guide = getGuide(slug);

  usePageMeta({
    title: guide?.title || 'Guide',
    description: guide?.description || 'HeirReady guides for adult children abroad.',
    path: guide ? `/guides/${guide.slug}` : '/guides',
  });

  if (!guide) return <Navigate to="/guides" replace />;

  return (
    <article className="card" style={{ padding: '1.5rem 1.45rem', margin: '1rem 0 3rem', maxWidth: 720 }}>
      <p className="small muted" style={{ margin: 0 }}>
        <Link to="/guides">Guides</Link> · Updated {guide.updated}
      </p>
      <h1 className="display" style={{ fontSize: '1.95rem', margin: '0.45rem 0 0.75rem' }}>
        {guide.title}
      </h1>
      <p style={{ lineHeight: 1.6, color: 'var(--ink-soft)' }}>{guide.lead}</p>

      {guide.sections.map((s) => (
        <section key={s.h} style={{ marginTop: '1.35rem' }}>
          <h2 className="display" style={{ fontSize: '1.25rem', margin: '0 0 0.5rem' }}>
            {s.h}
          </h2>
          {(s.paras || []).map((p) => (
            <p key={p.slice(0, 48)} style={{ lineHeight: 1.6, color: 'var(--ink-soft)', margin: '0 0 0.65rem' }}>
              {p}
            </p>
          ))}
          {s.body?.length ? (
            <ul style={{ margin: 0, paddingLeft: '1.15rem', lineHeight: 1.55 }}>
              {s.body.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}

      <div
        style={{
          marginTop: '1.75rem',
          padding: '1.1rem 1.15rem',
          borderRadius: 12,
          border: '1px solid rgba(47, 107, 82, 0.35)',
          background: 'rgba(220, 232, 225, 0.45)',
        }}
      >
        <strong>{guide.cta}</strong>
        <p className="small muted" style={{ margin: '0.4rem 0 0.85rem', lineHeight: 1.5 }}>
          Free for one parent. Solo setup is fine — fridge QR + sibling invite without a sales call.
        </p>
        <Link className="btn btn-primary" style={ctaStyle} to="/auth?mode=register">
          Start free
        </Link>
        <Link className="btn btn-ghost" style={{ ...ctaStyle, marginLeft: '0.5rem' }} to="/pricing">
          See pricing
        </Link>
      </div>

      <p className="small muted" style={{ marginTop: '1.25rem' }}>
        Not a will. Not a bank. Not a substitute for licensed legal advice.
      </p>
    </article>
  );
}
