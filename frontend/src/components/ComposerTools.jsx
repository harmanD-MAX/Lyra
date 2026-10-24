import React, { useEffect, useRef, useState } from 'react';
import { X, Download, FileMusic, Archive, Loader2, RefreshCw } from 'lucide-react';

const STEM_LABELS = {
  lead_vocal_converted: 'Lead vocal (rendered)',
  harmony_vocal: 'Harmony vocal',
  lead_vocal_original_dry: 'Lead vocal (original, dry)',
  backing_vocals_original: 'Backing vocals (original)',
  instrumental: 'Instrumental',
  accompaniment: 'Accompaniment (inst + backing)',
};

function PianoRoll({ notes }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !notes?.length) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const end = Math.max(...notes.map((n) => n.end));
    const lo = Math.min(...notes.map((n) => n.note)) - 2;
    const hi = Math.max(...notes.map((n) => n.note)) + 2;
    const rowH = h / (hi - lo + 1);
    for (let m = lo; m <= hi; m++) {
      const black = [1, 3, 6, 8, 10].includes(m % 12);
      ctx.fillStyle = black ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.025)';
      ctx.fillRect(0, h - (m - lo + 1) * rowH, w, rowH);
    }
    for (const n of notes) {
      const x = (n.start / end) * w;
      const nw = Math.max(2, ((n.end - n.start) / end) * w);
      const y = h - (n.note - lo + 1) * rowH;
      const a = 0.45 + 0.55 * (n.velocity / 127);
      ctx.fillStyle = `rgba(229,169,88,${a})`;
      ctx.shadowColor = 'rgba(229,169,88,0.6)';
      ctx.shadowBlur = 6;
      ctx.fillRect(x, y + 1, nw, Math.max(2, rowH - 2));
    }
  }, [notes]);
  return <canvas ref={ref} className="w-full h-40 rounded-xl bg-black/50 border border-white/10" />;
}

export default function ComposerTools({ open, onClose, job, onRerendered }) {
  const results = job?.results || {};
  const [melody, setMelody] = useState(null);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(8);
  const [pitch, setPitch] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!open || !job?.id || !results.midi) return;
    fetch(`/api/melody/${job.id}`).then((r) => (r.ok ? r.json() : null)).then(setMelody).catch(() => setMelody(null));
  }, [open, job?.id, results.midi]);

  if (!open) return null;
  const analysis = results.analysis || melody?.analysis || {};
  const stems = results.stems || {};
  const canRerender = results.engine && results.engine !== 'world' && results.model_name !== 'raw';

  const rerender = async () => {
    setBusy(true);
    setMsg('');
    try {
      const fd = new FormData();
      fd.append('start_sec', start);
      fd.append('end_sec', end);
      fd.append('pitch_shift', pitch);
      const res = await fetch(`/api/jobs/${job.id}/rerender`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Re-render failed');
      setMsg(`Re-rendered ${start}s – ${end}s.`);
      onRerendered?.();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#111317] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#111317]/95 backdrop-blur">
          <div>
            <h2 className="text-lg font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Composer tools</h2>
            <p className="text-xs text-white/50">Stems, MIDI and section re-render for your DAW.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-white/10 cursor-pointer" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-8">
          {/* Analysis */}
          <section className="flex flex-wrap gap-2">
            {[
              ['Key', analysis.key || analysis.detected_key || '—'],
              ['Tempo', analysis.bpm ? `${analysis.bpm} BPM` : '—'],
              ['Pitch engine', analysis.pitch_mode ? `${analysis.pitch_mode}${analysis.correction_strength ? ` · ${Math.round(analysis.correction_strength * 100)}%` : ''}` : '—'],
              ['Separation', (results.separation_engine || '—').split(':')[0]],
              ['Render', results.engine || '—'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-white/10 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-white/40">{k}</div>
                <div className="text-sm font-medium">{v}</div>
              </div>
            ))}
          </section>

          {/* Melody */}
          {melody?.notes?.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white/85">Final melody</h3>
                <a href={results.midi} className="inline-flex items-center gap-1.5 text-xs text-[#e5a958] hover:underline"><FileMusic className="w-3.5 h-3.5" /> Download MIDI</a>
              </div>
              <PianoRoll notes={melody.notes} />
            </section>
          )}

          {/* Stems */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white/85">24-bit stems</h3>
              {results.stems_zip && <a href={results.stems_zip} className="inline-flex items-center gap-1.5 text-xs text-[#e5a958] hover:underline"><Archive className="w-3.5 h-3.5" /> Download all (.zip)</a>}
            </div>
            {Object.keys(stems).length === 0 && <p className="text-sm text-white/45">This job was made before stems were exported.</p>}
            <div className="grid sm:grid-cols-2 gap-2">
              {Object.entries(stems).map(([k, url]) => (
                <a key={k} href={`${url}?download=true`} className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-3 text-sm hover:border-white/30 transition">
                  <span>{STEM_LABELS[k] || k}</span>
                  <Download className="w-4 h-4 text-white/50" />
                </a>
              ))}
            </div>
          </section>

          {/* Re-render */}
          <section className="rounded-2xl border border-white/10 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white/85 flex items-center gap-2"><RefreshCw className="w-4 h-4 text-[#3fe0c5]" /> Re-render a section</h3>
            {!canRerender ? (
              <p className="text-sm text-white/45">Available for renders made with a voice model.</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  {[
                    ['Start (s)', start, setStart, 0.1],
                    ['End (s)', end, setEnd, 0.1],
                    ['Pitch shift', pitch, setPitch, 1],
                  ].map(([label, val, set, step]) => (
                    <label key={label} className="block">
                      <span className="text-white/60">{label}</span>
                      <input type="number" step={step} value={val} onChange={(e) => set(parseFloat(e.target.value) || 0)} className="mt-1 w-full bg-[#1a1d23] border border-white/10 rounded-lg px-2 py-2 text-sm" />
                    </label>
                  ))}
                </div>
                <button type="button" disabled={busy || end <= start} onClick={rerender} className="rounded-full bg-[#e5a958] text-black font-semibold px-5 py-2.5 text-sm cursor-pointer disabled:opacity-40 inline-flex items-center gap-2">
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />} Re-render section
                </button>
                {msg && <p className="text-xs text-white/60">{msg}</p>}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
