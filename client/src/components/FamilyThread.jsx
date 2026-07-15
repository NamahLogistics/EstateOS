import { useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { shareFamilyNoteText } from '../whatsapp.js';
import { openTrackedWhatsAppShare } from '../activity.js';

const waMini = {
  padding: '0.35rem 0.7rem',
  background: '#128C7E',
  color: '#fff',
  border: 'none',
  fontWeight: 600,
  fontSize: '0.8rem',
  textDecoration: 'none',
  display: 'inline-block',
  borderRadius: 8,
};

export default function FamilyThread({ estateId, estateName }) {
  const { api, toast, user } = useAuth();
  const { t, lang } = useI18n();
  const [posts, setPosts] = useState([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastPost, setLastPost] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api(`/api/estates/${estateId}/thread`);
      setPosts(res.posts || []);
    } catch (err) {
      toast(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => {});
  }, [estateId]);

  async function shareNoteOnWhatsApp(post) {
    const link = `${window.location.origin}/app/estates/${estateId}?tab=family`;
    await openTrackedWhatsAppShare({
      api,
      destination: link,
      kind: 'family_note',
      meta: { estateId, estateName },
      buildText: (tracked) =>
        shareFamilyNoteText({
          estateName: estateName || 'Family file',
          authorName: post.authorName || user?.name,
          body: post.body,
          link: tracked,
          lang,
        }),
      toast,
    });
  }

  async function submit(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      const res = await api(`/api/estates/${estateId}/thread`, {
        method: 'POST',
        body: { body: body.trim() },
      });
      setPosts((p) => [...p, res.post]);
      setLastPost(res.post);
      setBody('');
      toast(
        res.notified > 0
          ? `Posted — emailed ${res.notified} family member${res.notified === 1 ? '' : 's'}`
          : 'Posted — share on WhatsApp or invite siblings'
      );
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="card"
      style={{
        padding: '1.2rem 1.25rem',
        marginBottom: '1.15rem',
        borderColor: 'rgba(47, 107, 82, 0.35)',
        background: 'linear-gradient(165deg, rgba(220, 232, 225, 0.45), var(--card))',
      }}
    >
      <p
        className="small muted"
        style={{ margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}
      >
        {t('familyThread')}
      </p>
      <p className="display" style={{ fontSize: '1.35rem', margin: '0.3rem 0 0.35rem' }}>
        {t('familyThreadTitle')}
      </p>
      <p className="muted small" style={{ marginTop: 0, lineHeight: 1.5 }}>
        {t('familyThreadBlurb')}
      </p>

      <div
        style={{
          maxHeight: 320,
          overflowY: 'auto',
          margin: '0.85rem 0 1rem',
          display: 'grid',
          gap: '0.55rem',
        }}
      >
        {loading ? (
          <p className="small muted">{t('loadingThread')}</p>
        ) : posts.length === 0 ? (
          <p className="small muted">{t('noNotesYet')}</p>
        ) : (
          posts.map((p) => {
            const mine = p.authorId === user?.id;
            return (
              <div
                key={p.id}
                style={{
                  padding: '0.65rem 0.8rem',
                  borderRadius: 12,
                  background: mine ? 'rgba(47, 107, 82, 0.12)' : 'rgba(255,255,255,0.75)',
                  border: '1px solid var(--line)',
                }}
              >
                <div className="small" style={{ fontWeight: 700 }}>
                  {p.authorName}
                  <span className="muted" style={{ fontWeight: 500, marginLeft: '0.45rem' }}>
                    {new Date(p.createdAt).toLocaleString()}
                  </span>
                </div>
                <p style={{ margin: '0.3rem 0 0', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
                  {p.body}
                </p>
                <button
                  type="button"
                  className="btn"
                  style={{ ...waMini, marginTop: '0.45rem' }}
                  onClick={() => shareNoteOnWhatsApp(p)}
                >
                  WhatsApp
                </button>
              </div>
            );
          })
        )}
      </div>

      {lastPost && (
        <p className="small" style={{ margin: '0 0 0.75rem' }}>
          Just posted —{' '}
          <button
            type="button"
            className="btn btn-ghost"
            style={{ fontWeight: 700, padding: 0 }}
            onClick={() => shareNoteOnWhatsApp(lastPost)}
          >
            share this note on WhatsApp
          </button>
        </p>
      )}

      <form onSubmit={submit}>
        <div className="field" style={{ marginBottom: '0.65rem' }}>
          <label>{t('newNote')}</label>
          <textarea
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="e.g. Spoke to LIC agent — need nomination form from Dad’s folder…"
            maxLength={2000}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy || !body.trim()}>
          {busy ? t('sending') : t('postNotify')}
        </button>
      </form>
    </div>
  );
}
