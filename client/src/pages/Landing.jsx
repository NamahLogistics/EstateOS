import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { useCareNetwork } from '../careNetwork.js';

export default function Landing() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { comingSoon: careComingSoon } = useCareNetwork();
  const isLawyer = user?.accountType === 'lawyer';
  const isCare = user?.accountType === 'care';

  return (
    <>
      <section className="hero-bleed" aria-label="HeirReady">
        <div className="hero-bleed-wash" aria-hidden />
        <div className="hero-bleed-inner">
          <h1 className="brand-hero">HeirReady</h1>
          <p className="hero-line">{t('heroLine')}</p>
          <div className="hero-actions">
            {isLawyer ? (
              <>
                <Link className="btn btn-primary" to="/app/counsel">
                  {t('openCounselDesk')}
                </Link>
                <Link className="btn btn-ghost" to="/pricing">
                  {t('counselPro')}
                </Link>
              </>
            ) : isCare ? (
              <>
                <Link className="btn btn-primary" to="/app/care">
                  {t('openCareDesk')}
                </Link>
                <Link className="btn btn-ghost" to="/pricing">
                  {t('seeFamilyPlans')}
                </Link>
              </>
            ) : (
              <>
                <Link className="btn btn-primary" to={user ? '/app' : '/auth?mode=register'}>
                  {user ? t('openEstates') : t('startFree')}
                </Link>
                <Link className="btn btn-ghost" to="/tour">
                  Watch how it works
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="section-how">
        <h2 className="display section-how-title">{t('landingProofTitle')}</h2>
        <p className="section-lead">{t('landingProofCta')}</p>
        <div className="panel-grid">
          {[t('landingProof1'), t('landingProof2'), t('landingProof3')].map((body) => (
            <div key={body} className="feature-block">
              <p className="feature-body" style={{ margin: 0 }}>
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="section-how">
        <h2 className="display section-how-title">{t('howFromAbroad')}</h2>
        <p className="section-lead">{t('howLead')}</p>
        <div className="panel-grid">
          {[
            [t('whileAbroad'), t('whileAbroadBody')],
            [t('whenHappens'), t('whenHappensBody')],
            [
              t('localCare'),
              careComingSoon ? t('localCareSoon') : t('localCareLive'),
            ],
          ].map(([title, body]) => (
            <div key={title} className="feature-block">
              <p className="display feature-title">{title}</p>
              <p className="feature-body">{body}</p>
            </div>
          ))}
        </div>
        <p className="small" style={{ marginTop: '1.5rem', color: 'var(--ink-soft)' }}>
          {t('notLegal')}
        </p>
      </section>

      <section className="section-counsel">
        <h2 className="display section-how-title">{t('cityCare')}</h2>
        <p className="section-lead">
          {careComingSoon ? t('landingCityCareSoon') : t('landingCityCareLive')}
        </p>
        <div className="hero-actions">
          {isCare ? (
            <Link className="btn btn-primary" to="/app/care">
              {t('careDesk')}
            </Link>
          ) : careComingSoon ? (
            <>
              <span className="btn btn-ghost" style={{ opacity: 0.7, pointerEvents: 'none' }}>
                {t('familyCareSoon')}
              </span>
              <Link className="btn btn-primary" to="/auth?mode=register&type=care">
                {t('iProvideCareFree')}
              </Link>
            </>
          ) : (
            <>
              <Link className="btn btn-primary" to="/pricing?plan=family_care">
                Family + Care — ₹2,998/yr
              </Link>
              <Link className="btn btn-ghost" to="/auth?mode=register&type=care">
                {t('iProvideCareFree')}
              </Link>
            </>
          )}
        </div>
      </section>

      <section className="section-counsel">
        <h2 className="display section-how-title">{t('forAdvocates')}</h2>
        <p className="section-lead">{t('landingCounselLead')}</p>
        <div className="hero-actions">
          {isLawyer ? (
            <Link className="btn btn-primary" to="/app/counsel">
              {t('counselDesk')}
            </Link>
          ) : (
            <>
              <Link className="btn btn-primary" to="/auth?mode=register&type=lawyer">
                {t('registerCounsel')}
              </Link>
              <Link className="btn btn-ghost" to="/pricing">
                Counsel Pro — ₹1,499/yr
              </Link>
            </>
          )}
        </div>
      </section>

      <p className="small muted" style={{ textAlign: 'center', margin: '2rem 0 0' }}>
        Practical checklists:{' '}
        <Link to="/guides">NRI documents, LIC claim, sibling vault, fridge QR</Link>
      </p>
    </>
  );
}
