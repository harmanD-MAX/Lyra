import React, { useEffect, useRef, useState } from 'react';
import { LogOut, Music2 } from 'lucide-react';

// Signed-in avatar with a dropdown: who you are, My Songs and Sign out.
export default function AccountMenu({ user, onSignOut, onOpenSongs, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const initial = (user.name || user.email || '?').charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-9 h-9 rounded-full overflow-hidden border border-white/15 hover:border-[#e5a958] transition-colors cursor-pointer grid place-items-center bg-white/10 text-sm font-semibold text-white"
        aria-haspopup="menu"
        aria-expanded={open}
        title={user.email}
      >
        {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" /> : initial}
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} mt-2 w-64 rounded-2xl border border-white/10 bg-[#111216]/95 backdrop-blur-xl shadow-2xl p-2 z-[60] animate-fadeIn`}
        >
          <div className="px-3 py-2.5 border-b border-white/[0.06] mb-1">
            <div className="text-sm font-semibold text-white truncate">{user.name || 'Signed in'}</div>
            <div className="text-xs text-white/50 truncate">{user.email}</div>
          </div>
          {onOpenSongs && (
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onOpenSongs(); }}
              className="w-full flex items-center gap-2.5 px-3 h-9 rounded-lg text-sm text-white/75 hover:text-white hover:bg-white/[0.06] cursor-pointer"
            >
              <Music2 className="w-4 h-4" /> My Songs
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onSignOut(); }}
            className="w-full flex items-center gap-2.5 px-3 h-9 rounded-lg text-sm text-white/75 hover:text-rose-300 hover:bg-white/[0.06] cursor-pointer"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
