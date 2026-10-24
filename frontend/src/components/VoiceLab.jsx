import React, { useEffect, useRef, useState } from 'react';
import { X, Mic2, Upload, Trash2, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

/**
 * Voice Lab: train a personal voice model from your own recordings,
 * or register an RVC v2 model trained elsewhere.
 */
export default function VoiceLab({ open, onClose, voices, onVoicesChanged }) {
  const [name, setName] = useState('My Voice');
  const [files, setFiles] = useState([]);
  const [steps, setSteps] = useState(2000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uploadName, setUploadName] = useState('');
  const [pth, setPth] = useState(null);
  const [idx, setIdx] = useState(null);
  const recInput = useRef(null);

  const training = (voices || []).some((v) => ['queued', 'training', 'pending'].includes(v.status));

  // Poll while a model is training
  useEffect(() => {
    if (!open || !training) return undefined;
    const id = setInterval(onVoicesChanged, 4000);
    return () => clearInterval(id);
  }, [open, training, onVoicesChanged]);

  if (!open) return null;

  const totalMb = files.reduce((a, f) => a + f.size, 0) / 1e6;

  const train = async () => {
    setError('');
    if (!files.length) { setError('Add at least one recording.'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('name', name || 'My Voice');
      fd.append('steps', steps);
      files.forEach((f) => fd.append('recordings', f));
      const res = await fetch('/api/voices/train', { method: 'POST', body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Training request failed');
      setFiles([]);
      onVoicesChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const upload = async () => {
    setError('');
    if (!pth) { setError('Choose a .pth model file.'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('name', uploadName || pth.name.replace(/\.pth$/, ''));
      fd.append('model_file', pth);
      if (idx) fd.append('index_file', idx);
      const res = await fetch('/api/voices/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Upload failed');
      setPth(null); setIdx(null); setUploadName('');
      onVoicesChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    await fetch(`/api/voices/${id}`, { method: 'DELETE' });
    onVoicesChanged();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#111317] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#111317]/95 backdrop-blur">
          <div>
            <h2 className="text-lg font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Voice Lab</h2>
            <p className="text-xs text-white/50">Teach Lyra your voice, so it can sing as you — in tune.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-white/10 cursor-pointer" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-8">
          {/* Existing voices */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-white/85">Your voices</h3>
            {(!voices || voices.length === 0) && <p className="text-sm text-white/45">No personal voices yet.</p>}
            {(voices || []).map((v) => (
              <div key={v.id} className="flex items-center gap-3 rounded-xl border border-white/10 px-4 py-3">
                {v.status === 'ready' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  : v.status === 'error' ? <AlertCircle className="w-4 h-4 text-rose-400" />
                    : <Loader2 className="w-4 h-4 animate-spin text-[#e5a958]" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{v.name}</div>
                  <div className="text-[11px] text-white/45 truncate">
                    {v.status === 'ready' ? `Ready${v.trained_minutes ? ` · ${v.trained_minutes} min of audio` : ''}` : v.message || v.status}
                  </div>
                  {['training', 'queued'].includes(v.status) && (
                    <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full bg-[#e5a958] transition-all" style={{ width: `${v.progress || 0}%` }} />
                    </div>
                  )}
                </div>
                <button type="button" onClick={() => remove(v.id)} className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-rose-300 cursor-pointer" aria-label={`Delete ${v.name}`}><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </section>

          {/* Train */}
          <section className="rounded-2xl border border-white/10 p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><Mic2 className="w-4 h-4 text-[#e5a958]" /> Train from your recordings</div>
            <ul className="text-xs text-white/55 space-y-1 list-disc pl-4">
              <li>10–20 minutes total works best (minimum ~30 seconds).</li>
              <li>Dry and quiet room, one mic distance, no music in the background.</li>
              <li>Mix reading aloud with singing scales and a few songs across your range.</li>
            </ul>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Voice name" className="w-full bg-[#1a1d23] border border-white/10 rounded-lg px-3 py-2 text-sm" />
            <button type="button" onClick={() => recInput.current?.click()} className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 px-4 py-6 text-sm text-white/70 hover:border-[#e5a958]/60 cursor-pointer">
              <Upload className="w-4 h-4" />
              {files.length ? `${files.length} recording${files.length > 1 ? 's' : ''} · ${totalMb.toFixed(1)} MB` : 'Choose recordings (WAV/MP3/M4A)'}
            </button>
            <input ref={recInput} type="file" accept="audio/*" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
            <label className="block">
              <div className="flex justify-between text-xs mb-1.5"><span className="text-white/80">Training length</span><span className="font-mono text-white/50">{steps} steps</span></div>
              <input type="range" min="500" max="6000" step="250" value={steps} onChange={(e) => setSteps(parseInt(e.target.value, 10))} className="lyra-range w-full" />
              <span className="text-[11px] text-white/40">More steps = closer likeness, longer training (GPU recommended).</span>
            </label>
            <button type="button" disabled={busy || training} onClick={train} className="w-full rounded-full bg-[#e5a958] text-black font-semibold py-3 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
              {training ? 'A voice is training…' : busy ? 'Uploading…' : 'Train my voice'}
            </button>
          </section>

          {/* Upload */}
          <section className="rounded-2xl border border-white/10 p-5 space-y-3">
            <div className="text-sm font-semibold">Already have an RVC v2 model?</div>
            <input value={uploadName} onChange={(e) => setUploadName(e.target.value)} placeholder="Voice name" className="w-full bg-[#1a1d23] border border-white/10 rounded-lg px-3 py-2 text-sm" />
            <div className="grid sm:grid-cols-2 gap-2 text-xs">
              <label className="rounded-lg border border-white/10 px-3 py-2.5 cursor-pointer hover:border-white/30 truncate">
                {pth ? pth.name : 'Model (.pth)'}
                <input type="file" accept=".pth" className="hidden" onChange={(e) => setPth(e.target.files?.[0] || null)} />
              </label>
              <label className="rounded-lg border border-white/10 px-3 py-2.5 cursor-pointer hover:border-white/30 truncate">
                {idx ? idx.name : 'Index (.index, optional)'}
                <input type="file" accept=".index" className="hidden" onChange={(e) => setIdx(e.target.files?.[0] || null)} />
              </label>
            </div>
            <button type="button" disabled={busy} onClick={upload} className="w-full rounded-full border border-white/20 py-2.5 text-sm hover:border-white/40 cursor-pointer disabled:opacity-40">Add model</button>
          </section>

          {error && <p className="text-sm text-rose-300">{error}</p>}
        </div>
      </div>
    </div>
  );
}
