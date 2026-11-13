"""
Run Seed-VC phrase by phrase, singing Lyra's cleaned pitch curve.

Two problems with running Seed-VC's inference.py on a whole song:

  * Seed-VC fits the reference clip and the source into one 30 s window, so a
    long song is cut into fixed-length chunks (30 s minus the reference) that
    are generated separately and crossfaded. Those seams land in the middle of
    words, where they break word endings and crackle.
  * It reads the source melody with RMVPE, and on vocals separated from a full
    song that read carries tracker errors (octave flips, spikes, jitter).

This wrapper cuts the source only in the pauses between sung phrases, renders
each phrase whole (models are loaded once) and places it back at its original
time, and, when given one, hands Seed-VC Lyra's cleaned pitch curve in place
of its own read of the source. The reference clip's pitch is still read by
Seed-VC as usual.

Seed-VC itself is not modified: its RMVPE class and load_models are patched in
this process only, and its own main() renders every phrase. Run with
cwd = the Seed-VC checkout:

    python seedvc_guided.py [--lyra-f0 curve.npy --lyra-f0-fps 100] <inference.py args>
"""

import argparse
import glob
import os
import shutil
import sys
import tempfile

import numpy as np

CONTEXT_SECONDS = 30.0      # Seed-VC's window for reference + source (44.1 kHz singing model)
REFERENCE_CAP = 25.0        # Seed-VC uses at most this much of the reference
MIN_PAUSE = 0.12            # seconds of quiet that count as a pause between phrases
EDGE_FADE = 0.012           # seconds of fade where a phrase meets a cut


def _pop_arg(argv, name, default=None):
    if name in argv:
        i = argv.index(name)
        value = argv[i + 1]
        del argv[i:i + 2]
        return value
    return default


def _str2bool(v):
    return str(v).lower() in ("1", "true", "yes", "y", "t")


def _seedvc_args(argv):
    """The arguments Seed-VC's inference.py takes, with its defaults."""
    p = argparse.ArgumentParser()
    p.add_argument("--source", type=str)
    p.add_argument("--target", type=str)
    p.add_argument("--output", type=str, default="./reconstructed")
    p.add_argument("--diffusion-steps", type=int, default=30)
    p.add_argument("--length-adjust", type=float, default=1.0)
    p.add_argument("--inference-cfg-rate", type=float, default=0.7)
    p.add_argument("--f0-condition", type=_str2bool, default=False)
    p.add_argument("--auto-f0-adjust", type=_str2bool, default=False)
    p.add_argument("--semi-tone-shift", type=int, default=0)
    p.add_argument("--checkpoint", type=str, default=None)
    p.add_argument("--config", type=str, default=None)
    p.add_argument("--fp16", type=_str2bool, default=True)
    return p.parse_args(argv)


def _frames_16k(n_samples, sr):
    """RMVPE frame count (hop 160 at 16 kHz) for audio of n_samples at sr."""
    return int(n_samples / float(sr) * 16000) // 160 + 1


def _resample_curve(curve, fps, n_frames, start_s=0.0):
    """Map a (Hz, 0 = unvoiced) curve at `fps` onto n_frames RMVPE frames (100 fps) from start_s."""
    t_src = np.arange(len(curve)) / float(fps)
    t_dst = start_s + np.arange(n_frames) / 100.0
    voiced = curve > 0
    if voiced.sum() < 2:
        return np.zeros(n_frames, dtype=np.float32)
    log_f0 = np.interp(t_dst, t_src[voiced], np.log(curve[voiced]))
    nearest = np.clip(np.round(t_dst * fps).astype(int), 0, len(curve) - 1)
    return np.where(voiced[nearest], np.exp(log_f0), 0.0).astype(np.float32)


