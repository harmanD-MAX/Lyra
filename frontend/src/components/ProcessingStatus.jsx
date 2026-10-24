import React, { lazy, Suspense } from 'react';
import { CheckCircle2, AlertTriangle, Cpu, Music, Mic2, Sparkles, Disc3, X } from 'lucide-react';
const VoiceOrb = lazy(() => import('./three/VoiceOrb'));

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

  const isPersonal = modelKey.startsWith('my_') || modelKey.includes('voice') || job.metadata?.mode === 'my_voice';
  const singerName = job.results?.singer || job.metadata?.singer_name || (
    isPersonal
      ? 'My Voice'
      : modelKey.includes('kk')
      ? 'KK'
      : modelKey.includes('sonu')
      ? 'Sonu Nigam'
      : 'Arijit Singh'
  );

  const stages = [
    { name: 'Ingest', detail: 'Reading audio', min: 0, max: 20, icon: Music },
    { name: 'Separate', detail: 'Vocal & music stems', min: 21, max: 55, icon: Disc3 },
    { name: 'Sing', detail: `${singerName} synthesis`, min: 56, max: 80, icon: Mic2 },
    { name: 'Tune', detail: 'Pitch lock & harmony', min: 81, max: 90, icon: Sparkles },
    { name: 'Master', detail: '3D spatial mix', min: 91, max: 100, icon: Cpu },
  ];
  const progress = Math.max(0, Math.min(100, job.progress || 0));

  return (
    <div className="panel rim-glow p-6 sm:p-8 overflow-hidden">
      <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full blur-3xl pointer-events-none bg-[#e5a958]/10" />

      <div className="relative grid md:grid-cols-[200px_1fr] gap-6 items-center">
        {/* 3D voice orb pulses while the pipeline runs */}
        <div className="relative mx-auto w-44 h-44 md:w-[200px] md:h-[200px]">
          <Suspense fallback={<div className="absolute inset-6 rounded-full bg-[radial-gradient(circle,rgba(229,169,88,0.35),transparent_70%)] animate-pulse" />}>
          <VoiceOrb
            className="absolute inset-0"
            active={isProcessing}
            colorA={isError ? '#fb7185' : '#e5a958'}
            colorB={isError ? '#fda4af' : '#3fe0c5'}
            interactive={false}
            scale={0.62}
          />
          </Suspense>
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <span className="text-2xl font-bold font-mono text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">{progress}%</span>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {isProcessing && <span className="eq-loader text-[#e5a958]"><span /><span /><span /><span /></span>}
                {isCompleted && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                {isError && <AlertTriangle className="w-4 h-4 text-rose-400" />}
                <span className="eyebrow text-white/50">{job.status}</span>
              </div>
              <h3 className="mt-2 text-xl sm:text-2xl font-bold text-white tracking-tight">
                {isProcessing && <>Rendering with <span className="font-accent text-[#e5a958]">{singerName}</span></>}
                {isCompleted && <>Ready — sung by <span className="font-accent text-[#e5a958]">{singerName}</span></>}
                {isError && 'The render stopped'}
              </h3>
              <p className="mt-1 text-sm text-white/55 truncate">{job.message || 'Running the voice pipeline…'}</p>
            </div>

            {onReset && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    if (job?.id) {
                      await fetch(`/api/jobs/${job.id}/cancel`, { method: 'POST' });
                    }
                    await fetch('/api/jobs/clear_queue', { method: 'POST' });
                  } catch (e) {}
                  onReset();
                }}
                className="btn btn-secondary btn-sm shrink-0"
                title="Cancel and remove from queue"
              >
                <X /> Cancel
              </button>
            )}
          </div>

          <div className="mt-5 progress-track">
            <div
              className="progress-fill"
              style={{ width: `${progress}%`, ...(isError ? { background: '#fb7185', boxShadow: 'none' } : {}) }}
            />
          </div>

          <div className="mt-5 grid grid-cols-5 gap-2">
            {stages.map((stage) => {
              const Icon = stage.icon;
              const done = progress >= stage.max;
              const active = progress >= stage.min && progress < stage.max;
              return (
                <div key={stage.name} className="min-w-0">
                  <div className={`h-1 rounded-full mb-2.5 transition-colors duration-500 ${done ? 'bg-[#e5a958]' : active ? 'bg-[#e5a958]/50' : 'bg-white/10'}`} />
                  <div className="flex items-center gap-1.5">
                    <span className={`w-6 h-6 rounded-lg grid place-items-center shrink-0 border transition-colors ${
                      done
                        ? 'bg-[#e5a958]/15 border-[#e5a958]/40 text-[#e5a958]'
                        : active
                        ? 'bg-white/10 border-white/25 text-white'
                        : 'bg-white/[0.03] border-white/10 text-white/30'
                    }`}>
                      {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Icon className={`w-3.5 h-3.5 ${active ? 'animate-pulse' : ''}`} />}
                    </span>
                    <span className={`text-xs font-semibold truncate ${done || active ? 'text-white' : 'text-white/35'}`}>{stage.name}</span>
                  </div>
                  <p className="hidden sm:block mt-1 text-[10px] text-white/35 truncate">{stage.detail}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
