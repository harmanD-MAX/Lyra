import React from 'react';
import { Loader2, CheckCircle2, AlertTriangle, Cpu, Music, Mic2, Sparkles, Disc3 } from 'lucide-react';

export default function ProcessingStatus({ job }) {
  if (!job) return null;

  const isCompleted = job.status === 'completed';
  const isError = job.status === 'error';
  const isProcessing = job.status === 'processing' || job.status === 'queued';

  const singerName = job.results?.singer || (
    job.metadata?.model_name === 'sonu_nigam' 
      ? 'Sonu Nigam' 
      : 'Arijit Singh'
  );

  const stages = [
    { name: '1. Audio Ingestion', min: 0, max: 20, icon: Music },
    { name: '2. Demucs Separation', min: 21, max: 55, icon: Disc3 },
    { name: `3. ${singerName} Synthesis`, min: 56, max: 80, icon: Mic2 },
    { name: '4. PSOLA Micro-Tuning', min: 81, max: 90, icon: Sparkles },
    { name: '5. Phase Remux & Master', min: 91, max: 100, icon: Cpu },
  ];

  return (
    <div className="bg-[#171717] border border-[#282828] rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
      {/* Background glow */}
      <div className={`absolute top-0 right-0 w-80 h-80 rounded-full blur-3xl pointer-events-none ${
        isCompleted ? 'bg-[#10a37f]/10' : isError ? 'bg-rose-500/10' : 'bg-[#10a37f]/10'
      }`}></div>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3.5">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
            isCompleted
              ? 'bg-[#10a37f]/15 text-[#10a37f] border border-[#10a37f]/30'
              : isError
              ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
              : 'bg-[#10a37f]/15 text-[#10a37f] border border-[#10a37f]/30'
          }`}>
            {isProcessing && <Loader2 className="w-5 h-5 animate-spin" />}
            {isCompleted && <CheckCircle2 className="w-5 h-5" />}
            {isError && <AlertTriangle className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              {isProcessing && 'Neural Timbre Synthesis In Progress...'}
              {isCompleted && `Track Successfully Synthesized with ${singerName}!`}
              {isError && 'Pipeline Interrupted'}
            </h3>
            <p className="text-xs text-[#888]">
              {job.message || 'Executing neural voice pipeline...'}
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-2xl font-black font-mono tracking-tight text-white">
            {job.progress}%
          </span>
          <p className="text-[10px] text-[#777] uppercase tracking-widest font-semibold">
            {job.status}
          </p>
        </div>
      </div>

      {/* Modern Progress Bar */}
      <div className="w-full bg-[#121212] rounded-full h-2.5 mb-6 overflow-hidden border border-[#262626]">
        <div 
          className={`h-full transition-all duration-500 ease-out rounded-full ${
            isCompleted 
              ? 'bg-[#10a37f]' 
              : isError 
              ? 'bg-rose-500' 
              : 'bg-gradient-to-r from-[#10a37f] via-[#12b98f] to-teal-400'
          }`}
          style={{ width: `${job.progress}%` }}
        ></div>
      </div>

      {/* 5-Stage Stepper Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-2.5">
        {stages.map((stage, idx) => {
          const Icon = stage.icon;
          const stageDone = job.progress >= stage.max;
          const stageActive = job.progress >= stage.min && job.progress < stage.max;

          return (
            <div 
              key={idx}
              className={`p-3 rounded-xl border text-center transition-all ${
                stageDone
                  ? 'bg-[#141414] border-[#10a37f]/30 text-[#10a37f]'
                  : stageActive
                  ? 'bg-[#1c1c1c] border-[#10a37f] text-white shadow-md'
                  : 'bg-[#121212] border-[#252525] text-[#555]'
              }`}
            >
              <Icon className={`w-4 h-4 mx-auto mb-1 ${stageActive ? 'animate-bounce text-[#10a37f]' : ''}`} />
              <p className="text-[11px] font-semibold truncate">{stage.name}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
