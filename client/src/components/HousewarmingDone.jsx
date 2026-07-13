import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import {
  shareEmergencyText,
  shareHousewarmingDoneText,
  shareInviteText,
  whatsappShareUrl,
} from '../whatsapp.js';

const waBtn = {
  padding: '0.75rem 1.1rem',
  background: '#128C7E',
  color: '#fff',
  border: 'none',
  fontWeight: 700,
  width: '100%',
  textAlign: 'center',
  textDecoration: 'none',
  display: 'inline-block',
  borderRadius: 12,
};

/**
 * Climax after Digital Housewarming — invite sibling + fridge QR.
 */
export default function HousewarmingDone({
  estateId,
  subjectName,
  emergencyUrl,
  inviterName,
  onOpenTab,
  completedAt,
}) {
  const { api, toast, user } = useAuth();
  const { t, lang } = useI18n();
  const [inviteLink, setInviteLink] = useState('');
  const [busy, setBusy] = useState(false);

  async function ensureInviteLink() {
    if (inviteLink) return inviteLink;
    setBusy(true);
    try {
      const res = await api(`/api/estates/${estateId}/members`, {
        method: 'POST',
        body: { role: 'manager' },
      });
      const link =
        res.invite?.link ||
        (res.invite?.token ? `${window.location.origin}/invite/${res.invite.token}` : '');
      if (!link) throw new Error('Could not create invite link');
      setInviteLink(link);
      return link;
    } catch (err) {
      toast(err.message);
      return '';
    } finally {
      setBusy(false);
    }
  }

  const qrSrc = emergencyUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(emergencyUrl)}`
    : '';

  async function shareSiblingWa() {
    const link = await ensureInviteLink();
    if (!link) return;
    const href = whatsappShareUrl(
      shareHousewarmingDoneText({
        estateName: subjectName,
        link,
        inviterName: inviterName || user?.name,
        lang,
      })
    );
    window.open(href, '_blank', 'noopener,noreferrer');
  }

  const emergencyWa = emergencyUrl
    ? whatsappShareUrl(
        shareEmergencyText({ subjectName, url: emergencyUrl, lang })
      )
    : null;

  return (
    <div
      className="card"
      style={{
        padding: '1.25rem 1.35rem',
        marginBottom: '1.15rem',
        borderColor: 'rgba(47, 107, 82, 0.4)',
        background: 'linear-gradient(165deg, rgba(220, 232, 225, 0.7), var(--card))',
      }}
    >
      <p
        className="small muted"
        style={{ margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}
      >
        {t('housewarming')} · done
      </p>
      <p className="display" style={{ fontSize: '1.55rem', margin: '0.3rem 0 0.35rem' }}>
        Setup complete — share with family
      </p>
      <p className="muted" style={{ marginTop: 0, lineHeight: 1.5 }}>
        {completedAt
          ? `Finished ${new Date(completedAt).toLocaleDateString()}. `
          : ''}
        Invite a sibling on WhatsApp, then put the fridge QR where anyone at home can scan it.
      </p>

      <div className="panel-grid" style={{ marginTop: '1rem' }}>
        <div>
          <strong>{t('inviteSibling')}</strong>
          <p className="small muted" style={{ margin: '0.35rem 0 0.75rem' }}>
            {t('inviteSiblingBlurb')}
          </p>
          <button
            type="button"
            className="btn"
            style={{ ...waBtn, opacity: busy ? 0.7 : 1 }}
            disabled={busy}
            onClick={shareSiblingWa}
          >
            {busy ? t('pleaseWait') : t('shareInviteWa')}
          </button>
          {inviteLink && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ width: '100%', marginTop: '0.5rem' }}
              onClick={async () => {
                await navigator.clipboard.writeText(inviteLink).catch(() => {});
                toast('Invite link copied');
              }}
            >
              Copy invite link
            </button>
          )}
        </div>

        <div>
          <strong>{t('emergency')}</strong>
          <p className="small muted" style={{ margin: '0.35rem 0 0.75rem' }}>
            Print or WhatsApp — stick on fridge / wallet. Does not show bank passwords.
          </p>
          {qrSrc && (
            <img
              src={qrSrc}
              alt="Emergency QR"
              width={140}
              height={140}
              style={{ display: 'block', marginBottom: '0.75rem', borderRadius: 8 }}
            />
          )}
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {emergencyWa && (
              <a className="btn" style={waBtn} href={emergencyWa} target="_blank" rel="noreferrer">
                WhatsApp fridge QR
              </a>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onOpenTab?.('emergency')}
            >
              Open emergency tab
            </button>
          </div>
        </div>
      </div>

      <p className="small muted" style={{ margin: '1rem 0 0' }}>
        Next: keep mapping in Life Map when you learn more. Counsel and city care stay available when you need them.
      </p>
    </div>
  );
}

/** Shared WA-first sibling invite form for Family tab */
export function SiblingInviteCard({ estateId, subjectName, inviterName, onInvited }) {
  const { api, toast, user } = useAuth();
  const { t, lang } = useI18n();
  const [role, setRole] = useState('manager');
  const [email, setEmail] = useState('');
  const [lastLink, setLastLink] = useState('');
  const [busy, setBusy] = useState(false);

  async function createInvite({ withEmail = false } = {}) {
    setBusy(true);
    try {
      const body = { role };
      if (withEmail && email.trim()) body.email = email.trim().toLowerCase();
      const res = await api(`/api/estates/${estateId}/members`, { method: 'POST', body });
      const link =
        res.invite?.link ||
        (res.invite?.token ? `${window.location.origin}/invite/${res.invite.token}` : '');
      if (!link) throw new Error('No invite link returned');
      setLastLink(link);
      onInvited?.(link, res);
      return link;
    } catch (err) {
      toast(err.message);
      return '';
    } finally {
      setBusy(false);
    }
  }

  async function shareWhatsApp() {
    const link = lastLink || (await createInvite({ withEmail: false }));
    if (!link) return;
    const href = whatsappShareUrl(
      shareInviteText({
        estateName: subjectName,
        link,
        inviterName: inviterName || user?.name,
        lang,
      })
    );
    window.open(href, '_blank', 'noopener,noreferrer');
    toast(t('opensWhatsApp'));
  }

  async function emailInvite(e) {
    e.preventDefault();
    if (!email.trim()) {
      toast('Add an email, or use WhatsApp instead');
      return;
    }
    const link = await createInvite({ withEmail: true });
    if (link) {
      await navigator.clipboard.writeText(link).catch(() => {});
      toast('Invite created — email sent if configured; link copied');
      setEmail('');
    }
  }

  return (
    <div className="card" style={{ padding: '1.2rem' }}>
      <p className="display" style={{ fontSize: '1.3rem', marginTop: 0 }}>
        {t('inviteSibling')}
      </p>
      <p className="small muted">{t('inviteSiblingBlurb')}</p>

      <div className="field">
        <label>{t('role')}</label>
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="manager">Manager (can unlock / edit)</option>
          <option value="viewer">Viewer</option>
        </select>
      </div>

      <button
        type="button"
        className="btn"
        style={{ ...waBtn, opacity: busy ? 0.7 : 1 }}
        disabled={busy}
        onClick={shareWhatsApp}
      >
        {t('shareInviteWa')}
      </button>
      <p className="small muted" style={{ margin: '0.5rem 0 1rem' }}>
        No email needed — they set theirs when they join.
      </p>

      <form onSubmit={emailInvite}>
        <div className="field">
          <label>
            {t('email')} <span className="muted">(optional)</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="sibling@email.com"
          />
        </div>
        <button className="btn btn-ghost" disabled={busy} style={{ width: '100%' }}>
          Email invite link
        </button>
      </form>

      {lastLink && (
        <button
          type="button"
          className="btn btn-ghost"
          style={{ width: '100%', marginTop: '0.65rem' }}
          onClick={async () => {
            await navigator.clipboard.writeText(lastLink).catch(() => {});
            toast('Invite link copied');
          }}
        >
          Copy last invite link
        </button>
      )}
    </div>
  );
}
