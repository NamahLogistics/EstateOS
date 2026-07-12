import { useEffect, useState } from 'react';

const FALLBACK_BIZ = {
  brand: 'Estate OS',
  legalName: 'Estate OS (update BUSINESS_LEGAL_NAME)',
  address: 'Registered office address — set BUSINESS_ADDRESS',
  email: 'support@estateos.app',
  phone: '+91-XXXXXXXXXX',
  hours: 'Mon–Sat, 10:00–18:00 IST',
  grievanceName: 'Grievance Officer — set BUSINESS_GRIEVANCE_NAME',
  grievanceEmail: 'grievance@estateos.app',
};

function useBusiness() {
  const [biz, setBiz] = useState(FALLBACK_BIZ);
  useEffect(() => {
    fetch('/api/public/business')
      .then((r) => r.json())
      .then((d) => setBiz({ ...FALLBACK_BIZ, ...d }))
      .catch(() => {});
  }, []);
  return biz;
}

function LegalShell({ title, children }) {
  return (
    <article className="card" style={{ padding: '1.5rem', margin: '1rem 0 3rem', maxWidth: 720 }}>
      <h1 className="display" style={{ fontSize: '2rem', marginTop: 0 }}>
        {title}
      </h1>
      <p className="muted">Last updated: 12 July 2026</p>
      {children}
    </article>
  );
}

export function LegalTerms() {
  return (
    <LegalShell title="Terms & conditions">
      <p>
        Estate OS is family continuity / coordination software. It helps organise documents, unlock
        rules, execution checklists, and counsel collaboration related to death or incapacity. It is{' '}
        <strong>not</strong> a law firm, notary, bank, insurer, or court, and does not provide legal
        advice.
      </p>
      <p>
        By creating an account or paying for a plan, you agree to these terms. You must be 18+ and
        able to enter a binding contract. You are responsible for information you upload, unlocker
        appointments, and lawful use of the service.
      </p>
      <p>
        Paid plans (Family / Diaspora) are billed annually via Razorpay unless otherwise stated.
        Features may change; material downgrades of a paid plan during a paid term will be handled
        under our Cancellation & Refunds policy.
      </p>
      <p>
        We may suspend or terminate accounts for abuse, fraud, unlawful content, or non-payment.
        Service is provided on an as-available basis.
      </p>
      <p>
        These terms are governed by the laws of India. Disputes are subject to the exclusive
        jurisdiction of courts in India (see Contact Us for operating entity details).
      </p>
    </LegalShell>
  );
}

export function LegalPrivacy() {
  const biz = useBusiness();
  return (
    <LegalShell title="Privacy policy">
      <p>
        We collect account details (name, email), authentication data, estate vault metadata,
        uploaded documents you choose to add, audit logs, counsel matter data, and payment metadata
        from Razorpay (we do not store full card numbers).
      </p>
      <p>
        We use this data to operate Estate OS, process payments, send transactional email (invites,
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
  return (
    <LegalShell title="Cancellation & refunds">
      <p>
        Estate OS sells digital software subscriptions (Family and Diaspora annual plans). There is
        no physical product.
      </p>
      <p>
        <strong>Cancellation:</strong> You may stop renewal by contacting{' '}
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
        after approval; the bank/UPI provider may take additional time to reflect credit.
      </p>
      <p>
        Chargebacks for valid paid periods may lead to account suspension. Write to{' '}
        <a href={`mailto:${biz.email}`}>{biz.email}</a> with your registered email and Razorpay
        payment id.
      </p>
    </LegalShell>
  );
}

export function LegalShipping() {
  return (
    <LegalShell title="Shipping policy">
      <p>
        Estate OS is a <strong>fully digital service</strong>. No physical goods are shipped.
      </p>
      <p>
        After successful payment, paid plan features are activated on your account immediately (or
        within a few minutes). There is no delivery address, courier, or shipping charge.
      </p>
      <p>
        If access is not enabled after payment, email support with your registered email and
        Razorpay payment id — see Contact Us.
      </p>
    </LegalShell>
  );
}

export function ContactPage() {
  const biz = useBusiness();
  return (
    <LegalShell title="Contact us">
      <p>
        <strong>Brand:</strong> {biz.brand}
      </p>
      <p>
        <strong>Legal entity:</strong> {biz.legalName}
      </p>
      <p>
        <strong>Registered address:</strong>
        <br />
        {biz.address}
      </p>
      <p>
        <strong>Email:</strong>{' '}
        <a href={`mailto:${biz.email}`}>{biz.email}</a>
      </p>
      <p>
        <strong>Phone:</strong> {biz.phone}
      </p>
      <p>
        <strong>Support hours:</strong> {biz.hours}
      </p>
      <p>
        <strong>Grievance / nodal officer:</strong> {biz.grievanceName}
        <br />
        <a href={`mailto:${biz.grievanceEmail}`}>{biz.grievanceEmail}</a>
      </p>
      <p className="small muted">
        Update these details via Railway env vars: BUSINESS_LEGAL_NAME, BUSINESS_ADDRESS,
        BUSINESS_EMAIL, BUSINESS_PHONE, BUSINESS_GRIEVANCE_NAME, BUSINESS_GRIEVANCE_EMAIL.
      </p>
    </LegalShell>
  );
}
