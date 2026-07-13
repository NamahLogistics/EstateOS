import { useMemo, useState } from 'react';
import { useAuth } from '../auth.jsx';

export default function HousewarmingGuide({ estateId, guide, onUpdated, onOpenTab }) {
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
    if (progress.completedAt) {
      return (
        <div className="card" style={{ padding: '1.15rem', marginBottom: '1rem' }}>
          <p className="display" style={{ fontSize: '1.25rem', margin: 0 }}>
            Digital Housewarming complete
          </p>
          <p className="small muted" style={{ margin: '0.35rem 0 0' }}>
            Finished {new Date(progress.completedAt).toLocaleDateString()}. Re-open anytime from the
            Housewarming tab if you add another parent or redo with siblings.
          </p>
        </div>
      );
    }
    return null;
  }

  async function markStep(stepId, opts = {}) {
    setBusy(true);
    try {
      const res = await api(`/api/estates/${estateId}/housewarming`, {
        method: 'POST',
        body: { stepId, ...opts },
      });
      onUpdated?.(res.housewarming);
      toast(opts.completeAll ? 'Housewarming complete' : 'Step saved');
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
          Child-led · {meta.duration || '~20 min'}
        </p>
        <h2 className="display" style={{ fontSize: '1.75rem', margin: '0.25rem 0 0.5rem' }}>
          {meta.title || 'Digital Housewarming'}
        </h2>
        <p style={{ marginTop: 0, color: 'var(--ink-soft)' }}>{meta.framing}</p>

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
            Open the call with
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
              onClick={() => markStep(active.id, { completeAll: true })}
            >
              Finish housewarming
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
