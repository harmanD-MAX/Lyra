import React, { useEffect, useState } from 'react';
import { X, Download, Laptop, CheckCircle2, Loader2, RotateCcw } from 'lucide-react';

/** Polls whether the Lyra download helper on the user's computer is connected. */
export function useHelperStatus(active = true, everyMs = 15000) {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    const load = () => fetch('/api/helper/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setStatus(d); })
      .catch(() => {});
    load();
    const id = setInterval(load, everyMs);
    return () => { alive = false; clearInterval(id); };
  }, [active, everyMs]);
  return status;
}

/*
 * YouTube and Instagram block downloads from cloud servers (Colab, Kaggle), not
 * from home internet. The helper runs on the user's computer: links pasted into
 * Lyra download there and are sent to the server for conversion.
 */
export default function DownloadHelper({ open, onClose }) {
  const status = useHelperStatus(open, 3000);
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  useEffect(() => { if (open) setResetDone(false); }, [open]);
  if (!open) return null;

  const online = status?.online;
  const reset = async () => {
    setResetting(true);
    try { await fetch('/api/helper/reset', { method: 'POST' }); setResetDone(true); } finally { setResetting(false); }
  };

  const Step = ({ n, children }) => (
    <li className="flex gap-3">
      <span className="w-6 h-6 rounded-full grid place-items-center bg-[#e5a958]/15 text-[#e5a958] text-xs font-bold shrink-0">{n}</span>
      <div className="text-sm text-white/80 leading-relaxed">{children}</div>
    </li>
  );

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div className="panel rim-glow w-full max-w-lg max-h-[92vh] overflow-y-auto !bg-[#0f1115] p-6 space-y-5 animate-scaleIn" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
              <Laptop className="w-5 h-5 text-[#e5a958]" /> Download through your computer
            </h2>
            <p className="text-xs text-white/50 mt-1">
              YouTube and Instagram block downloads from cloud servers like Colab, but not from home internet.
              With the Lyra helper running on your computer, Spotify, YouTube and Instagram links download there
              and Lyra converts them here as usual.
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm btn-icon" title="Close"><X /></button>
        </div>

        <div className={`rounded-xl border p-3 text-sm flex items-center gap-2.5 ${online
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : 'border-white/10 bg-white/[0.03] text-white/70'}`}>
          {online ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <Loader2 className="w-4 h-4 animate-spin text-white/40 shrink-0" />}
          <div className="flex-1 min-w-0">
            {online
              ? <>Connected: <b>{status.helper?.name || 'your computer'}</b>. Links now download through it.</>
              : 'Waiting for your computer... (start the helper below)'}
            {online && status.helper?.js === 'none' && (
              <div className="text-[11px] text-amber-200 mt-1">Install Deno (deno.com) on that computer so YouTube downloads work reliably.</div>
            )}
          </div>
        </div>

        <ol className="space-y-3.5">
          <Step n={1}>
            <a href="/api/helper/download" className="btn btn-primary btn-sm"><Download /> Download the helper</a>
            <div className="text-[11px] text-white/45 mt-1.5">A small zip, already set up with your Lyra address and a private key.</div>
          </Step>
          <Step n={2}>
            Install <a className="text-[#e5a958] underline" href="https://www.python.org/downloads/" target="_blank" rel="noreferrer">Python 3</a> if
            you don't have it (Windows: tick <i>Add python.exe to PATH</i>), and{' '}
            <a className="text-[#e5a958] underline" href="https://deno.com" target="_blank" rel="noreferrer">Deno</a> for YouTube. Only once.
          </Step>
          <Step n={3}>
            Unzip it and start it:
            <div className="text-[12px] text-white/60 mt-1 space-y-0.5">
              <div><b>Windows:</b> double-click <code className="text-[#3fe0c5]">start-helper.bat</code></div>
              <div>
                <b>Mac:</b> open <b>Terminal</b>, type <code className="text-[#3fe0c5]">bash </code> (with a space), drag{' '}
                <code className="text-[#3fe0c5]">start-helper.command</code> into the Terminal window and press Enter.
                <div className="text-white/40">Double-clicking it shows "Apple could not verify..." because it isn't from the App Store;
                  Terminal avoids that, or allow it once in System Settings → Privacy &amp; Security → Open Anyway.</div>
              </div>
            </div>
          </Step>
          <Step n={4}>Keep its window open while you use Lyra. The status above turns green.</Step>
        </ol>

        <div className="text-[11px] text-white/40 leading-relaxed space-y-1.5 border-t border-white/[0.06] pt-4">
          <p>New Colab session with a new address? Download the helper again, or start it with <code>--server NEW_ADDRESS</code>.</p>
          <p>
            The helper's <code>config.json</code> holds a private key for your Lyra; don't share it. If you did, reset the key
            (helpers downloaded before stop working):{' '}
            <button type="button" onClick={reset} disabled={resetting} className="inline-flex items-center gap-1 text-white/70 hover:text-white underline">
              <RotateCcw className="w-3 h-3" /> {resetDone ? 'Key reset. Download the helper again.' : 'Reset key'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
