import React, { useRef } from 'react';
import { X, Mic2, AudioWaveform, Upload, Link as LinkIcon, Users, Music4, Wand2, Layers } from 'lucide-react';

const KEYS = ['auto', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const SINGERS = [
  { id: 'arijit_singh', name: 'Arijit Singh', vibe: 'Soulful warmth' },
  { id: 'sonu_nigam', name: 'Sonu Nigam', vibe: 'Classical range' },
  { id: 'kk', name: 'KK', vibe: 'Rock & soul' },
];

function Slider({ label, value, onChange, min = 0, max = 1, step = 0.01, format, hint }) {
  return (
    <label className="block">
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-white/80 font-medium">{label}</span>
        <span className="font-mono text-white/50">{format ? format(value) : `${Math.round(value * 100)}%`}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="lyra-range w-full" />
      {hint && <span className="text-[11px] text-white/40">{hint}</span>}
    </label>
  );
}

function Seg({ value, options, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`px-3 py-1.5 rounded-lg text-xs border transition cursor-pointer ${value === v ? 'bg-[#e5a958] text-black border-[#e5a958] font-semibold' : 'border-white/10 text-white/70 hover:text-white hover:border-white/30'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function CreativeControls({ open, onClose, creative, setCreative, selectedModel, setSelectedModel, personalVoices, onOpenVoiceLab }) {
  const guideInput = useRef(null);
  if (!open) return null;
  const set = (patch) => setCreative((c) => ({ ...c, ...patch }));
  const myVoice = creative.studioMode === 'my_voice';
  const readyVoices = (personalVoices || []).filter((v) => v.is_ready);
  const [keyRoot, keyMode] = creative.key === 'auto' ? ['auto', 'major'] : creative.key.split(' ');

  const targets = [
    ...(myVoice ? [{ id: 'raw', name: 'Your voice', vibe: 'Untouched timbre, fixed pitch', icon: Mic2 }] : []),
    ...readyVoices.map((v) => ({ id: v.id, name: v.name, vibe: 'Personal model', icon: Users })),
    ...SINGERS.map((s) => ({ ...s, icon: AudioWaveform })),
  ];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#111317] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#111317]/95 backdrop-blur">
          <div>
            <h2 className="text-lg font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Creative controls</h2>
            <p className="text-xs text-white/50">Everything here shapes the next render.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-white/10 cursor-pointer" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-8">
          {/* Mode */}
          <section className="grid sm:grid-cols-2 gap-3">
            {[
              ['convert', AudioWaveform, 'Convert a song', 'A finished song gets its lead vocal re-sung.'],
              ['my_voice', Mic2, 'My Voice', 'You sing. Lyra fixes timing & pitch, then picks who sings it.'],
            ].map(([v, Icon, t, b]) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  set({ studioMode: v });
                  if (v === 'convert' && selectedModel === 'raw') setSelectedModel('arijit_singh');
                }}
                className={`text-left rounded-2xl border p-4 transition cursor-pointer ${creative.studioMode === v ? 'border-[#e5a958] bg-[#e5a958]/10' : 'border-white/10 hover:border-white/25'}`}
              >
                <Icon className="w-5 h-5 text-[#e5a958]" />
                <div className="mt-2 font-semibold">{t}</div>
                <div className="text-xs text-white/55 mt-1">{b}</div>
              </button>
            ))}
          </section>

          {/* Target */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white/85">Who sings it</h3>
              <button type="button" onClick={onOpenVoiceLab} className="text-xs text-[#e5a958] hover:underline cursor-pointer">Voice Lab: train your voice →</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {targets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedModel(t.id)}
                  className={`text-left rounded-xl border p-3 transition cursor-pointer ${selectedModel === t.id ? 'border-[#e5a958] bg-[#e5a958]/10' : 'border-white/10 hover:border-white/25'}`}
                >
                  <div className="flex items-center gap-2 font-medium text-sm"><t.icon className="w-4 h-4 text-white/60" />{t.name}</div>
                  <div className="text-[11px] text-white/45 mt-0.5">{t.vibe}</div>
                </button>
              ))}
            </div>
          </section>

          {/* Guide */}
          {myVoice && (
            <section className="rounded-2xl border border-white/10 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-white/85"><Music4 className="w-4 h-4 text-[#3fe0c5]" /> Guide song (optional, recommended)</div>
              <p className="text-xs text-white/50">The original song you sang along to. Lyra follows its melody and timing and uses its backing track.</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <button type="button" onClick={() => guideInput.current?.click()} className="flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm hover:border-white/35 cursor-pointer">
                  <Upload className="w-4 h-4" /> {creative.guideFile ? creative.guideFile.name : 'Upload guide'}
                </button>
                <input ref={guideInput} type="file" accept="audio/*" className="hidden" onChange={(e) => set({ guideFile: e.target.files?.[0] || null, guideUrl: '' })} />
                <div className="flex-1 flex items-center gap-2 rounded-xl border border-white/15 px-3">
                  <LinkIcon className="w-4 h-4 text-white/40" />
                  <input value={creative.guideUrl} onChange={(e) => set({ guideUrl: e.target.value, guideFile: null })} placeholder="…or paste a YouTube / Spotify link" className="flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-white/30" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-white/75 cursor-pointer">
                <input type="checkbox" checked={creative.alignTiming} onChange={(e) => set({ alignTiming: e.target.checked })} className="accent-[#e5a958]" />
                Align my timing to the original
              </label>
            </section>
          )}

          {/* Pitch engine */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white/85"><Wand2 className="w-4 h-4 text-[#e5a958]" /> Melody engine</div>
            <Seg
              value={creative.pitchMode}
              onChange={(v) => set({ pitchMode: v })}
              options={[['auto', 'Auto'], ['scale', 'Snap to key'], ['guide', 'Follow guide'], ['off', 'Off']]}
            />
            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <div className="text-xs text-white/80 font-medium mb-1.5">Key</div>
                <div className="flex gap-2">
                  <select value={keyRoot} onChange={(e) => set({ key: e.target.value === 'auto' ? 'auto' : `${e.target.value} ${keyMode}` })} className="flex-1 bg-[#1a1d23] border border-white/10 rounded-lg px-2 py-2 text-sm">
                    {KEYS.map((k) => <option key={k} value={k}>{k === 'auto' ? 'Auto-detect' : k}</option>)}
                  </select>
                  <select disabled={keyRoot === 'auto'} value={keyMode} onChange={(e) => set({ key: `${keyRoot} ${e.target.value}` })} className="flex-1 bg-[#1a1d23] border border-white/10 rounded-lg px-2 py-2 text-sm disabled:opacity-40">
                    <option value="major">major</option>
                    <option value="minor">minor</option>
                    <option value="harmonic_minor">harmonic minor</option>
                  </select>
                </div>
              </div>
              <Slider
                label="Correction"
                value={creative.correction ?? (myVoice ? 0.85 : 0.2)}
                onChange={(v) => set({ correction: v })}
                hint={creative.correction === null ? `Default for ${myVoice ? 'your takes' : 'pro recordings'}` : 'How firmly notes land on pitch'}
              />
              <Slider label="Steadiness" value={creative.steadiness} onChange={(v) => set({ steadiness: v })} hint="Removes wobble & drift, keeps real vibrato" />
              <Slider label="Vibrato bloom" value={creative.vibrato} onChange={(v) => set({ vibrato: v })} hint="Adds vibrato to long straight notes" />
              <Slider label="Retune speed" value={creative.retuneMs} min={10} max={120} step={1} onChange={(v) => set({ retuneMs: v })} format={(v) => `${Math.round(v)} ms`} hint="Lower = snappier, higher = more natural glides" />
            </div>
          </section>

          {/* Harmony & separation */}
          <section className="grid sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-white/85"><Users className="w-4 h-4 text-[#3fe0c5]" /> Harmony line</div>
              <Seg
                value={creative.harmony}
                onChange={(v) => set({ harmony: v })}
                options={[['none', 'None'], ['third_above', '3rd above'], ['third_below', '3rd below'], ['fifth_above', '5th above']]}
              />
              {selectedModel === 'raw' && creative.harmony !== 'none' && <p className="text-[11px] text-amber-300/80">Harmony needs a voice model target.</p>}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-white/85"><Layers className="w-4 h-4 text-[#3fe0c5]" /> Vocal cleanup</div>
              <label className="flex items-center gap-2 text-sm text-white/75 cursor-pointer">
                <input type="checkbox" checked={creative.splitBacking} onChange={(e) => set({ splitBacking: e.target.checked })} className="accent-[#e5a958]" />
                Keep backing vocals original (convert lead only)
              </label>
              <label className="flex items-center gap-2 text-sm text-white/75 cursor-pointer">
                <input type="checkbox" checked={creative.dereverb} onChange={(e) => set({ dereverb: e.target.checked })} className="accent-[#e5a958]" />
                Remove reverb before conversion
              </label>
            </div>
          </section>
        </div>

        <div className="sticky bottom-0 px-6 py-4 border-t border-white/10 bg-[#111317]/95 backdrop-blur flex justify-end">
          <button type="button" onClick={onClose} className="rounded-full bg-[#e5a958] text-black font-semibold px-6 py-2.5 cursor-pointer hover:bg-[#f0bb6e]">Done</button>
        </div>
      </div>
    </div>
  );
}
