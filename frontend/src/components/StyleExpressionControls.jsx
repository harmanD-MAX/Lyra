import React from 'react';
import { Sparkles, Music2, Sliders, CheckCircle2, Info } from 'lucide-react';

export default function StyleExpressionControls({
  selectedModel,
  styleStrength,
  setStyleStrength,
  pitchShift,
  setPitchShift,
  disabled
}) {
  const isArijit = selectedModel === 'arijit_singh';
  const isSonu = selectedModel === 'sonu_nigam';
  const isKK = selectedModel === 'kk';
  const singerName = isArijit ? 'Arijit Singh' : isSonu ? 'Sonu Nigam' : 'KK';

  const presets = [
    { label: 'Raw Pitch', value: 0.0, desc: 'Original phrasing verbatim' },
    { label: 'Subtle', value: 0.50, desc: 'Gentle stylistic inflection' },
    { label: 'Studio Authentic', value: 0.85, desc: 'Recommended: Full signature style' },
    { label: 'Maximum', value: 1.0, desc: 'Dramatic glides & ornamentation' }
  ];

  return (
    <div className="bg-[#141414] border border-[#252525] rounded-2xl p-5 sm:p-6 space-y-5 transition-all">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#222] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#10a37f]/10 text-[#10a37f]">
              <Sparkles className="w-4 h-4" />
            </span>
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-white">
              2. Authentic Singing Phrasing & Style (Approach C)
            </h3>
          </div>
          <p className="text-xs text-[#888] mt-1">
            Transforms pitch contours to sound naturally sung by {singerName} with authentic ornamentation, vibrato, and glides.
          </p>
        </div>

        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-[#10a37f]/15 text-[#10a37f] border border-[#10a37f]/30 self-start sm:self-auto font-mono">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Approach C Active
        </span>
      </div>

      {/* Dynamic Singer Phrasing Badge */}
      <div className="p-4 rounded-xl bg-[#181818] border border-[#282828] space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white flex items-center gap-1.5">
            Active Persona: <span className="text-[#10a37f]">{singerName} Phrasing Engine</span>
          </span>
          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-[#222] text-[#aaa]">
            DSP Vectorized
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px]">
          {isArijit && (
            <>
              <div className="p-2.5 rounded-lg bg-[#111] border border-[#242424] text-[#ccc]">
                <span className="text-emerald-400 font-bold block mb-0.5">🌊 Portamento Glides</span>
                Soulful S-curve glides between notes instead of mechanical steps.
              </div>
              <div className="p-2.5 rounded-lg bg-[#111] border border-[#242424] text-[#ccc]">
                <span className="text-emerald-400 font-bold block mb-0.5">🌸 Delayed Vibrato Bloom</span>
                Initial 260ms held intimate & steady, followed by warm 5.15Hz bloom.
              </div>
              <div className="p-2.5 rounded-lg bg-[#111] border border-[#242424] text-[#ccc]">
                <span className="text-emerald-400 font-bold block mb-0.5">🍂 Vulnerable Release</span>
                Gentle romantic downward release dips (32 cents) at phrase endings.
              </div>
            </>
          )}

          {isSonu && (
            <>
              <div className="p-2.5 rounded-lg bg-[#111] border border-[#242424] text-[#ccc]">
                <span className="text-teal-400 font-bold block mb-0.5">⚡ Classical Grace Notes & Trills</span>
                Audible classical ornament runs (+0.85 st) on melodic jumps.
              </div>
              <div className="p-2.5 rounded-lg bg-[#111] border border-[#242424] text-[#ccc]">
                <span className="text-teal-400 font-bold block mb-0.5">🎯 Laser Pitch Centering</span>
                Pristine pitch centering that eliminates amateur vocal wobble and sag.
              </div>
              <div className="p-2.5 rounded-lg bg-[#111] border border-[#242424] text-[#ccc]">
                <span className="text-teal-400 font-bold block mb-0.5">💎 Agile 5.95Hz Vibrato</span>
                Fast, crisp classical vibrato with controlled 32-cent amplitude.
              </div>
            </>
          )}

          {isKK && (
            <>
              <div className="p-2.5 rounded-lg bg-[#111] border border-[#242424] text-[#ccc]">
                <span className="text-amber-400 font-bold block mb-0.5">🎸 Straight-Tone Rock Belt</span>
                Direct, powerful note attacks without pitch scooping or hesitation.
              </div>
              <div className="p-2.5 rounded-lg bg-[#111] border border-[#242424] text-[#ccc]">
                <span className="text-amber-400 font-bold block mb-0.5">🔥 Dynamic Rock Vibrato</span>
                Held straight for 350ms, then bursts with high-energy 5.75Hz vibrato.
              </div>
              <div className="p-2.5 rounded-lg bg-[#111] border border-[#242424] text-[#ccc]">
                <span className="text-amber-400 font-bold block mb-0.5">⚡ Stadium Vocal Power</span>
                Upper-mid harmonic projection (+18 cents push) for soaring choruses.
              </div>
            </>
          )}
        </div>
      </div>

      {/* Controls Grid: Style Strength + Pitch Shift */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Style Strength Slider */}
        <div className="p-4 rounded-xl bg-[#181818] border border-[#282828] space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-white flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-[#10a37f]" />
              Style & Phrasing Expression
            </label>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-[#222] text-[#10a37f]">
              {Math.round(styleStrength * 100)}%
            </span>
          </div>

          <input
            type="range"
            min="0.0"
            max="1.0"
            step="0.05"
            value={styleStrength}
            onChange={(e) => setStyleStrength(parseFloat(e.target.value))}
            disabled={disabled}
            className="w-full h-1.5 bg-[#252525] rounded-lg appearance-none cursor-pointer accent-[#10a37f]"
          />

          {/* Quick Presets */}
          <div className="grid grid-cols-4 gap-1 pt-1">
            {presets.map((p) => {
              const isActive = Math.abs(styleStrength - p.value) < 0.04;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setStyleStrength(p.value)}
                  disabled={disabled}
                  className={`py-1 px-1.5 rounded text-[10px] font-bold transition-all text-center cursor-pointer ${
                    isActive
                      ? 'bg-[#10a37f] text-black shadow-sm'
                      : 'bg-[#222] text-[#888] hover:text-white hover:bg-[#282828]'
                  }`}
                  title={p.desc}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Pitch Shift / Key Alignment */}
        <div className="p-4 rounded-xl bg-[#181818] border border-[#282828] space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-white flex items-center gap-1.5">
              <Music2 className="w-3.5 h-3.5 text-amber-400" />
              Pitch / Key Shift (Semitones)
            </label>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-[#222] text-amber-300">
              {pitchShift > 0 ? `+${pitchShift}` : pitchShift} {pitchShift === 0 ? '(Original Key)' : 'st'}
            </span>
          </div>

          <input
            type="range"
            min="-12"
            max="12"
            step="1"
            value={pitchShift}
            onChange={(e) => setPitchShift(parseInt(e.target.value))}
            disabled={disabled}
            className="w-full h-1.5 bg-[#252525] rounded-lg appearance-none cursor-pointer accent-amber-500"
          />

          <div className="flex items-center justify-between text-[10px] text-[#777] pt-1">
            <button
              type="button"
              onClick={() => setPitchShift(-12)}
              disabled={disabled}
              className="hover:text-white underline decoration-[#333] cursor-pointer"
            >
              -12 (Female → Male)
            </button>
            <button
              type="button"
              onClick={() => setPitchShift(0)}
              disabled={disabled}
              className="hover:text-white underline decoration-[#333] cursor-pointer"
            >
              0 (Original Key)
            </button>
            <button
              type="button"
              onClick={() => setPitchShift(12)}
              disabled={disabled}
              className="hover:text-white underline decoration-[#333] cursor-pointer"
            >
              +12 (Octave Up)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
