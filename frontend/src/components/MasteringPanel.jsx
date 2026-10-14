import React from 'react';
import { Sparkles, RefreshCw, Radio, Mic2, Music, ShieldCheck } from 'lucide-react';

export default function MasteringPanel({
  isRemixing,
  onQuickRemix,
  canRemix,
  disabled
}) {
  return (
    <div className="bg-slate-900/90 border border-indigo-500/30 rounded-3xl p-6 sm:p-8 shadow-xl backdrop-blur-xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              Dolby 3D Audio & Grand Hall Orchestra Master
            </h2>
            <span className="text-[10px] uppercase font-extrabold tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
              On-Demand Remaster
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Initial conversion is 100% clean and natural. Click Remaster below to apply subtle 3D stereo ambience (0.03), delicate Grand Hall Reverb (0.05), lead vocal priority (+2.8 dB), and deeply reduced music pocket (-7.5 dB).
          </p>
        </div>

        {canRemix && (
          <button
            type="button"
            onClick={onQuickRemix}
            disabled={isRemixing || disabled}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 via-rose-600 to-amber-500 text-white shadow-md shadow-indigo-950/40 hover:opacity-95 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRemixing ? 'animate-spin' : ''}`} />
            {isRemixing ? 'Remastering...' : 'Remaster with Dolby 3D & Hall Reverb'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. 3D Dolby Stereo Sound */}
        <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Radio className="w-4 h-4 text-cyan-400" />
              3D Dolby Stereo
            </span>
            <span className="text-[11px] font-mono font-bold text-cyan-400">0.03</span>
          </div>
          <p className="text-xs text-white font-medium">Stable Lyrics Depth</p>
          <p className="text-[11px] text-slate-500">
            Tamed, stationary Haas micro-delays (11.5ms / 17.8ms) with stable center lead lyrics.
          </p>
        </div>

        {/* 2. Grand Hall Orchestra Reverb */}
        <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Hall Orchestra Reverb
            </span>
            <span className="text-[11px] font-mono font-bold text-amber-400">0.05</span>
          </div>
          <p className="text-xs text-white font-medium">Concert Hall Reverb</p>
          <p className="text-[11px] text-slate-500">
            Delicate, intimate symphony hall impulse response with velvet diffusion tail.
          </p>
        </div>

        {/* 3. Focused Vocal Level */}
        <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Mic2 className="w-4 h-4 text-rose-400" />
              Lead Vocal Focus
            </span>
            <span className="text-[11px] font-mono font-bold text-rose-400">+2.8 dB</span>
          </div>
          <p className="text-xs text-white font-medium">Forward & Articulate</p>
          <p className="text-[11px] text-slate-500">
            Priority vocal boost with upper-mid presence lift for crystal clear Hindi diction.
          </p>
        </div>

        {/* 4. Reduced Backing Music Pocket */}
        <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Music className="w-4 h-4 text-indigo-400" />
              Music Backing Pocket
            </span>
            <span className="text-[11px] font-mono font-bold text-indigo-400">-7.5 dB</span>
          </div>
          <p className="text-xs text-white font-medium">Deep Mid/Side Ducking</p>
          <p className="text-[11px] text-slate-500">
            Center music ducks when vocals sing, leaving spacious side orchestral depth.
          </p>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-2 text-emerald-400 font-semibold">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>True-Peak Limiter (-0.5 dBFS) & Broadcast Normalization (-14 LUFS)</span>
        </div>
        <span className="text-[11px] text-slate-500 font-medium">
          Applied on-demand with zero quality compromise.
        </span>
      </div>
    </div>
  );
}
