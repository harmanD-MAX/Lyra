import React from 'react';
import { Loader2, CheckCircle2, AlertTriangle, Cpu, Music, Mic2, Sparkles, Disc3 } from 'lucide-react';

export default function ProcessingStatus({ job, selectedModel, onReset }) {
  if (!job) return null;

  const isCompleted = job.status === 'completed';
  const isError = job.status === 'error';
  const isProcessing = job.status === 'processing' || job.status === 'queued';

  const modelKey = (
    job.results?.model_name || 
    job.metadata?.model_name || 
    selectedModel || 
    ''
  ).toLowerCase();

  const singerName = job.results?.singer || job.metadata?.singer_name || (
    modelKey.includes('kk') 
      ? 'KK' 
      : modelKey.includes('sonu') 
      ? 'Sonu Nigam' 
      : 'Arijit Singh'
  );

  const stages = [
    { name: '1. Audio Ingestion', min: 0, max: 20, icon: Music },
    { name: '2. Stem Separation', min: 21, max: 55, icon: Disc3 },
    { name: `3. ${singerName} Synthesis`, min: 56, max: 80, icon: Mic2 },
    { name: '4. Pitch Lock Harmonizer', min: 81, max: 90, icon: Sparkles },
    { name: '5. Dolby 3D Spatial Master', min: 91, max: 100, icon: Cpu },
  ];

  return (
    <div className="bg-[#121418] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
      {/* Background glow */}
      <div className={`absolute top-0 right-0 w-80 h-80 rounded-full blur-3xl pointer-events-none ${
        isCompleted ? 'bg-[#e5a958]/15' : isError ? 'bg-rose-500/15' : 'bg-[#e5a958]/10'
      }`}></div>

      <div className="flex items-center justify-between mb-6 relative z-10">
        <div className="flex items-center gap-3.5">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
            isCompleted
              ? 'bg-[#e5a958]/20 text-[#e5a958] border border-[#e5a958]/40 shadow-lg shadow-[#e5a958]/10'
              : isError
              ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
              : 'bg-[#e5a958]/15 text-[#e5a958] border border-[#e5a958]/30'
          }`}>
            {isProcessing && <Loader2 className="w-5 h-5 animate-spin" />}
            {isCompleted && <CheckCircle2 className="w-5 h-5" />}
            {isError && <AlertTriangle className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              {isProcessing && `Neural Timbre Synthesis In Progress...`}
              {isCompleted && `Track Successfully Synthesized with ${singerName}!`}
              {isError && 'Pipeline Interrupted'}
            </h3>
            <p className="text-xs text-white/50">
              {job.message || 'Executing neural voice pipeline...'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-2xl font-black font-mono tracking-tight text-[#e5a958]">
              {job.progress}%
            </span>
            <p className="text-[10px] text-white/40 uppercase tracking-widest font-semibold">
              {job.status}
            </p>
          </div>
          {onReset && (
            <button
              type="button"
              onClick={async () => {
                try {
                  await fetch('/api/jobs/clear_queue', { method: 'POST' });
                } catch (e) {}
                onReset();
              }}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-rose-500/20 text-white/70 hover:text-rose-300 text-xs font-semibold border border-white/10 transition-all cursor-pointer"
              title="Cancel and remove from queue"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Modern Progress Bar */}
      <div className="w-full bg-black/60 rounded-full h-2.5 mb-6 overflow-hidden border border-white/10 relative z-10">
        <div 
          className={`h-full transition-all duration-500 ease-out rounded-full ${
            isCompleted 
              ? 'bg-[#e5a958]' 
              : isError 
              ? 'bg-rose-500' 
              : 'bg-gradient-to-r from-[#e5a958] via-[#f5c070] to-[#ffd899] shadow-[0_0_12px_rgba(229,169,88,0.5)]'
          }`}
          style={{ width: `${job.progress}%` }}
        ></div>
      </div>

      {/* 5-Stage Stepper Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-2.5 relative z-10">
        {stages.map((stage, idx) => {
          const Icon = stage.icon;
          const stageDone = job.progress >= stage.max;
          const stageActive = job.progress >= stage.min && job.progress < stage.max;

          return (
            <div 
              key={idx}
              className={`p-3 rounded-xl border text-center transition-all ${
                stageDone
                  ? 'bg-black/40 border-[#e5a958]/35 text-[#e5a958]'
                  : stageActive
                  ? 'bg-[#1e222b] border-[#e5a958] text-white shadow-lg shadow-[#e5a958]/15 ring-1 ring-[#e5a958]/40'
                  : 'bg-black/20 border-white/5 text-white/35'
              }`}
            >
              <Icon className={`w-4 h-4 mx-auto mb-1 ${stageActive ? 'animate-bounce text-[#e5a958]' : ''}`} />
              <p className="text-[11px] font-semibold truncate">{stage.name}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
