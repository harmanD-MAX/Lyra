import React, { useEffect, useRef } from 'react';

// Google's own rendered button, plus the signed-in avatar with a sign-out action.
export default function GoogleSignIn({ auth, size = 'medium' }) {
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!auth.googleReady || auth.user || !buttonRef.current) return;
    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: 'filled_black',
      size,
      shape: 'pill',
      text: 'signin_with',
    });
  }, [auth.googleReady, auth.user, size]);

  if (!auth.enabled) return null;

  if (auth.user) {
    return (
      <div className="flex items-center gap-2">
        {auth.user.picture ? (
          <img
            src={auth.user.picture}
            alt=""
            referrerPolicy="no-referrer"
            className="w-8 h-8 rounded-full border border-white/10"
          />
        ) : null}
        <span className="hidden sm:inline text-sm text-white/75 max-w-[10rem] truncate">
          {auth.user.name || auth.user.email}
        </span>
        <button
          type="button"
          onClick={auth.signOut}
          className="text-xs text-white/50 hover:text-white transition-colors cursor-pointer"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={buttonRef} />
      {auth.error ? <p className="text-xs text-red-400">{auth.error}</p> : null}
    </div>
  );
}
