/** Shared layman trust copy — used on /security (public) and /app/security. */
export default function SecurityTrustProof({ showRecoveryNote = true }) {
  return (
    <div className="card" style={{ padding: '1.15rem 1.25rem' }}>
      <strong>Your family’s private details stay private</strong>
      <p className="small muted" style={{ margin: '0.4rem 0 0.85rem' }}>
        Think of your vault like a locked box. The lock opens only with your password (and a
        recovery key you keep). We never get a spare key — so even HeirReady cannot open the box
        and read what’s inside.
      </p>

      <p className="small" style={{ margin: '0 0 0.25rem', fontWeight: 700 }}>
        We cannot see
      </p>
      <ul className="small" style={{ margin: '0 0 0.85rem', paddingLeft: '1.1rem', lineHeight: 1.55 }}>
        <li>Bank, LIC, demat, or folio numbers</li>
        <li>The notes you write for family</li>
        <li>Photos and PDFs you upload</li>
      </ul>

      <p className="small" style={{ margin: '0 0 0.25rem', fontWeight: 700 }}>
        We can see (so the app works)
      </p>
      <ul className="small" style={{ margin: '0 0 0.85rem', paddingLeft: '1.1rem', lineHeight: 1.55 }}>
        <li>Your email and whether you’re on a paid plan</li>
        <li>Who’s in the family circle (names and emails)</li>
        <li>
          Simple labels you choose — like “Papa’s HDFC account” — but not the actual account number
        </li>
        <li>Reminder dates (so we can nudge you before something expires)</li>
      </ul>

      <p className="small" style={{ margin: '0 0 0.25rem', fontWeight: 700 }}>
        If someone attacks our systems
      </p>
      <ul className="small" style={{ margin: '0 0 0.85rem', paddingLeft: '1.1rem', lineHeight: 1.55 }}>
        <li>
          Your real secrets stay scrambled — without your password or recovery key, the box stays
          locked
        </li>
        <li>Your login password is never stored as plain text</li>
        <li>
          An attacker might see the same labels we see (titles, emails) — not numbers, notes, or
          documents
        </li>
      </ul>

      <p className="small" style={{ margin: '0 0 0.25rem', fontWeight: 700 }}>
        Attackers can open your vault only if you slip
      </p>
      <p className="small muted" style={{ margin: '0 0 0.4rem' }}>
        Breaking into HeirReady’s servers is not enough. Someone gets into the vault only if they
        also get hold of your key — usually because something on your side went wrong:
      </p>
      <ul className="small" style={{ margin: '0 0 0.85rem', paddingLeft: '1.1rem', lineHeight: 1.55 }}>
        <li>You reuse a password and it leaks elsewhere, or you fall for a fake login page</li>
        <li>You leave 2FA off — so a stolen password is enough</li>
        <li>Your phone or laptop is unlocked and someone uses your open HeirReady session</li>
        <li>Virus / scam software on your device watches you type or copies what’s on screen</li>
        <li>You share or lose the recovery key (photo in chat, sticky note, email to yourself)</li>
        <li>A family member you invited shares access carelessly</li>
      </ul>
      <p className="small" style={{ margin: '0 0 0.85rem' }}>
        <strong>Your side of the lock:</strong> turn on authenticator 2FA, use a unique password,
        keep the recovery key offline, and lock your devices. Do that, and a server attack still
        leaves your vault shut.
      </p>

      <p className="small" style={{ margin: '0 0 0.25rem', fontWeight: 700 }}>
        New device = confirm by email
      </p>
      <p className="small muted" style={{ margin: '0 0 0.85rem' }}>
        Like Google or Facebook: if you sign in from a phone or laptop we don’t recognise, we email
        you first. Only after you tap “Yes, it was me” can that device finish signing in.
      </p>

      {showRecoveryNote ? (
        <p className="small muted" style={{ margin: 0 }}>
          When you turn on vault encryption, we’ll show a <strong>recovery key once</strong>. Write
          it down offline. If you later reset your password and that key is gone,{' '}
          <strong>the vault can stay locked forever</strong> — we have no back door. That’s what
          keeps family secrets private.
        </p>
      ) : null}
    </div>
  );
}
