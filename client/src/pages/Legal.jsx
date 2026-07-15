import { useEffect, useState } from 'react';

/** Public business identity — Contact / Legal pages (no personal names or phone). */
const FALLBACK_BIZ = {
  brand: 'HeirReady',
  legalName: 'Namah',
  address: '1/172 Viraj Khand, Gomti Nagar, Lucknow, Uttar Pradesh 226010, India',
  email: 'support@heirready.com',
  phone: null,
  hours: 'Mon–Sat, 10:00–18:00 IST',
  grievanceName: 'HeirReady Support',
  grievanceEmail: 'support@heirready.com',
  website: 'https://heirready.com',
  country: 'India',
};

function useBusiness() {
  const [biz, setBiz] = useState(null);
  useEffect(() => {
    fetch('/api/public/business')
      .then((r) => r.json())
      .then((d) => setBiz({ ...FALLBACK_BIZ, ...d }))
      .catch(() => setBiz(FALLBACK_BIZ));
  }, []);
  return biz;
}

function LegalShell({ title, children }) {
  return (
    <article className="card" style={{ padding: '1.5rem', margin: '1rem 0 3rem', maxWidth: 720 }}>
      <h1 className="display" style={{ fontSize: '2rem', marginTop: 0 }}>
        {title}
      </h1>
      <p className="muted">Last updated: 13 July 2026</p>
      {children}
    </article>
  );
}

export function LegalTerms() {
  const biz = useBusiness();
  if (!biz) return <p className="muted">Loading…</p>;
  return (
    <LegalShell title="Terms & conditions">
      <p>
        HeirReady is family continuity / coordination software operated by{' '}
        <strong>{biz.legalName}</strong>. It helps organise documents, unlock rules, execution
        checklists, and counsel collaboration related to death or incapacity. It is{' '}
        <strong>not</strong> a law firm, notary, bank, insurer, or court, and does not provide legal
        advice.
      </p>
      <p>
        By creating an account or paying for a plan, you agree to these terms. You must be 18+ and
        able to enter a binding contract. You are responsible for information you upload, unlocker
        appointments, and lawful use of the service.
      </p>
      <p>
        Paid plans (Family / Diaspora / Counsel Pro) are billed annually in USD via Paddle. Family + Care and Diaspora + Care are listed as coming soon and are not available for purchase.
        Mid-year upgrades charge a prorated difference for remaining days and keep your renewal date; downgrades take effect at renewal.
        Checkout is card-based in USD (Paddle is merchant of record and handles tax where applicable).
        Features may change; material downgrades of a paid plan during a paid term will be handled
        under our Cancellation & Refunds policy.
      </p>
      <p>
        Referral programme: when someone registers with your invite link and later pays for a plan,
        you may receive one discount credit (typically 50% off one checkout). Credits stack, do not
        expire while the programme runs, and are limited to one credit per referred person on their
        first paid plan. Free signups and free caregiver listings do not earn credits. We may change
        or end the referral programme with reasonable notice.
      </p>
      <p>
        We may suspend or terminate accounts for abuse, fraud, unlawful content, or non-payment.
        Service is provided on an as-available basis.
      </p>
      <p>
        These terms are governed by the laws of India. Disputes are subject to the exclusive
        jurisdiction of courts in Lucknow, Uttar Pradesh, India. Operating entity and contact
        details are on the Contact Us page.
      </p>
    </LegalShell>
  );
}

export function LegalPrivacy() {
  const biz = useBusiness();
  if (!biz) return <p className="muted">Loading…</p>;
  return (
    <LegalShell title="Privacy policy">
      <p>
        We collect account details (name, email), authentication data, estate vault metadata,
        uploaded documents you choose to add, audit logs, counsel matter data, and payment metadata
        from Paddle (we do not store full card numbers).
      </p>
      <p>
        We use this data to operate HeirReady, process payments, send transactional email (invites,
        receipts), secure accounts, and improve reliability. We do not sell personal data.
      </p>
      <p>
        Data may be processed by hosting and infrastructure providers (e.g. database, email, payment
        gateway). Counsel you retain can access estate information you grant through an engagement.
      </p>
      <p>
        You may request export or deletion of your account data by emailing{' '}
        <a href={`mailto:${biz.email}`}>{biz.email}</a>. Privileged counsel notes are limited to
        owners, managers, and engaged counsel.
      </p>
      <p>
        For privacy grievances, contact {biz.grievanceName} at{' '}
        <a href={`mailto:${biz.grievanceEmail}`}>{biz.grievanceEmail}</a>.
      </p>
    </LegalShell>
  );
}

