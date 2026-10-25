import React, { useEffect, useRef } from 'react';

// Google's own rendered "Sign in with Google" button.
export default function GoogleSignIn({ auth, size = 'large', width = 280 }) {
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!auth.googleReady || auth.user || !buttonRef.current) return;
    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: 'filled_black',
      size,
      shape: 'pill',
      text: 'continue_with',
      width,
    });
  }, [auth.googleReady, auth.user, size, width]);

  return <div ref={buttonRef} className="min-h-[44px] flex justify-center" />;
}
