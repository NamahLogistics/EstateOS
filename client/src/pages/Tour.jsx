import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const SCENES = [
  {
    id: 'hook',
    kicker: 'HeirReady',
    title: 'Mum and Dad’s life admin — shared by siblings who live abroad.',
    body: 'Banks, LIC, keys, caregivers. One quiet vault. Not an advice forum. Not for inviting parents onto the app.',
    visual: 'abroad',
  },
  {
    id: 'what',
    kicker: 'What it is',
    title: 'A Life Map for one parent — then invite the people who already help.',
    body: 'You own the vault. Siblings join that map only. Limits follow the owner’s plan. Gift upgrades unlock the shared vault for everyone.',
    visual: 'map',
  },
  {
    id: 'step1',
    kicker: 'Step 1',
    title: 'Start free. Create an account.',
    body: 'Two minutes. Use any email. You’re the adult child (or sibling) — parents don’t need logins.',
    visual: 'signup',
  },
  {
    id: 'step2',
    kicker: 'Step 2',
    title: 'Open a Life Map for Mum or Dad.',
    body: 'Name them. Pick India (or a diaspora pack if you’re abroad). That file is Vault 1 on your estates list.',
    visual: 'create',
  },
  {
    id: 'step3',
    kicker: 'Step 3',
    title: 'Finish housewarming — even Solo.',
    body: 'Banks · care · papers · fridge QR. You can fill details later. Solo still completes the aha so the vault feels real.',
    visual: 'warm',
  },
  {
    id: 'step4',
    kicker: 'Step 4',
    title: 'WhatsApp a sibling.',
    body: 'They tap the link → make an account → Accept. They land inside that vault as manager — add what they know. Same map only.',
    visual: 'invite',
  },
  {
    id: 'step5',
    kicker: 'Step 5',
    title: 'Grow the vault together.',
    body: 'Add banks, LIC, deeds, caregiver phones. Hit the free limit? Upgrade — or a sibling gifts Family so this vault stays unlocked.',
    visual: 'vault',
  },
  {
    id: 'cta',
    kicker: 'Ready',
    title: 'Start with one parent file. Invite one sibling.',
    body: 'That’s the whole job for week one. Later: your own Life Map for your kids, counsel retain, city care when it’s live.',
    visual: 'ready',
  },
];

const DURATIONS = [5200, 5600, 4800, 5200, 5600, 5800, 5600, 7000];

function SceneArt({ kind, active }) {
  return (
    <div className={`tour-art tour-art-${kind}${active ? ' is-on' : ''}`} aria-hidden>
      {kind === 'abroad' && (
        <>
          <div className="tour-art-orbit" />
          <div className="tour-art-card tour-art-card-a">US / UK / Gulf</div>
          <div className="tour-art-card tour-art-card-b">Parents in India</div>
          <div className="tour-art-link" />
        </>
      )}
      {kind === 'map' && (
        <>
          <div className="tour-art-sheet">
            <span>Vault 1</span>
            <strong>Dad’s Life Map</strong>
            <em>Bank · LIC · Keys · Care</em>
          </div>
          <div className="tour-art-chip">Siblings only</div>
        </>
      )}
      {kind === 'signup' && (
        <div className="tour-art-form">
          <div className="tour-art-field" />
          <div className="tour-art-field" />
          <div className="tour-art-cta-pill">Start free</div>
        </div>
      )}
      {kind === 'create' && (
        <div className="tour-art-create">
          <div className="tour-art-num">1</div>
          <div>
            <strong>New parent file</strong>
            <p>Ramesh Kumar · Father · India</p>
          </div>
        </div>
      )}
      {kind === 'warm' && (
        <div className="tour-art-checks">
          {['Banks', 'Care', 'Papers', 'Fridge QR'].map((label, i) => (
            <div key={label} className={`tour-art-check${i < 2 ? ' ok' : ''}`}>
              <span>{i < 2 ? '✓' : '○'}</span> {label}
            </div>
          ))}
        </div>
      )}
      {kind === 'invite' && (
        <div className="tour-art-wa">
          <p>
            Hi — I’ve finished housewarming for Dad.
            <br />
            Join and add what you know:
          </p>
          <div className="tour-art-wa-link">heirready.com/invite/…</div>
        </div>
      )}
      {kind === 'vault' && (
        <div className="tour-art-items">
          {[
            ['1', 'HDFC savings'],
            ['2', 'LIC Jeevan'],
            ['3', 'Flat keys — Maya'],
          ].map(([n, t]) => (
            <div key={n} className="tour-art-item">
              <span>{n}</span>
              {t}
            </div>
          ))}
        </div>
      )}
      {kind === 'ready' && (
        <div className="tour-art-ready">
          <div className="tour-art-ready-ring" />
          <strong>One vault. One sibling. Done.</strong>
        </div>
      )}
    </div>
  );
}

export default function Tour() {
  const { user } = useAuth();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);

  const scene = SCENES[index];
  const duration = DURATIONS[index] || 5000;

  useEffect(() => {
    if (!playing) return undefined;
    setProgress(0);
    const started = performance.now();
    let frame;
    const tick = (now) => {
      const p = Math.min(1, (now - started) / duration);
      setProgress(p);
      if (p >= 1) {
        setIndex((i) => (i + 1) % SCENES.length);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [index, playing, duration]);

  function go(i) {
    setIndex(i);
    setProgress(0);
  }

  const startHref = user ? '/app' : '/auth?mode=register';

  return (
    <section className="tour-stage" aria-label="HeirReady product tour">
      <div className="tour-glow" aria-hidden />
      <div className="tour-shell">
        <div className="tour-top">
          <Link to="/" className="tour-brand">
            HeirReady
          </Link>
          <p className="tour-top-note">~45 second walkthrough · what it is · what you do</p>
        </div>

        <div className="tour-frame" key={scene.id}>
          <div className="tour-copy">
            <p className="tour-kicker">{scene.kicker}</p>
            <h1 className="tour-title display">{scene.title}</h1>
            <p className="tour-body">{scene.body}</p>
          </div>
          <SceneArt kind={scene.visual} active />
        </div>

        <div className="tour-controls">
          <div className="tour-progress-track" aria-hidden>
            <div className="tour-progress-fill" style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="tour-dots">
            {SCENES.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={`tour-dot${i === index ? ' active' : ''}`}
                aria-label={`Scene ${i + 1}: ${s.kicker}`}
                onClick={() => go(i)}
              />
            ))}
          </div>
          <div className="tour-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setPlaying((p) => !p)}>
              {playing ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => go((index + SCENES.length - 1) % SCENES.length)}
            >
              Back
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => go((index + 1) % SCENES.length)}>
              Next
            </button>
            <Link className="btn btn-primary" to={startHref}>
              {user ? 'Open my estates' : 'Start free'}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
