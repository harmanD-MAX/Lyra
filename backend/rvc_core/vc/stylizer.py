"""
Approach C: Hybrid Pitch Contour & Phrasing Stylizer
Musicological Phrasing Engine for Arijit Singh & Sonu Nigam

Transforms standard pitch tracks into artist-authentic performances:
- Arijit Singh: Soulful Meend (portamento glides), delayed vibrato bloom (~5.15Hz), and intimate release inflections.
- Sonu Nigam: Classical Harkat / Murki ornamentation, laser Sur-Lock, and agile vibrato (~5.95Hz).
"""

import numpy as np
import logging
from scipy.ndimage import gaussian_filter1d

logger = logging.getLogger(__name__)


def coarse_f0_from_pitchf(f0: np.ndarray) -> np.ndarray:
    """
    Quantizes continuous F0 (in Hz) into RVC v2 1-255 coarse mel-scale tokens.
    """
    f0_min = 50.0
    f0_max = 1100.0
    f0_mel_min = 1127.0 * np.log(1.0 + f0_min / 700.0)
    f0_mel_max = 1127.0 * np.log(1.0 + f0_max / 700.0)

    f0_safe = np.maximum(f0.copy(), 0.0)
    f0_mel = 1127.0 * np.log(1.0 + f0_safe / 700.0)
    
    pos_mask = (f0_mel > 0)
    f0_mel[pos_mask] = (f0_mel[pos_mask] - f0_mel_min) * 254.0 / (f0_mel_max - f0_mel_min) + 1.0
    f0_mel[f0_mel <= 1.0] = 1.0
    f0_mel[f0_mel > 255.0] = 255.0
    return np.rint(f0_mel).astype(np.int32)


