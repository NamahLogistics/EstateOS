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
      'If your parents are in India and you are abroad, the hard part is not “getting documents someday.” It’s knowing which ones exist, who has the keys, and who to call — before something happens.',
    sections: [
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
      'Practical checklists for NRI families — parent documents, LIC, sibling unlockers, fridge QR. Start free on HeirReady.',
    path: '/guides',
  });

  return (
    <section style={{ padding: '1rem 0 3rem', maxWidth: 720 }}>
      <h1 className="display" style={{ fontSize: '2.1rem', marginTop: 0 }}>
        Guides
      </h1>
      <p className="muted" style={{ marginTop: 0, lineHeight: 1.55 }}>
        Short checklists for adult children abroad. Not legal advice — coordination so siblings aren’t
        guessing on WhatsApp.
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
          <ul style={{ margin: 0, paddingLeft: '1.15rem', lineHeight: 1.55 }}>
            {s.body.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
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
