import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const AuthContext = createContext(null);
const STORAGE_KEY = 'estate_os_session';

async function api(path, { token, ...options } = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const res = await fetch(path, { ...options, headers });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUserState] = useState(null);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setToken(parsed.token);
        setUserState(parsed.user);
      }
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(t);
  }, [toast]);

  const value = useMemo(
    () => ({
      token,
      user,
      ready,
      toast: (message, type = 'info') => setToast({ message, type }),
      async register(payload) {
        const data = await api('/api/auth/register', { method: 'POST', body: payload });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        setToken(data.token);
        setUserState(data.user);
        return data;
      },
      async login(payload) {
        const data = await api('/api/auth/login', { method: 'POST', body: payload });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        setToken(data.token);
        setUserState(data.user);
        return data;
      },
      logout() {
        localStorage.removeItem(STORAGE_KEY);
        setToken(null);
        setUserState(null);
      },
      setUser(next) {
        setUserState(next);
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, user: next }));
          } catch {
            /* ignore */
          }
        }
      },
      api: (path, options = {}) => api(path, { ...options, token }),
    }),
    [token, user, ready]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {toast && <div className="toast">{toast.message}</div>}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
