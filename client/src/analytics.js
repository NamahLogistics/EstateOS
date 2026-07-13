/**
 * Lightweight product analytics — works without keys (no-op),
 * activates when VITE_POSTHOG_KEY (and optional Meta pixel) are set.
 * Introvert-friendly: measure the funnel; don't guess.
 */

const QUEUE_KEY = 'heirready_analytics_q';

function readQueue() {
  try {
    return JSON.parse(sessionStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeQueue(q) {
  try {
    sessionStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-40)));
  } catch {
    /* ignore */
  }
}

export function track(event, properties = {}) {
  if (!event) return;
  const payload = {
    event,
    properties: {
      ...properties,
      path: typeof window !== 'undefined' ? window.location.pathname : undefined,
      ts: Date.now(),
    },
  };

  const q = readQueue();
  q.push(payload);
  writeQueue(q);

  try {
    if (typeof window !== 'undefined' && window.posthog?.capture) {
      window.posthog.capture(event, payload.properties);
    }
  } catch {
    /* ignore */
  }

  try {
    if (typeof window !== 'undefined' && window.fbq) {
      window.fbq('trackCustom', event, payload.properties);
    }
  } catch {
    /* ignore */
  }

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[analytics]', event, properties);
  }
}

/** Load PostHog browser SDK when VITE_POSTHOG_KEY is present. */
export function initAnalytics() {
  const key = import.meta.env.VITE_POSTHOG_KEY;
  const host = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';
  if (!key || typeof window === 'undefined') return;

  if (window.posthog) {
    flushQueue();
    return;
  }

  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://cdn.jsdelivr.net/npm/posthog-js@1.194.0/dist/array.js';
  s.onload = () => {
    try {
      window.posthog.init(key, {
        api_host: host,
        person_profiles: 'identified_only',
        capture_pageview: true,
        persistence: 'localStorage+cookie',
      });
      flushQueue();
    } catch (err) {
      console.warn('[analytics] PostHog init failed', err);
    }
  };
  document.head.appendChild(s);
}

function flushQueue() {
  if (!window.posthog?.capture) return;
  const q = readQueue();
  for (const item of q) {
    try {
      window.posthog.capture(item.event, item.properties);
    } catch {
      /* ignore */
    }
  }
  writeQueue([]);
}

export function identifyUser(user) {
  if (!user?.id) return;
  const props = {
    email: user.email,
    name: user.name,
    plan: user.plan,
    accountType: user.accountType,
  };
  const run = () => {
    if (!window.posthog?.identify) return false;
    try {
      window.posthog.identify(user.id, props);
      return true;
    } catch {
      return false;
    }
  };
  if (run()) return;
  // SDK may still be loading
  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (run() || tries > 20) clearInterval(timer);
  }, 250);
}
