export function LegalTerms() {
  return (
    <article className="card" style={{ padding: '1.5rem', margin: '1rem 0 3rem', maxWidth: 720 }}>
      <h1 className="display" style={{ fontSize: '2rem', marginTop: 0 }}>
        Terms of use
      </h1>
      <p className="muted">Last updated: 12 July 2026</p>
      <p>
        Estate OS is family coordination software. It helps you organise documents, unlock rules, and
        execution checklists related to death or incapacity. It is <strong>not</strong> a law firm,
        notary, bank, insurer, or court.
      </p>
      <p>
        Nothing on Estate OS is legal advice. Always consult a licensed advocate for succession,
        probate, property, and related matters. Banks and institutions follow their own KYC and
        nominee processes regardless of what Estate OS generates.
      </p>
      <p>
        You are responsible for the accuracy of information you store, who you appoint as unlockers,
        and how you share access. Do not upload documents you are not allowed to store.
      </p>
      <p>
        Service is provided as-available. We may suspend accounts that abuse the platform or store
        unlawful content.
      </p>
    </article>
  );
}

export function LegalPrivacy() {
  return (
    <article className="card" style={{ padding: '1.5rem', margin: '1rem 0 3rem', maxWidth: 720 }}>
      <h1 className="display" style={{ fontSize: '2rem', marginTop: 0 }}>
        Privacy
      </h1>
      <p className="muted">Last updated: 12 July 2026</p>
      <p>
        We store account details, estate vault metadata, uploaded files you choose to add, audit
        events, and counsel matter data needed to run the product.
      </p>
      <p>
        Data is used to provide Estate OS, secure accounts, and improve reliability. We do not sell
        personal data. Counsel you retain can see estate information you grant through an engagement.
      </p>
      <p>
        You may export an estate ZIP and request deletion by contacting the operator email published
        on the site. Privileged notes are restricted to owners, managers, and engaged counsel.
      </p>
      <p>
        Files and structured data are stored on our hosting providers (including database and object
        storage regions configured for the deployment).
      </p>
    </article>
  );
}
