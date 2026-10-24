// Shared state shape for the studio's creative controls.

export const DEFAULT_CREATIVE = {
  studioMode: 'convert',      // 'convert' | 'my_voice'
  pitchMode: 'auto',          // auto | scale | guide | off
  key: 'auto',
  correction: null,           // null = backend default (gentle for songs, strong for My Voice)
  steadiness: 0.5,
  vibrato: 0.0,
  retuneMs: 40,
  harmony: 'none',
  splitBacking: true,
  dereverb: true,
  guideFile: null,
  guideUrl: '',
  alignTiming: true,
};

export function creativeSummary(c, targetName) {
  const parts = [`${c.studioMode === 'my_voice' ? 'My Voice' : 'Convert'} → ${targetName}`];
  if (c.studioMode === 'my_voice' && (c.guideFile || c.guideUrl)) parts.push('guide song');
  if (c.pitchMode === 'off') parts.push('no tuning');
  else if (c.correction !== null) parts.push(`tuning ${Math.round(c.correction * 100)}%`);
  if (c.key !== 'auto') parts.push(`key ${c.key}`);
  if (c.harmony !== 'none') parts.push(c.harmony.replace('_', ' '));
  return parts.join(' · ');
}
