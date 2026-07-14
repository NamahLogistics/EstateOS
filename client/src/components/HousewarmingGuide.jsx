import { useMemo, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { track } from '../analytics.js';

export default function HousewarmingGuide({ estateId, guide, onUpdated, onOpenTab, onCompleted }) {
  const { api, toast } = useAuth();
  const [busy, setBusy] = useState(false);

  const steps = guide?.steps || [];
  const progress = guide?.progress || { completedSteps: [], currentStepId: steps[0]?.id };
  const completed = new Set(progress.completedSteps || []);

  const active = useMemo(() => {
    const cur =
      steps.find((s) => s.id === progress.currentStepId) ||
      steps.find((s) => !completed.has(s.id)) ||
      steps[0];
    return cur;
  }, [steps, progress.currentStepId, completed]);

  if (!guide || progress.dismissed || progress.completedAt) {
    return null;
  }

  async function markStep(stepId, opts = {}) {
    setBusy(true);
    try {
      const res = await api(`/api/estates/${estateId}/housewarming`, {
        method: 'POST',
        body: { stepId, ...opts },
      });
      onUpdated?.(res);
      if (opts.completeAll || opts.soloFastTrack) {
        track('housewarming_solo_or_finish', { estateId, solo: Boolean(opts.soloFastTrack) });
      } else if (opts.complete) {
        track('housewarming_step', { estateId, stepId });
      }
      if (res.justCompleted || res.housewarming?.progress?.completedAt) {
        toast('Housewarming complete — invite a sibling next');
        onCompleted?.(res);
      } else {
        toast(opts.completeAll || opts.soloFastTrack ? 'Housewarming complete' : 'Step saved');
      }
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  const meta = guide.meta || {};

  return (
    <div className="split" style={{ marginBottom: '1.25rem' }}>
      <div className="card" style={{ padding: '1.2rem' }}>
        <p
          className="small muted"
          style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}
        >
          Child-led · solo OK · {meta.duration || '~20 min'}
        </p>
        <h2 className="display" style={{ fontSize: '1.75rem', margin: '0.25rem 0 0.5rem' }}>
          {meta.title || 'Digital Housewarming'}
        </h2>
        <p style={{ marginTop: 0, color: 'var(--ink-soft)' }}>{meta.framing}</p>

        <div
          style={{
            marginTop: '1rem',
            padding: '0.95rem 1rem',
            borderRadius: 12,
            background: 'rgba(220, 232, 225, 0.65)',
            border: '1px solid rgba(47, 107, 82, 0.35)',
          }}
        >
          <strong>Solo right now? Fine.</strong>
          <p className="small muted" style={{ margin: '0.35rem 0 0.75rem', lineHeight: 1.5 }}>
            Get the fridge QR + family invite link in one tap. Fill banks and care phones later — or on a
            call with Mum/Dad when you have them.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => markStep(active?.id || 'create', { soloFastTrack: true, completeAll: true })}
          >
            Solo — show fridge QR + invite link
          </button>
        </div>

        <div
          style={{
            marginTop: '1rem',
            padding: '0.85rem 1rem',
            borderRadius: 12,
            background: 'rgba(44, 77, 60, 0.08)',
            border: '1px solid var(--line)',
          }}
        >
          <div className="small muted" style={{ fontWeight: 700 }}>
            Or open the call with
          </div>
          <p style={{ margin: '0.35rem 0 0', whiteSpace: 'pre-wrap' }}>{meta.openWith?.en}</p>
          {meta.openWith?.hi && (
            <p className="small muted" style={{ margin: '0.5rem 0 0' }}>
              {meta.openWith.hi}
            </p>
          )}
        </div>

        {meta.avoid?.length > 0 && (
          <p className="small muted" style={{ marginTop: '0.85rem' }}>
            Avoid: {meta.avoid.join(' · ')}
          </p>
        )}

        <div style={{ marginTop: '1.1rem' }}>
          <div className="small muted" style={{ marginBottom: '0.4rem' }}>
            Progress · {guide.percent || 0}%
          </div>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {steps.map((s) => {
              const done = completed.has(s.id);
              const isActive = active?.id === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`tab ${isActive ? 'active' : ''}`}
                  style={{
                    opacity: done ? 1 : 0.75,
                    textDecoration: done ? 'line-through' : 'none',
                  }}
                  onClick={() => markStep(s.id, { setCurrent: true })}
                >
                  {s.order}. {s.title}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {active && (
        <div className="card" style={{ padding: '1.2rem' }}>
          <p className="small muted" style={{ margin: 0 }}>
            Step {active.order} of {steps.length}
          </p>
          <p className="display" style={{ fontSize: '1.45rem', margin: '0.2rem 0 0.75rem' }}>
            {active.title}
          </p>

          <div className="field">
            <label>You do</label>
            <p style={{ margin: 0 }}>{active.childDoes}</p>
          </div>
          <div className="field">
            <label>Say aloud</label>
            <p
              style={{
                margin: 0,
                padding: '0.75rem 0.85rem',
                borderRadius: 12,
                background: 'var(--mist)',
                border: '1px solid var(--line)',
              }}
            >
              “{active.sayAloud}”
            </p>
          </div>
          <div className="field">
            <label>Why it matters</label>
            <p className="muted" style={{ margin: 0 }}>
              {active.why}
            </p>
          </div>
          <div className="field">
            <label>Done when</label>
            <p style={{ margin: 0 }}>{active.doneWhen}</p>
          </div>
          {active.tips?.length > 0 && (
            <ul className="small muted" style={{ margin: '0 0 1rem', paddingLeft: '1.1rem' }}>
              {active.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {active.tab && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => onOpenTab?.(active.tab)}
              >
                Open {active.tab === 'map' ? 'Life Map' : active.tab} tab
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || completed.has(active.id)}
              onClick={() => markStep(active.id, { complete: true })}
            >
              {completed.has(active.id) ? 'Step done' : 'Mark step done'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => markStep(active.id, { dismiss: true })}
            >
              Hide for now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