def stylize_pitch_contour(
    f0: np.ndarray,
    singer: str = "arijit_singh",
    strength: float = 0.85,
    fps: float = 100.0
) -> np.ndarray:
    """
    Musicological Pitch Contour & Phrasing Stylizer (Approach C).
    
    Args:
        f0: 1D numpy array of continuous pitch in Hz.
        singer: Target artist style ('arijit_singh' or 'sonu_nigam').
        strength: Stylistic expression strength (0.0 = raw pitch, 1.0 = maximum artist phrasing).
        fps: Pitch frame rate (default 100.0 Hz for 160-sample hop at 16kHz).
        
    Returns:
        1D numpy array of stylized continuous F0 in Hz.
    """
    if f0 is None or len(f0) == 0 or strength <= 0.01:
        return f0

    f0_out = f0.astype(np.float32).copy()
    voiced_mask = (f0_out > 50.0)
    if not np.any(voiced_mask):
        return f0_out

    # Convert voiced regions to fractional MIDI note space: 69 + 12 * log2(f0 / 440)
    midi = np.zeros_like(f0_out)
    midi[voiced_mask] = 69.0 + 12.0 * np.log2(f0_out[voiced_mask] / 440.0)

    # Detect continuous voiced phrase segments
    diffs = np.diff(voiced_mask.astype(np.int32))
    starts = np.where(diffs == 1)[0] + 1
    if voiced_mask[0]:
        starts = np.r_[0, starts]
    ends = np.where(diffs == -1)[0] + 1
    if voiced_mask[-1]:
        ends = np.r_[ends, len(voiced_mask)]

    singer_lower = singer.lower() if singer else "arijit_singh"
    is_arijit = ("arijit" in singer_lower)
    is_sonu = ("sonu" in singer_lower)
    is_kk = ("kk" in singer_lower)

    dt = 1.0 / fps

    for start, end in zip(starts, ends):
        seg_len = end - start
        if seg_len < 6:  # Less than 60ms, skip transient consonants
            continue

        seg_midi = midi[start:end].copy()
        t = np.arange(seg_len) * dt

        # =========================================================================
        # 0. High-Fidelity Vibrato & Vocal Vibration Decomposition
        # =========================================================================
        # Decompose the segment into:
        # - macro_contour: the slow-moving melodic trajectory (note steps, glides)
        # - input_vibrations: instantaneous micro-pitch fluctuations (vibrato, trills, gamak, throat tremor)
        sigma_macro = min(8.0, max(2.5, seg_len / 4.0))
        macro_contour = gaussian_filter1d(seg_midi, sigma=sigma_macro)
        input_vibrations = seg_midi - macro_contour

        # Detect whether the input vocal already possesses authentic vibrato/vibrations
        # A standard deviation > 0.04 semitones (4 cents) reliably detects human vocal vibrato
        input_vib_depth = float(np.std(input_vibrations))
        has_natural_vibrato = (input_vib_depth > 0.04)

        if is_arijit:
            # ==========================================
            # ARIJIT SINGH PHRASING & MEEND ENGINE
            # ==========================================
            # 1. Meend (Portamento Glide on Macro Contour):
            # Smooth out abrupt, unnatural pitch step jumps into soulful S-glides
            smoothed_macro = gaussian_filter1d(macro_contour, sigma=2.2)

            # 2. Authentic Vibrato Handling:
            # If the input vocal already has vibrato/vibrations, preserve 100% of them
            # and give them Arijit's warm, deep chest bloom (+10% depth).
            # If the input is straight-toned, bloom in Arijit's signature 5.15 Hz vibrato.
            if has_natural_vibrato:
                vibrato_layer = input_vibrations * 1.10
            else:
                vibrato_layer = np.zeros(seg_len, dtype=np.float32)
                bloom_onset_frames = int(0.26 * fps)  # 260ms delay
                if seg_len > bloom_onset_frames + 12:
                    bloom_time = t[bloom_onset_frames:] - t[bloom_onset_frames]
                    env = np.clip(bloom_time / 0.20, 0.0, 1.0)
                    vib_osc = np.sin(2.0 * np.pi * 5.15 * bloom_time)
                    vibrato_layer[bloom_onset_frames:] = env * 0.48 * vib_osc

            # 3. Soulful Phrase Release Inflection:
            # Gentle romantic downward dip (32 cents) at the tail of held phrases (>380ms)
            release_inflection = np.zeros(seg_len, dtype=np.float32)
            if seg_len > int(0.38 * fps):
                rel_frames = min(10, seg_len // 3)
                release_inflection[-rel_frames:] = np.linspace(0.0, -0.32, rel_frames)

            seg_stylized = smoothed_macro + vibrato_layer + release_inflection

        elif is_sonu:
            # ==========================================
            # SONU NIGAM CLASSICAL SUR & HARKAT ENGINE
            # ==========================================
            # 1. Classical Sur-Lock on Macro Contour:
            # Center the fundamental firmly onto clean musical intervals while retaining natural glides
            rounded_targets = np.round(macro_contour)
            diff = np.abs(macro_contour - rounded_targets)
            lock_weight = np.clip(1.0 - diff * 1.4, 0.0, 0.88)
            locked_macro = macro_contour * (1.0 - lock_weight) + rounded_targets * lock_weight

            # 2. Harkat / Murki Ornamentation on Note Transitions:
            # When jumping between notes (>1.0 semitones), inject agile classical grace flutter
            # A note change is a >1 semitone move within 50ms; one ornament per
            # transition (peaks at least 120ms apart), not one per frame.
            from scipy.signal import find_peaks
            murki = np.zeros(seg_len, dtype=np.float32)
            span = min(5, max(1, seg_len - 1))
            step_change = np.zeros(seg_len, dtype=np.float32)
            step_change[:-span] = macro_contour[span:] - macro_contour[:-span]
            jump_points, _ = find_peaks(np.abs(step_change), height=1.0, distance=12)
            for jp in jump_points:
                if 3 < jp < seg_len - 7:
                    direction = np.sign(step_change[jp])
                    murki_dur = min(6, seg_len - jp - 1)
                    if direction > 0:
                        murki[jp:jp + murki_dur] += 0.85 * np.sin(np.linspace(0, np.pi, murki_dur))
                    else:
                        murki[jp:jp + murki_dur] += 0.65 * np.sin(np.linspace(0, np.pi, murki_dur))

            # 3. Authentic Vibrato Handling:
            # If the input has vibrato, keep 100% of the input singer's natural vibrations.
            # If straight-toned, bloom in Sonu's agile classical 5.95 Hz vibrato.
            if has_natural_vibrato:
                vibrato_layer = input_vibrations
            else:
                vibrato_layer = np.zeros(seg_len, dtype=np.float32)
                onset_frames = int(0.16 * fps)
                if seg_len > onset_frames + 10:
                    vib_time = t[onset_frames:] - t[onset_frames]
                    env = np.clip(vib_time / 0.14, 0.0, 1.0)
                    vib_osc = np.sin(2.0 * np.pi * 5.95 * vib_time)
                    vibrato_layer[onset_frames:] = env * 0.35 * vib_osc

            seg_stylized = locked_macro + vibrato_layer + murki

        elif is_kk:
            # ==========================================
            # KK (KRISHNAKUMAR KUNNATH) ROCK SOUL ENGINE
            # ==========================================
            # 1. Straight-Tone Belting (Pure Raw Rock Energy on Macro):
            # 2. Dynamic Rock Push (+18 cents) at the peak of sustained phrases:
            push = np.zeros(seg_len, dtype=np.float32)
            if seg_len > int(0.45 * fps):
                mid_point = seg_len // 2
                push[mid_point:] = 0.18 * np.linspace(0.0, 1.0, seg_len - mid_point)

            if has_natural_vibrato:
                vibrato_layer = input_vibrations * 1.05
            else:
                vibrato_layer = np.zeros(seg_len, dtype=np.float32)
                rock_onset = int(0.35 * fps)
                if seg_len > rock_onset + 12:
                    vib_time = t[rock_onset:] - t[rock_onset]
                    env = np.clip(vib_time / 0.16, 0.0, 1.0)
                    vib_osc = np.sin(2.0 * np.pi * 5.75 * vib_time)
                    vibrato_layer[rock_onset:] = env * 0.38 * vib_osc

            seg_stylized = macro_contour + vibrato_layer + push

        else:
            seg_stylized = seg_midi

        # Blend original with stylized contour according to strength
        blended = seg_midi * (1.0 - strength) + seg_stylized * strength
        f0_out[start:end] = 440.0 * (2.0 ** ((blended - 69.0) / 12.0))

    return f0_out

