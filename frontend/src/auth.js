import { useCallback, useEffect, useState } from 'react';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
let gisPromise = null;

function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => { gisPromise = null; reject(new Error('Could not load Google sign-in')); };
      document.head.appendChild(script);
    });
  }
  return gisPromise;
}

// Accounts live in Cloudflare D1; the backend sets an httpOnly session cookie.
export function useAuth() {
  const [config, setConfig] = useState({ enabled: false, google_client_id: '' });
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [googleReady, setGoogleReady] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/auth/config').then(r => r.json()),
      fetch('/api/auth/me').then(r => r.json()),
    ])
      .then(([cfg, me]) => {
        setConfig(cfg);
        setUser(me.user || null);
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, []);

  const handleCredential = useCallback(async ({ credential }) => {
    setError('');
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Sign-in failed');
      setUser(data.user);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (!config.enabled || !config.google_client_id) return;
    loadGoogleScript()
      .then(() => {
        window.google.accounts.id.initialize({
          client_id: config.google_client_id,
          callback: handleCredential,
        });
        setGoogleReady(true);
      })
      .catch(err => setError(err.message));
  }, [config.enabled, config.google_client_id, handleCredential]);

  const signOut = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => { });
    window.google?.accounts?.id?.disableAutoSelect();
    setUser(null);
  }, []);

  return { enabled: config.enabled, user, loading, error, googleReady, signOut };
}
