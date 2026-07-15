/**
 * Checkout outcome UX — fail recovery, success, confirming, paid-but-not-activated.
 */
export default function PaymentCheckoutGate({
  open,
  mode = 'failed', // failed | success | confirming | activate_pending
  onClose,
  planLabel,
  amountLabel,
  failReason,
  userEmail,
  shortUrl,
  emailed,
  emailBusy,
  recoverBusy,
  expiresAt,
  autoRenew,
  gifted,
  activateError,
  needsSignIn,
  onRetry,
  onOpenLink,
  onResendEmail,
  onContinue,
  onRetryActivate,
  supportEmail = 'support@heirready.com',
}) {
  if (!open) return null;

  const eyebrow =
    mode === 'success'
      ? 'Payment successful'
      : mode === 'confirming'
        ? 'Confirming payment'
        : mode === 'activate_pending'
          ? 'Payment received'
          : 'Payment didn’t finish';

  const title =
    mode === 'success'
      ? needsSignIn
        ? 'Payment received'
        : gifted
          ? 'Gift applied — vault unlocked'
          : `${planLabel || 'Your plan'} is active`
      : mode === 'confirming'
        ? 'Hang on — locking in your access…'
        : mode === 'activate_pending'
          ? 'Your bank charged you — we’re finishing activation'
          : `You’re not stuck — finish ${planLabel || 'your plan'}`;

  const expiresLabel = expiresAt
    ? new Date(expiresAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <div
      className="upgrade-gate"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-checkout-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && mode !== 'confirming') onClose?.();
      }}
    >
      <div className="upgrade-gate-panel">
        <p
          className="small muted"
          style={{ margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}
        >
          {eyebrow}
        </p>
        <h2
          id="payment-checkout-title"
          className="display"
          style={{ fontSize: '1.75rem', margin: '0.35rem 0 0.55rem' }}
        >
          {title}
        </h2>

        {mode === 'confirming' ? (
          <p className="muted" style={{ marginTop: 0, lineHeight: 1.55 }}>
            This usually takes a second. Don’t close this tab.
          </p>
        ) : null}

        {mode === 'success' ? (
          <>
            <p className="muted" style={{ marginTop: 0, lineHeight: 1.55 }}>
              {needsSignIn
                ? 'Payment is in — sign in with the account that started checkout to see your plan.'
                : gifted
                  ? 'The Life Map owner now has paid access. You can keep mapping together.'
                  : autoRenew
                    ? `You’re set through ${expiresLabel || 'the next year'}. Auto-renew is on — cancel anytime on Pricing.`
                    : `You’re set through ${expiresLabel || 'the next year'}. Renew from Pricing when you’re ready.`}
            </p>
            {!needsSignIn ? (
              <ul className="upgrade-gate-list">
                <li>Unlimited Life Map items (paid plans)</li>
                <li>Invite siblings and keep an audit trail</li>
                <li>Receipt is also in your email from Razorpay</li>
              </ul>
            ) : null}
            <div className="upgrade-gate-actions">
              {needsSignIn ? (
                <a className="btn btn-primary" href="/auth?mode=login">
                  Sign in to continue
                </a>
              ) : (
                <button type="button" className="btn btn-primary" onClick={onContinue}>
                  {gifted ? 'Back to the vault' : 'Open my vault'}
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Stay on Pricing
              </button>
            </div>
          </>
        ) : null}

        {mode === 'activate_pending' ? (
          <>
            <p className="muted" style={{ marginTop: 0, lineHeight: 1.55 }}>
              The charge went through, but we couldn’t flip your plan on automatically
              {activateError ? ` (${activateError})` : ''}. Tap below — it usually works on the second try.
              If not, email {supportEmail} with your payment id and we’ll activate within a few hours.
            </p>
            <div className="upgrade-gate-actions">
              <button type="button" className="btn btn-primary" onClick={onRetryActivate}>
                Activate my plan now
              </button>
              <a className="btn btn-ghost" href={`mailto:${supportEmail}?subject=${encodeURIComponent(`Payment activation — ${planLabel || 'HeirReady'}`)}`}>
                Email support
              </a>
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : null}

        {mode === 'failed' ? (
          <>
            <p className="muted" style={{ marginTop: 0, lineHeight: 1.55 }}>
              {failReason
                ? `Your bank said: ${failReason}. `
                : 'International cards often time out or get blocked mid-checkout. '}
              {amountLabel ? `${amountLabel} is still ready. ` : ''}
              {recoverBusy && !shortUrl
                ? 'Preparing a secure pay link…'
                : emailed && userEmail
                  ? `We emailed a pay link to ${userEmail} — forward it to family in India for UPI if needed.`
                  : userEmail
                    ? `We’ll email a pay link to ${userEmail}.`
                    : 'Use a pay link you can finish later — or ask family in India to pay with UPI.'}
            </p>
            <ul className="upgrade-gate-list">
              <li>Try again with another Visa / Mastercard</li>
              <li>Open the pay link — UPI in India is most reliable</li>
              <li>Forward the email; family can pay without your password</li>
              <li>When the link is paid, your plan unlocks — sign in and open the app</li>
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
          </>
        ) : null}
      </div>
    </div>
  );
}
