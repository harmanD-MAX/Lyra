import React from 'react';
import { Sliders, ShieldCheck, Waves, Music2, Sparkles } from 'lucide-react';

export default function AcousticControls({
  pitchShift,
  setPitchShift,
  f0Method,
  setF0Method,
  indexRate,
  setIndexRate,
  protect,
  setProtect,
  disabled
}) {
  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Sliders className="w-5 h-5 text-amber-400" />
            2. Vocal & Pitch Perfection Controls
          </h2>
          <p className="text-xs text-slate-400">
            Engineered to preserve pristine diction, eliminate voice cracking, and maintain melodic pitch & sustain.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pitch Shift (Key Alignment) */}
        <div className="space-y-3 bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Music2 className="w-4 h-4 text-rose-400" />
              Pitch / Key Shift (Semitones)
            </label>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-rose-300">
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
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
          />

          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <button
              type="button"
              onClick={() => setPitchShift(-12)}
              disabled={disabled}
              className="hover:text-slate-300 underline decoration-slate-700"
            >
              -12 (Female → Male)
            </button>
            <button
              type="button"
              onClick={() => setPitchShift(0)}
              disabled={disabled}
              className="hover:text-slate-300 underline decoration-slate-700"
            >
              0 (Same Key)
            </button>
            <button
              type="button"
              onClick={() => setPitchShift(12)}
              disabled={disabled}
              className="hover:text-slate-300 underline decoration-slate-700"
            >
              +12 (Octave Up)
            </button>
          </div>
        </div>

        {/* Pitch Extraction Algorithm */}
        <div className="space-y-3 bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Waves className="w-4 h-4 text-amber-400" />
              Neural Pitch Tracker Algorithm
            </label>
            <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
              Zero Cracking
            </span>
          </div>

          <select
            value={f0Method}
            onChange={(e) => setF0Method(e.target.value)}
            disabled={disabled}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
          >
            <option value="rmvpe">RMVPE (Recommended: Pristine Pitch & Vocal Micro-Bends)</option>
            <option value="harvest">Harvest (Best for sustained emotional vocals & long notes)</option>
            <option value="crepe">Crepe (Deep neural network pitch estimation)</option>
            <option value="pm">PM (Fast pitch contour tracking)</option>
          </select>

          <p className="text-[11px] text-slate-500">
            RMVPE avoids pitch breaks, ensuring the vocal catches exact micro-bends and vibrato without stammering.
          </p>
        </div>

        {/* Consonant & Diction Guard */}
        <div className="space-y-3 bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Vocal Diction & Consonant Guard
            </label>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-emerald-300">
              {protect}
            </span>
          </div>

          <input
            type="range"
            min="0.0"
            max="0.5"
            step="0.01"
            value={protect}
            onChange={(e) => setProtect(parseFloat(e.target.value))}
            disabled={disabled}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
          />

          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>0.0 (High AI Blend)</span>
            <span className="text-emerald-400 font-medium">0.33 (Crisp Hindi Consonants 'ख, थ, छ')</span>
            <span>0.50 (Max Clarity)</span>
          </div>
          <p className="text-[11px] text-slate-500">
            Protects voiceless breath sounds and consonants so Hindi word pronunciation is 100% natural and never slurred.
          </p>
        </div>

        {/* Arijit Singh Timbre Index Matching */}
        <div className="space-y-3 bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              Arijit Singh Timbre Weight (Index Rate)
            </label>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-indigo-300">
              {Math.round(indexRate * 100)}%
            </span>
          </div>

          <input
            type="range"
            min="0.0"
            max="1.0"
            step="0.05"
            value={indexRate}
            onChange={(e) => setIndexRate(parseFloat(e.target.value))}
            disabled={disabled}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />

          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>0% (Source Dynamics)</span>
            <span className="text-indigo-400 font-medium">75% (Studio Arijit Tone)</span>
            <span>100% (Full Feature Retrieval)</span>
          </div>
          <p className="text-[11px] text-slate-500">
            Controls how deeply the neural model retrieves Arijit Singh's signature chest resonance and nasal overtone.
          </p>
        </div>
      </div>
    </div>
  );
}
