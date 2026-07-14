import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

/**
 * Core reason HeirReady exists: after a death, siblings aren’t in chaos —
 * banks, LIC, keys, unlockers, and first steps are already mapped.
 */
const SCENES = [
  {
    id: 'why',
    kicker: 'Why HeirReady exists',
    title: 'When someone dies, families drown in WhatsApp chaos.',
    body: 'Which bank? Which LIC? Who has the flat keys? Who’s the unlocker? Nobody wrote it down. Everyone guesses. That’s the chaos this app is built to stop.',
    visual: 'chaos',
  },
  {
    id: 'promise',
    kicker: 'The promise',
    title: 'Map Mum or Dad’s life once — so death doesn’t create a scavenger hunt.',
    body: 'You’re abroad. Papers stay in India. HeirReady is the sibling vault you fill while they’re alive — so when something happens, you’re not starting from zero.',
    visual: 'abroad',
  },
  {
    id: 'core',
    kicker: 'What the app actually is',
    title: 'One Life Map vault per parent: banks, LIC, property, keys, caregivers.',
    body: 'Siblings share that one map. Parents don’t need an account. It’s continuity — not a will, not a bank, not an advice forum.',
    visual: 'map',
  },
  {
    id: 'unlock',
    kicker: 'When it matters',
    title: 'Appointed unlockers open Execution Mode with proof.',
    body: 'India — or India+US / India+UK — tasks appear in order. Fridge QR shows unlockers + care phones (not bank passwords). Banks still run their own nominee process.',
    visual: 'unlock',
  },
  {
    id: 'how',
    kicker: 'What you do now',
    title: 'Create their map → finish housewarming → WhatsApp one sibling.',
    body: 'Solo is fine. Fill banks later when they’re free. Your job this week: one parent vault that isn’t empty when the worst day comes.',
    visual: 'warm',
  },
  {
    id: 'cta',
    kicker: 'Start before you need it',
    title: 'Build the vault while they’re here. Use it when they’re not.',
    body: 'Free for one parent file. Invite siblings. Upgrade when the vault grows. Not legal advice — practical continuity for adult children abroad.',
    visual: 'ready',
  },
];

function estimateSpeechMs(scene) {
  const words = `${scene.title} ${scene.body}`.split(/\s+/).filter(Boolean).length;
  return Math.min(22000, Math.max(6500, Math.round(words * 430)));
}

function pickVoice() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null;
  const ranked = voices.filter((v) => /^en/i.test(v.lang));
  const prefer =
    ranked.find((v) => /en-IN/i.test(v.lang)) ||
    ranked.find((v) => /en-GB/i.test(v.lang) && /female|susan|serena|fiona|google/i.test(v.name)) ||
    ranked.find((v) => /Samantha|Karen|Moira|Google UK|Natural/i.test(v.name)) ||
    ranked.find((v) => /en-GB|en-US/i.test(v.lang)) ||
    ranked[0] ||
    voices[0];
  return prefer || null;
}

function speakScene(scene) {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return Promise.resolve();
  }
  window.speechSynthesis.cancel();
  return new Promise((resolve) => {
    const line = `${scene.kicker}. ${scene.title} ${scene.body}`;
    const u = new SpeechSynthesisUtterance(line);
    u.rate = 0.94;
    u.pitch = 1;
    u.volume = 1;
    const voice = pickVoice();
    if (voice) u.voice = voice;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    u.onend = finish;
    u.onerror = finish;
    window.speechSynthesis.speak(u);
    // Safety if onend never fires (some browsers)
    window.setTimeout(finish, estimateSpeechMs(scene) + 2500);
  });
}

/** Soft drone pad — no external audio files. */
function createAmbientPad() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  const makeTone = (freq, type, level) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = type;
    osc.frequency.value = freq;
    filter.type = 'lowpass';
    filter.frequency.value = 680;
    gain.gain.value = level;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start();
    return { osc, gain, filter };
  };

  makeTone(98, 'sine', 0.22);
  makeTone(146.83, 'sine', 0.14);
  makeTone(196, 'triangle', 0.05);

  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.07;
  lfoGain.gain.value = 0.012;
  lfo.connect(lfoGain);
  lfoGain.connect(master.gain);
  lfo.start();

  return {
    ctx,
    async resume() {
      if (ctx.state === 'suspended') await ctx.resume();
    },
    setLevel(level, duck = false) {
      const target = duck ? level * 0.35 : level;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.linearRampToValueAtTime(Math.max(0, target), now + 0.35);
    },
    async stop() {
      try {
        await ctx.close();
      } catch {
        /* ignore */
      }
    },
  };
}

