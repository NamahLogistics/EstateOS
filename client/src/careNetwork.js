import { useEffect, useState } from 'react';

/**
 * Mirrors server CARE_NETWORK_COMING_SOON from /api/health.
 * Flip live without a frontend redeploy: Railway env CARE_NETWORK_COMING_SOON=false + restart.
 */
export function useCareNetwork() {
  const [comingSoon, setComingSoon] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setComingSoon(d?.careNetwork !== 'live');
      })
      .catch(() => {
        /* keep safe default: coming soon */
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { comingSoon, ready, live: !comingSoon };
}