def find_phrases(y, sr, max_seconds):
    """
    Split a vocal into pieces cut only in pauses. Each piece is as long as
    possible up to max_seconds; a phrase longer than that is kept whole (Seed-VC
    then chunks it internally, the old behaviour). Returns [(start, end, has_voice)].
    """
    hop = int(sr * 0.01)
    n = len(y) // hop
    if n < 10:
        return [(0, len(y), True)]
    rms = np.sqrt(np.mean(y[: n * hop].reshape(n, hop) ** 2, axis=1) + 1e-12)
    db = 20 * np.log10(rms)
    quiet = db < (np.percentile(db, 95) - 40.0)
    # centres of pauses at least MIN_PAUSE long are allowed cut points
    cuts = []
    min_len = int(MIN_PAUSE / 0.01)
    i = 0
    while i < n:
        if quiet[i]:
            j = i
            while j < n and quiet[j]:
                j += 1
            if j - i >= min_len and i > 0 and j < n:
                cuts.append(((i + j) // 2) * hop)
            i = j
        else:
            i += 1
    # Greedy: grow a piece pause by pause; close it at the last pause that still fits
    pieces, start, prev = [], 0, None
    max_len = int(max_seconds * sr)
    for c in cuts + [len(y)]:
        if c - start > max_len and prev is not None and prev > start:
            pieces.append((start, prev))
            start = prev
        prev = c
    pieces.append((start, len(y)))
    return [(a, b, bool(np.any(~quiet[a // hop: max(a // hop + 1, b // hop)])))
            for a, b in pieces if b > a]


def main():
    argv = sys.argv[1:]
    curve_path = _pop_arg(argv, "--lyra-f0")
    fps = float(_pop_arg(argv, "--lyra-f0-fps", "100"))
    args = _seedvc_args(argv)

    seedvc_dir = os.getcwd()
    here = os.path.dirname(os.path.abspath(__file__))
    sys.path = [seedvc_dir] + [p for p in sys.path if os.path.abspath(p or ".") not in (here, seedvc_dir)]

    import soundfile as sf

    curve = np.load(curve_path).astype(np.float64) if curve_path else None
    ref_info = sf.info(args.target)
    ref_seconds = min(ref_info.frames / float(ref_info.samplerate), REFERENCE_CAP)
    max_piece = max(4.0, CONTEXT_SECONDS - ref_seconds - 0.5)

    # --- patch: Lyra's pitch curve for the source phrase (the reference keeps Seed-VC's read)
    state = {"curve": None, "src_frames": -1, "ref_frames": _frames_16k(int(ref_seconds * 16000), 16000),
             "calls": 0, "used": False}
    from modules import rmvpe
    original_f0 = rmvpe.RMVPE.infer_from_audio

    def guided_infer_from_audio(self, audio, thred=0.03):
        f0 = original_f0(self, audio, thred=thred)
        state["calls"] += 1
        if state["curve"] is None or state["used"]:
            return f0
        n = len(f0)
        is_source = abs(n - state["src_frames"]) <= 3
        if is_source and abs(state["src_frames"] - state["ref_frames"]) <= 3:
            is_source = state["calls"] >= 2  # same length: Seed-VC reads the reference first
        if is_source:
            state["used"] = True
            return state["curve"](n)
        return f0

    rmvpe.RMVPE.infer_from_audio = guided_infer_from_audio

    import inference
    original_load = inference.load_models
    cache = {}

    def cached_load_models(a):
        if "m" not in cache:
            cache["m"] = original_load(a)
        return cache["m"]

    inference.load_models = cached_load_models

    y, sr = sf.read(args.source, dtype="float32", always_2d=True)
    y = y.mean(axis=1)
    phrases = find_phrases(y, sr, max_piece)
    print(f"[lyra] rendering {len(phrases)} phrase(s), cut only in pauses (max {max_piece:.0f}s each)")

    out_sr = 44100 if args.f0_condition else 22050
    out = np.zeros(int(round(len(y) / float(sr) * out_sr)), dtype=np.float32)
    work = tempfile.mkdtemp(prefix="lyra_phrases_")
    guided_count = 0
    try:
        for k, (a, b, has_voice) in enumerate(phrases):
            if not has_voice:
                continue
            piece = os.path.join(work, f"p{k:04d}.wav")
            sf.write(piece, y[a:b], sr)
            pout = os.path.join(work, f"o{k:04d}")
            os.makedirs(pout, exist_ok=True)
            state.update(calls=0, used=False, src_frames=_frames_16k(b - a, sr))
            if curve is not None:
                start_s = a / float(sr)
                state["curve"] = lambda n, s=start_s: _resample_curve(curve, fps, n, s)
            run_args = argparse.Namespace(**vars(args))
            run_args.source, run_args.output = piece, pout
            inference.main(run_args)
            if state["used"]:
                guided_count += 1
            res = sorted(glob.glob(os.path.join(pout, "*.wav")), key=os.path.getmtime)
            if not res:
                raise RuntimeError(f"Seed-VC produced no output for phrase {k}")
            w, wsr = sf.read(res[-1], dtype="float32", always_2d=True)
            w = w.mean(axis=1)
            if wsr != out_sr:
                import librosa
                w = librosa.resample(w, orig_sr=wsr, target_sr=out_sr)
            oa = int(round(a / float(sr) * out_sr))
            ob = min(len(out), int(round(b / float(sr) * out_sr)))
            w = w[: ob - oa] if len(w) >= ob - oa else np.pad(w, (0, ob - oa - len(w)))
            f = min(int(EDGE_FADE * out_sr), len(w) // 2)
            if f > 0:
                ramp = np.linspace(0.0, 1.0, f, dtype=np.float32)
                if a > 0:
                    w[:f] *= ramp
                if b < len(y):
                    w[-f:] *= ramp[::-1]
            out[oa:ob] += w
    finally:
        shutil.rmtree(work, ignore_errors=True)

    if curve is not None and guided_count:
        print(f"[lyra] using Lyra's cleaned pitch curve ({guided_count} phrase(s))")
    os.makedirs(args.output, exist_ok=True)
    sf.write(os.path.join(args.output, "vc_lyra_phrases.wav"), out, out_sr, subtype="FLOAT")


if __name__ == "__main__":
    main()
