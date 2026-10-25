import React, { useEffect, useRef, useState } from 'react';
import { X, Mic2, AudioWaveform, Upload, Link as LinkIcon, Users, Music4, ChevronDown, Check, Cpu } from 'lucide-react';
import { PRESETS } from '../creative';

const KEYS = ['auto', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const SINGERS = [
  { id: 'arijit_singh', name: 'Arijit Singh', vibe: 'Soulful warmth' },
  { id: 'sonu_nigam', name: 'Sonu Nigam', vibe: 'Classical range' },
  { id: 'kk', name: 'KK', vibe: 'Rock & soul' },
];

function Slider({ label, value, onChange, min = 0, max = 1, step = 0.01, format }) {
  return (
    <label className="block">
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-white/75">{label}</span>
        <span className="font-mono text-white/45">{format ? format(value) : `${Math.round(value * 100)}%`}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="lyra-range w-full" />
    </label>
  );
}

function StepTitle({ n, children }) {
  return (
    <h3 className="flex items-center gap-2.5 text-sm font-semibold text-white/90 mb-3">
      <span className="w-6 h-6 rounded-full grid place-items-center text-[11px] font-mono bg-[#e5a958]/15 text-[#e5a958] border border-[#e5a958]/30">{n}</span>
      {children}
    </h3>
  );
}

export default function CreativeControls({ open, onClose, creative, setCreative, selectedModel, setSelectedModel, personalVoices }) {
  const guideInput = useRef(null);
  const [engineInfo, setEngineInfo] = useState(null);
  useEffect(() => {
    if (!open) return;
    fetch('/api/engines').then((r) => (r.ok ? r.json() : null)).then(setEngineInfo).catch(() => {});
  }, [open, personalVoices]);
  if (!open) return null;
  const voiceEngine = engineInfo?.voices?.[selectedModel];
  const engineLine = selectedModel === 'raw'
    ? 'Your own voice, re-synthesized with the corrected melody (no model).'
    : creative.advanced && creative.engine !== 'auto'
      ? `${engineInfo?.labels?.[creative.engine] || creative.engine} (chosen in Advanced)`
      : voiceEngine ? `${voiceEngine.label} — ${voiceEngine.reason}` : null;
  const set = (patch) => setCreative((c) => ({ ...c, ...patch }));
  const myVoice = creative.studioMode === 'my_voice';
  const readyVoices = (personalVoices || []).filter((v) => v.is_ready);
  const [keyRoot, keyMode] = creative.key === 'auto' ? ['auto', 'major'] : creative.key.split(' ');

  const targets = [
    ...(myVoice ? [{ id: 'raw', name: 'Your voice', vibe: 'As you, but in tune', icon: Mic2 }] : []),
    ...readyVoices.map((v) => ({ id: v.id, name: v.name, vibe: 'Your trained model', icon: Users })),
    ...SINGERS.map((s) => ({ ...s, icon: AudioWaveform })),
  ];

  const openAdvanced = (isOpen) => {
    if (isOpen && !creative.advanced) {
      // Start the fine controls from the chosen preset, so nothing jumps
      const p = PRESETS[creative.preset][creative.studioMode];
      set({ advanced: true, ...p });
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#111317] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#111317]/95 backdrop-blur">
          <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>Set up your song</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-white/10 cursor-pointer" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-8">
          {/* 1. Mode */}
          <section>
            <StepTitle n="1">What are you making?</StepTitle>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                ['my_voice', Mic2, 'I sang it', 'Make my own singing sound great.'],
                ['convert', AudioWaveform, 'A finished song', 'Re-sing an existing song in another voice.'],
              ].map(([v, Icon, t, b]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    set({ studioMode: v });
                    if (v === 'convert' && selectedModel === 'raw') setSelectedModel('arijit_singh');
                    if (v === 'my_voice' && SINGERS.some((x) => x.id === selectedModel)) setSelectedModel('raw');
                  }}
                  className={`text-left rounded-2xl border p-4 transition cursor-pointer ${creative.studioMode === v ? 'border-[#e5a958] bg-[#e5a958]/10' : 'border-white/10 hover:border-white/25'}`}
                >
                  <Icon className="w-5 h-5 text-[#e5a958]" />
                  <div className="mt-2 font-semibold">{t}</div>
                  <div className="text-xs text-white/55 mt-1">{b}</div>
                </button>
              ))}
            </div>
          </section>

          {/* 2. Voice */}
          <section>
            <StepTitle n="2">Who should sing it?</StepTitle>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {targets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedModel(t.id)}
                  className={`relative text-left rounded-xl border p-3 transition cursor-pointer ${selectedModel === t.id ? 'border-[#e5a958] bg-[#e5a958]/10' : 'border-white/10 hover:border-white/25'}`}
                >
                  {selectedModel === t.id && <Check className="absolute top-2.5 right-2.5 w-3.5 h-3.5 text-[#e5a958]" />}
                  <div className="flex items-center gap-2 font-medium text-sm"><t.icon className="w-4 h-4 text-white/60" />{t.name}</div>
                  <div className="text-[11px] text-white/45 mt-0.5">{t.vibe}</div>
                </button>
              ))}
            </div>
            {engineLine && (
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-white/55">
                <Cpu className="w-3.5 h-3.5 text-[#3fe0c5]" /> Sings with {engineLine}
              </p>
            )}
          </section>

          {/* Guide (My Voice only) */}
          {myVoice && (
            <section>
              <StepTitle n="3">Which song did you sing? <span className="font-normal text-white/40">(optional)</span></StepTitle>
              <div className="flex flex-col sm:flex-row gap-2">
                <button type="button" onClick={() => guideInput.current?.click()} className="flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm hover:border-white/35 cursor-pointer truncate">
                  <Upload className="w-4 h-4 shrink-0" /> {creative.guideFile ? creative.guideFile.name : 'Upload song'}
                </button>
                <input ref={guideInput} type="file" accept="audio/*" className="hidden" onChange={(e) => set({ guideFile: e.target.files?.[0] || null, guideUrl: '' })} />
                <div className="flex-1 flex items-center gap-2 rounded-xl border border-white/15 px-3">
                  <LinkIcon className="w-4 h-4 text-white/40" />
                  <input value={creative.guideUrl} onChange={(e) => set({ guideUrl: e.target.value, guideFile: null })} placeholder="or paste a YouTube / Spotify link" className="flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-white/30" />
                </div>
              </div>
              <p className="mt-2 text-[11px] text-white/45 flex items-center gap-1.5"><Music4 className="w-3.5 h-3.5 text-[#3fe0c5]" /> Lyra will follow its melody & timing and use its music.</p>
            </section>
          )}

          {/* Sound preset */}
          <section>
            <StepTitle n={myVoice ? '4' : '3'}>How polished?</StepTitle>
            <div className="grid sm:grid-cols-3 gap-2">
              {Object.entries(PRESETS).map(([k, p]) => {
                const active = !creative.advanced && creative.preset === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => set({ preset: k, advanced: false })}
                    className={`relative text-left rounded-xl border p-3.5 transition cursor-pointer ${active ? 'border-[#e5a958] bg-[#e5a958]/10' : 'border-white/10 hover:border-white/25'}`}
                  >
                    <div className="font-semibold text-sm flex items-center gap-1.5">
                      {p.label}
                      {k === 'polished' && <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#3fe0c5]/15 text-[#3fe0c5]">Recommended</span>}
                    </div>
                    <div className="text-[11px] text-white/50 mt-1 leading-snug">{p.blurb}</div>
                  </button>
                );
              })}
            </div>
            {selectedModel !== 'raw' && (
              <label className="mt-4 flex items-center gap-2.5 text-sm text-white/80 cursor-pointer w-fit">
                <input type="checkbox" checked={creative.addHarmony} onChange={(e) => set({ addHarmony: e.target.checked })} className="accent-[#e5a958] w-4 h-4" />
                Add a harmony voice
              </label>
            )}
          </section>

          {/* Advanced (collapsed) */}
          <details className="group rounded-2xl border border-white/10" open={creative.advanced} onToggle={(e) => openAdvanced(e.currentTarget.open)}>
            <summary className="list-none flex items-center justify-between px-4 py-3 cursor-pointer text-sm text-white/60 hover:text-white">
              <span>Advanced settings {creative.advanced && <span className="text-[#e5a958]">· in use</span>}</span>
              <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-4 pb-5 pt-1 space-y-5 border-t border-white/5">
              <p className="text-[11px] text-white/40 pt-3">Most songs don't need these. Picking a preset above switches them off again.</p>
              <div className="grid sm:grid-cols-2 gap-5">
                <label className="block text-xs">
                  <span className="text-white/75">Tuning mode</span>
                  <select value={creative.pitchMode} onChange={(e) => set({ pitchMode: e.target.value })} className="mt-1.5 w-full bg-[#1a1d23] border border-white/10 rounded-lg px-2 py-2 text-sm">
                    <option value="auto">Auto</option>
                    <option value="scale">Snap to key</option>
                    <option value="guide">Follow guide song</option>
                    <option value="off">Off</option>
                  </select>
                </label>
                <div className="text-xs">
                  <span className="text-white/75">Key</span>
                  <div className="mt-1.5 flex gap-2">
                    <select value={keyRoot} onChange={(e) => set({ key: e.target.value === 'auto' ? 'auto' : `${e.target.value} ${keyMode}` })} className="flex-1 bg-[#1a1d23] border border-white/10 rounded-lg px-2 py-2 text-sm">
                      {KEYS.map((k) => <option key={k} value={k}>{k === 'auto' ? 'Auto-detect' : k}</option>)}
                    </select>
                    <select disabled={keyRoot === 'auto'} value={keyMode} onChange={(e) => set({ key: `${keyRoot} ${e.target.value}` })} className="flex-1 bg-[#1a1d23] border border-white/10 rounded-lg px-2 py-2 text-sm disabled:opacity-40">
                      <option value="major">major</option>
                      <option value="minor">minor</option>
                      <option value="harmonic_minor">harm. minor</option>
                    </select>
                  </div>
                </div>
 <label className="block text-xs sm:col-span-2">
                  <span className="text-white/75">Voice engine</span>
                  <select value={creative.engine} onChange={(e) => set({ engine: e.target.value })} className="mt-1.5 w-full bg-[#1a1d23] border border-white/10 rounded-lg px-2 py-2 text-sm">
                    <option value="auto">Auto — benchmark winner, else Seed-VC when ready, else RVC</option>
                    <option value="seedvc" disabled={voiceEngine && !voiceEngine.available?.seedvc}>Seed-VC singing (44.1 kHz) — clearer lyrics, closer likeness</option>
                    <option value="rvc" disabled={voiceEngine && !voiceEngine.available?.rvc}>RVC v2 (40/48 kHz) — tightest pitch, cleanest audio</option>
                  </select>
                </label>
                <Slider label="Pitch correction" value={creative.correction} onChange={(v) => set({ correction: v })} />
                <Slider label="Steadiness" value={creative.steadiness} onChange={(v) => set({ steadiness: v })} />
                <Slider label="Vibrato" value={creative.vibrato} onChange={(v) => set({ vibrato: v })} />
                <Slider label="Retune speed" value={creative.retuneMs} min={10} max={120} step={1} onChange={(v) => set({ retuneMs: v })} format={(v) => `${Math.round(v)} ms`} />
              </div>
              <div className="grid sm:grid-cols-2 gap-3 text-sm text-white/75">
                <label className="text-xs">
                  <span className="text-white/75">Harmony interval</span>
                  <select value={creative.harmony} onChange={(e) => set({ harmony: e.target.value, addHarmony: true })} className="mt-1.5 w-full bg-[#1a1d23] border border-white/10 rounded-lg px-2 py-2 text-sm">
                    <option value="third_above">3rd above</option>
                    <option value="third_below">3rd below</option>
                    <option value="fifth_above">5th above</option>
                  </select>
                </label>
                <div className="space-y-2 pt-5">
                  {[
                    ['splitBacking', 'Keep original backing vocals'],
                    ['dereverb', 'Remove reverb first'],
                    ...(myVoice ? [['alignTiming', 'Align my timing to the song']] : []),
                  ].map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2 cursor-pointer text-xs">
                      <input type="checkbox" checked={creative[k]} onChange={(e) => set({ [k]: e.target.checked })} className="accent-[#e5a958]" />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </details>
        </div>

        <div className="sticky bottom-0 px-6 py-4 border-t border-white/10 bg-[#111317]/95 backdrop-blur flex justify-end">
          <button type="button" onClick={onClose} className="rounded-full bg-[#e5a958] text-black font-semibold px-6 py-2.5 cursor-pointer hover:bg-[#f0bb6e]">Done</button>
        </div>
      </div>
    </div>
  );
}