export function LegalRefunds() {
  const biz = useBusiness();
  if (!biz) return <p className="muted">Loading…</p>;
  return (
    <LegalShell title="Cancellation & refunds">
      <p>
        HeirReady sells digital software subscriptions (Family and Diaspora annual plans). There is
        no physical product.
      </p>
      <p>
        <strong>Cancellation:</strong> Annual plans auto-renew on your card until cancelled. Stop
        renewal anytime from <a href="/pricing">Pricing</a> (Cancel auto-renew) or by emailing{' '}
        <a href={`mailto:${biz.email}`}>{biz.email}</a>. Access continues until the end of the
        already-paid annual period unless a refund is approved.
      </p>
      <p>
        <strong>Refunds:</strong> If you request a refund within <strong>7 days</strong> of first
        purchase and have not made material use of paid features (e.g. counsel retain, bulk exports,
        multi-member invites beyond trial needs), we will refund the full amount to the original
        payment method.
      </p>
      <p>
        Refund requests after 7 days, or after substantial use of paid features, are evaluated
        case-by-case. Approved refunds are processed within <strong>5–7 business days</strong>{' '}
        after approval; the card issuer or bank may take additional time to reflect credit.
      </p>
      <p>
        Chargebacks for valid paid periods may lead to account suspension. Write to{' '}
        <a href={`mailto:${biz.email}`}>{biz.email}</a> with your registered email and Paddle
        transaction id.
      </p>
    </LegalShell>
  );
}

export function LegalShipping() {
  const biz = useBusiness();
  if (!biz) return <p className="muted">Loading…</p>;
  return (
    <LegalShell title="Shipping policy">
      <p>
        HeirReady is a <strong>fully digital service</strong>. No physical goods are shipped.
      </p>
      <p>
        After successful payment, paid plan features are activated on your account immediately (or
        within a few minutes). There is no delivery address, courier, or shipping charge.
      </p>
      <p>
        If access is not enabled after payment, email{' '}
        <a href={`mailto:${biz.email}`}>{biz.email}</a> with your registered email and Paddle
        transaction id.
      </p>
    </LegalShell>
  );
}

export function ContactPage() {
  const biz = useBusiness();
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setStatus('');
    try {
      const res = await fetch('/api/public/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send message');
      setStatus('Message received. We will reply by email within 1–2 business days.');
      setForm({ name: '', email: '', message: '' });
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!biz) return <p className="muted">Loading…</p>;

  return (
    <LegalShell title="Contact us">
      <p>
        For product support, billing, and grievances related to HeirReady (operated by{' '}
        <strong>{biz.legalName}</strong>).
      </p>

      <p>
        <strong>Product / brand:</strong> {biz.brand}
        <br />
        <strong>Legal entity:</strong> {biz.legalName}
        <br />
        <strong>Country:</strong> {biz.country || 'India'}
      </p>

      <p>
        <strong>Registered / business address:</strong>
        <br />
        {biz.address}
      </p>

      <p>
        <strong>Website:</strong>{' '}
        <a href={biz.website} target="_blank" rel="noreferrer">
          {biz.website}
        </a>
      </p>

      <p>
        <strong>Customer support email:</strong>{' '}
        <a href={`mailto:${biz.email}`}>{biz.email}</a>
        <br />
        <strong>Support hours:</strong> {biz.hours}
      </p>

      <p>
        <strong>Grievance / support:</strong> {biz.grievanceName || 'HeirReady Support'}
        <br />
        <a href={`mailto:${biz.grievanceEmail || biz.email}`}>{biz.grievanceEmail || biz.email}</a>
      </p>

      <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '1.4rem 0' }} />

      <p className="display" style={{ fontSize: '1.25rem', margin: '0 0 0.75rem' }}>
        Send us a message
      </p>
      <form onSubmit={submit}>
        <div className="field">
          <label>Your name</label>
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Email</label>
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Message</label>
          <textarea
            required
            rows={5}
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
          />
        </div>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Sending…' : 'Submit'}
        </button>
      </form>
      {status && (
        <p className="small" style={{ marginTop: '0.85rem' }}>
          {status}
        </p>
      )}
    </LegalShell>
  );
}
