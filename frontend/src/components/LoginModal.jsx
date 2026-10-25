import React, { Suspense, lazy, useEffect } from 'react';
import { X, Cloud, Music2, ShieldCheck } from 'lucide-react';
import GoogleSignIn from './GoogleSignIn';
import LyraLogo from './LyraLogo';

const VoiceOrb = lazy(() => import('./three/VoiceOrb'));

export default function LoginModal({ auth, open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Close as soon as the Google sign-in completes
  useEffect(() => {
    if (open && auth.user) onClose();
  }, [open, auth.user, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-title"
    >
      <div
        className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-[#0d0e11] shadow-2xl grid md:grid-cols-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-9 h-9 grid place-items-center rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* 3D voice orb */}
        <div className="relative h-56 md:h-auto md:min-h-[440px] bg-gradient-to-br from-[#e5a958]/10 via-transparent to-[#3fe0c5]/10 border-b md:border-b-0 md:border-r border-white/[0.06]">
          <div className="hero-grid absolute inset-0 pointer-events-none opacity-60" />
          <Suspense fallback={null}>
            <VoiceOrb className="absolute inset-0" scale={0.85} active />
          </Suspense>
          <div className="absolute bottom-5 left-6 right-6 hidden md:block">
            <p className="text-sm text-white/70">Your voice, your songs, saved to the cloud.</p>
          </div>
        </div>

        {/* Sign-in */}
        <div className="p-8 sm:p-10 flex flex-col justify-center gap-6">
          <div className="flex items-center gap-3">
            <LyraLogo />
            <span className="text-lg font-bold uppercase tracking-[0.22em] text-white" style={{ fontFamily: 'var(--font-display)' }}>
              Lyra
            </span>
          </div>

          <div>
            <h2 id="login-title" className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>
              Log in to Lyra
            </h2>
            <p className="mt-2 text-sm text-white/55">Sign in with your Google account to open the studio and keep your songs.</p>
          </div>

          <ul className="space-y-2.5 text-sm text-white/70">
            <li className="flex items-center gap-2.5"><Music2 className="w-4 h-4 text-[#e5a958]" /> All your songs in My Songs</li>
            <li className="flex items-center gap-2.5"><Cloud className="w-4 h-4 text-[#3fe0c5]" /> Stored in Cloudflare, on any device</li>
            <li className="flex items-center gap-2.5"><ShieldCheck className="w-4 h-4 text-white/60" /> We only see your name, email and photo</li>
          </ul>

          {auth.enabled ? (
            <div className="flex flex-col items-center gap-2">
              <GoogleSignIn auth={auth} />
              {auth.error ? <p className="text-xs text-red-400 text-center">{auth.error}</p> : null}
            </div>
          ) : (
            <p className="text-sm text-amber-300/90 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3">
              Google sign-in isn't set up on this server yet. Add GOOGLE_CLIENT_ID and the Cloudflare D1 settings to backend/.env.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
