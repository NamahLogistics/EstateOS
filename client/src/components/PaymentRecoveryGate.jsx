/**
 * Shown after Razorpay checkout fails — retry, open pay link, or confirm email recovery.
 */
export default function PaymentRecoveryGate({
  open,
  onClose,
  planLabel,
  amountLabel,
  failReason,
  userEmail,
  shortUrl,
  emailed,
  emailBusy,
  recoverBusy,
  onRetry,
  onOpenLink,
  onResendEmail,
}) {
  if (!open) return null;

  return (
    <div
      className="upgrade-gate"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-recovery-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="upgrade-gate-panel">
        <p
          className="small muted"
          style={{ margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}
        >
          Payment didn’t finish
        </p>
        <h2
          id="payment-recovery-title"
          className="display"
          style={{ fontSize: '1.75rem', margin: '0.35rem 0 0.55rem' }}
        >
          You’re not stuck — finish {planLabel || 'your plan'}
        </h2>
        <p className="muted" style={{ marginTop: 0, lineHeight: 1.55 }}>
          {failReason
            ? `Bank / card said: ${failReason}. `
            : 'International cards often time out or get blocked mid-checkout. '}
          {amountLabel ? `${amountLabel} is still ready to collect. ` : ''}
          {emailed && userEmail
            ? `We emailed a secure pay link to ${userEmail}.`
            : userEmail
              ? `We can email a pay link to ${userEmail}.`
              : 'Use a pay link you can finish later — or ask family in India to pay with UPI.'}
        </p>
        <ul className="upgrade-gate-list">
          <li>Retry checkout (another card often works)</li>
          <li>Open the pay link — UPI in India is the most reliable</li>
          <li>Forward the email to family who can pay from India</li>
        </ul>
        <div className="upgrade-gate-actions">
          <button type="button" className="btn btn-primary" disabled={recoverBusy} onClick={onRetry}>
            Try payment again
          </button>
          {shortUrl ? (
            <button type="button" className="btn btn-ghost" onClick={onOpenLink}>
              Open pay link
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost"
            disabled={emailBusy || recoverBusy}
            onClick={onResendEmail}
          >
            {emailBusy
              ? 'Sending…'
              : emailed
                ? 'Email me the link again'
                : 'Email me a payment link'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
