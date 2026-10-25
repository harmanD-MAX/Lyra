import { useCallback, useEffect, useState } from 'react';

// Firebase only does the Google popup; the backend checks its token, stores the
// account in Cloudflare D1 and sets an httpOnly session cookie.
let firebaseAuth = null;

async function getFirebaseAuth(config) {
  if (!firebaseAuth) {
    const [{ initializeApp }, { getAuth }] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
    firebaseAuth = getAuth(initializeApp(config));
  }
  return firebaseAuth;
}

export function useAuth() {
  const [config, setConfig] = useState({ enabled: false, firebase: null });
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState('');

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

  const signIn = useCallback(async () => {
    if (!config.firebase) return;
    setError('');
    setSigningIn(true);
    try {
      const fbAuth = await getFirebaseAuth(config.firebase);
      const { GoogleAuthProvider, signInWithPopup, signOut: fbSignOut } = await import('firebase/auth');
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(fbAuth, provider);
      const idToken = await result.user.getIdToken();
      const res = await fetch('/api/auth/firebase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: idToken }),
      });
      const data = await res.json().catch(() => ({}));
      // Lyra's own cookie is the session from here on
      await fbSignOut(fbAuth).catch(() => { });
      if (!res.ok) throw new Error(data.detail || 'Sign-in failed');
      setUser(data.user);
    } catch (err) {
      if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        setError(err?.code === 'auth/unauthorized-domain'
          ? `Add ${window.location.hostname} to Firebase → Authentication → Settings → Authorized domains`
          : err.message || 'Sign-in failed');
      }
    } finally {
      setSigningIn(false);
    }
  }, [config.firebase]);

  const signOut = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => { });
    setUser(null);
  }, []);

  return { enabled: config.enabled, user, loading, signingIn, error, signIn, signOut };
}