function SceneArt({ kind }) {
  return (
    <div className={`tour-art tour-art-${kind}`} aria-hidden>
      {kind === 'chaos' && (
        <div className="tour-art-chaos">
          {['Which bank?', 'LIC where?', 'Keys??', 'Who unlocks?'].map((t) => (
            <div key={t} className="tour-art-bubble">
              {t}
            </div>
          ))}
        </div>
      )}
      {kind === 'abroad' && (
        <>
          <div className="tour-art-orbit" />
          <div className="tour-art-card tour-art-card-a">You’re abroad</div>
          <div className="tour-art-card tour-art-card-b">Life stays in India</div>
          <div className="tour-art-link" />
        </>
      )}
      {kind === 'map' && (
        <>
          <div className="tour-art-sheet">
            <span>Continuity vault</span>
            <strong>Dad’s Life Map</strong>
            <em>Bank · LIC · Keys · Care</em>
          </div>
          <div className="tour-art-chip">Shared by siblings</div>
        </>
      )}
      {kind === 'unlock' && (
        <div className="tour-art-unlock">
          <div className="tour-art-unlock-badge">Execution Mode</div>
          <p>Proof uploaded · Unlockers notified</p>
          <div className="tour-art-items" style={{ margin: '0.85rem 0 0', width: '100%' }}>
            {[
              ['1', 'Notify bank / nominee'],
              ['2', 'LIC claim path'],
              ['3', 'Keys + local contact'],
            ].map(([n, t]) => (
              <div key={n} className="tour-art-item">
                <span>{n}</span>
                {t}
              </div>
            ))}
          </div>
        </div>
      )}
      {kind === 'warm' && (
        <div className="tour-art-checks">
          {['Create map', 'Housewarming', 'Fridge QR', 'Invite sibling'].map((label, i) => (
            <div key={label} className={`tour-art-check${i < 3 ? ' ok' : ''}`}>
              <span>{i < 3 ? '✓' : '○'}</span> {label}
            </div>
          ))}
        </div>
      )}
      {kind === 'ready' && (
        <div className="tour-art-ready">
          <div className="tour-art-ready-ring" />
          <strong>Ready before the worst day.</strong>
        </div>
      )}
    </div>
  );
}

export default function Tour() {
  const { user } = useAuth();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [soundOn, setSoundOn] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [musicOn, setMusicOn] = useState(true);
  const ambientRef = useRef(null);
  const speakGen = useRef(0);

  const scene = SCENES[index];
  const duration = estimateSpeechMs(scene);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return undefined;
    window.speechSynthesis.getVoices();
    const onVoices = () => window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', onVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', onVoices);
      window.speechSynthesis.cancel();
      ambientRef.current?.stop?.();
      ambientRef.current = null;
    };
  }, []);

  useEffect(() => {
    const pad = ambientRef.current;
    if (!pad) return;
    if (soundOn && musicOn && playing) {
      pad.resume().then(() => pad.setLevel(0.048, voiceOn)).catch(() => {});
    } else {
      pad.setLevel(0);
    }
  }, [soundOn, musicOn, playing, voiceOn]);

  useEffect(() => {
    if (!playing) {
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
      return undefined;
    }

    setProgress(0);
    const started = performance.now();
    const gen = ++speakGen.current;
    let cancelled = false;
    let frame;

    const tick = (now) => {
      if (cancelled) return;
      const p = Math.min(1, (now - started) / duration);
      setProgress(p);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    (async () => {
      const pad = ambientRef.current;
      if (pad && soundOn && musicOn) {
        try {
          await pad.resume();
          pad.setLevel(0.048, soundOn && voiceOn);
        } catch {
          /* ignore */
        }
      }

      if (soundOn && voiceOn) {
        await speakScene(scene);
      } else {
        await new Promise((r) => setTimeout(r, duration));
      }

      if (cancelled || speakGen.current !== gen) return;
      await new Promise((r) => setTimeout(r, 700));
      if (cancelled || speakGen.current !== gen) return;
      setIndex((i) => (i + 1) % SCENES.length);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.speechSynthesis?.cancel();
    };
  }, [index, playing, soundOn, voiceOn, duration, scene]);

  async function enableSoundAndPlay() {
    if (!ambientRef.current) {
      ambientRef.current = createAmbientPad();
    }
    try {
      await ambientRef.current?.resume?.();
      if (musicOn) ambientRef.current?.setLevel(0.048, voiceOn);
    } catch {
      /* ignore */
    }
    setSoundOn(true);
    setPlaying(true);
  }

  function go(i) {
    speakGen.current += 1;
    window.speechSynthesis?.cancel();
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
          <p className="tour-top-note">Why this exists · what it does · what you do</p>
        </div>

        {!soundOn && (
          <div className="tour-sound-gate">
            <p>
              <strong>Hear the story</strong> — soft music + voiceover for each scene.
            </p>
            <button type="button" className="btn btn-primary" onClick={enableSoundAndPlay}>
              Enable sound & play
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setSoundOn(false);
                setVoiceOn(false);
                setMusicOn(false);
                setPlaying(true);
              }}
            >
              Play without sound
            </button>
          </div>
        )}

        <div className="tour-frame" key={scene.id}>
          <div className="tour-copy">
            <p className="tour-kicker">{scene.kicker}</p>
            <h1 className="tour-title display">{scene.title}</h1>
            <p className="tour-body">{scene.body}</p>
          </div>
          <SceneArt kind={scene.visual} />
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
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                if (!playing && !soundOn) {
                  enableSoundAndPlay();
                  return;
                }
                setPlaying((p) => {
                  const next = !p;
                  if (!next) window.speechSynthesis?.cancel();
                  return next;
                });
              }}
            >
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
            <button
              type="button"
              className={`btn btn-ghost${voiceOn && soundOn ? '' : ''}`}
              disabled={!soundOn}
              onClick={() => {
                setVoiceOn((v) => {
                  const next = !v;
                  if (!next) window.speechSynthesis?.cancel();
                  return next;
                });
              }}
              title="Voiceover"
            >
              Voice {voiceOn && soundOn ? 'on' : 'off'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!soundOn}
              onClick={() => setMusicOn((m) => !m)}
              title="Background music"
            >
              Music {musicOn && soundOn ? 'on' : 'off'}
            </button>
            <Link className="btn btn-primary" to={startHref}>
              {user ? 'Open my estates' : 'Start their Life Map'}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
