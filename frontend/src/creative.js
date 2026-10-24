// Shared state shape for the studio's creative controls.
//
// New users only choose a mode, a voice and one "sound" preset. The fine
// controls exist behind "Advanced" and only apply once someone opens it.

export const PRESETS = {
  natural: {
    label: 'Natural',
    blurb: 'Light touch. Keeps your character, smooths the rough spots.',
    my_voice: { correction: 0.45, steadiness: 0.3, vibrato: 0.0, retuneMs: 70 },
    convert: { correction: 0.0, steadiness: 0.0, vibrato: 0.0, retuneMs: 70 },
  },
  polished: {
    label: 'Polished',
    blurb: 'In tune and steady, still human. Best for most songs.',
    my_voice: { correction: 0.85, steadiness: 0.6, vibrato: 0.3, retuneMs: 40 },
    convert: { correction: 0.2, steadiness: 0.15, vibrato: 0.0, retuneMs: 45 },
  },
  perfect: {
    label: 'Studio perfect',
    blurb: 'Every note locked on pitch with trained vibrato.',
    my_voice: { correction: 1.0, steadiness: 0.85, vibrato: 0.5, retuneMs: 20 },
    convert: { correction: 0.5, steadiness: 0.3, vibrato: 0.0, retuneMs: 30 },
  },
};

export const DEFAULT_CREATIVE = {
  studioMode: 'convert',      // 'convert' | 'my_voice'
  preset: 'polished',
  addHarmony: false,
  guideFile: null,
  guideUrl: '',
  // Advanced (used only when `advanced` is true)
  advanced: false,
  pitchMode: 'auto',          // auto | scale | guide | off
  key: 'auto',
  correction: 0.85,
  steadiness: 0.6,
  vibrato: 0.3,
  retuneMs: 40,
  harmony: 'third_above',
  splitBacking: true,
  dereverb: true,
  alignTiming: true,
  engine: 'auto',             // auto | seedvc | rvc
};

/** The settings actually sent to the backend. */
export function resolveCreative(c) {
  const base = PRESETS[c.preset]?.[c.studioMode] || PRESETS.polished[c.studioMode];
  if (!c.advanced) {
    return {
      ...base,
      pitchMode: base.correction > 0 ? 'auto' : 'off',
      key: 'auto',
      harmony: c.addHarmony ? 'third_above' : 'none',
      splitBacking: true,
      dereverb: true,
      alignTiming: true,
      engine: 'auto',
    };
  }
  return {
    correction: c.correction,
    steadiness: c.steadiness,
    vibrato: c.vibrato,
    retuneMs: c.retuneMs,
    pitchMode: c.pitchMode,
    key: c.key,
    harmony: c.addHarmony ? c.harmony : 'none',
    splitBacking: c.splitBacking,
    dereverb: c.dereverb,
    alignTiming: c.alignTiming,
    engine: c.engine,
  };
}

export function creativeSummary(c, targetName) {
  const parts = [`${c.studioMode === 'my_voice' ? 'My Voice' : 'Convert'} → ${targetName}`];
  if (c.studioMode === 'my_voice' && (c.guideFile || c.guideUrl)) parts.push('guide song');
  parts.push(c.advanced ? 'custom sound' : PRESETS[c.preset]?.label || 'Polished');
  if (c.addHarmony) parts.push('harmony');
  return parts.join(' · ');
}
