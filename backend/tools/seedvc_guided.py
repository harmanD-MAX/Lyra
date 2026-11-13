"""
Run Seed-VC's own inference.py with Lyra's cleaned pitch curve.

Seed-VC reads the source melody with RMVPE. On vocals separated from a full
song that read carries tracker errors (octave flips, spikes, jitter from music
bleed) and the converted voice sings them as wobbly or wrong notes. Lyra
already has a cleaned (and, if asked, corrected) curve for the same audio, so
this wrapper hands that curve to Seed-VC in place of its own read of the
source. The reference clip's pitch is still read by Seed-VC as usual.

Seed-VC itself is not modified: its RMVPE class is patched in this process
only, then inference.py runs unchanged. Run with cwd = the Seed-VC checkout:

    python seedvc_guided.py --lyra-f0 curve.npy --lyra-f0-fps 100 <inference.py args>
"""

import os
import sys

import numpy as np


def _pop_arg(argv, name, default=None):
    if name in argv:
        i = argv.index(name)
        value = argv[i + 1]
        del argv[i:i + 2]
        return value
    return default


def _arg(argv, name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


def _frames_16k(path, max_seconds=None):
    """RMVPE frame count (hop 160 at 16 kHz) for an audio file, as Seed-VC loads it."""
    import soundfile as sf
    info = sf.info(path)
    seconds = info.frames / float(info.samplerate)
    if max_seconds:
        seconds = min(seconds, max_seconds)
    return int(seconds * 16000) // 160 + 1


def _resample_curve(curve, fps, n_frames):
    """Map a (Hz, 0 = unvoiced) curve at `fps` onto `n_frames` RMVPE frames (100 fps)."""
    t_src = np.arange(len(curve)) / float(fps)
    t_dst = np.arange(n_frames) / 100.0
    voiced = curve > 0
    if voiced.sum() < 2:
        return np.zeros(n_frames, dtype=np.float32)
    log_f0 = np.interp(t_dst, t_src[voiced], np.log(curve[voiced]))
    nearest = np.clip(np.round(t_dst * fps).astype(int), 0, len(curve) - 1)
    return np.where(voiced[nearest], np.exp(log_f0), 0.0).astype(np.float32)


def main():
    argv = sys.argv[1:]
    curve_path = _pop_arg(argv, "--lyra-f0")
    fps = float(_pop_arg(argv, "--lyra-f0-fps", "100"))
    seedvc_dir = os.getcwd()
    # Seed-VC's modules must win over anything next to this script
    here = os.path.dirname(os.path.abspath(__file__))
    sys.path = [seedvc_dir] + [p for p in sys.path if os.path.abspath(p or ".") not in (here, seedvc_dir)]

    if curve_path:
        curve = np.load(curve_path).astype(np.float64)
        src_frames = _frames_16k(_arg(argv, "--source"))
        ref_frames = _frames_16k(_arg(argv, "--target"), max_seconds=25.0)
        state = {"calls": 0, "used": False}

        from modules import rmvpe
        original = rmvpe.RMVPE.infer_from_audio

        def guided_infer_from_audio(self, audio, thred=0.03):
            f0 = original(self, audio, thred=thred)
            state["calls"] += 1
            n = len(f0)
            is_source = abs(n - src_frames) <= 3
            if is_source and abs(src_frames - ref_frames) <= 3:
                is_source = state["calls"] >= 2  # same length: Seed-VC reads the reference first
            if is_source and not state["used"]:
                state["used"] = True
                guided = _resample_curve(curve, fps, n)
                print(f"[lyra] using Lyra's cleaned pitch curve ({int((guided > 0).sum())} voiced frames)")
                return guided
            return f0

        rmvpe.RMVPE.infer_from_audio = guided_infer_from_audio

    import runpy
    sys.argv = [os.path.join(seedvc_dir, "inference.py")] + argv
    runpy.run_path(os.path.join(seedvc_dir, "inference.py"), run_name="__main__")


if __name__ == "__main__":
    main()
