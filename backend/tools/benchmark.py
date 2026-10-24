"""
Lyra quality benchmark: measure conversions instead of judging by ear.

    python tools/benchmark.py --clips bench/clips --model arijit_singh \
        --reference bench/arijit_refs --engines rvc,seedvc --out bench/report.json

For every clip x engine x setting it renders the conversion and reports:

    pitch_accuracy   % of voiced frames within 50 cents of the intended melody
    pitch_rmse_cents RMS pitch error vs the intended melody (cents)
    voicing_recall   % of intended voiced frames that came out voiced
    speaker_sim      cosine similarity of ECAPA speaker embeddings to the
                     target's reference clips (needs `speechbrain`)
    wer              Whisper word error rate of output vs input transcript
                     (needs `openai-whisper`; Hindi works with --language hi)

With more than one engine, the engine with the best combined score
(speaker similarity 50%, pitch accuracy 25%, intelligibility 25%) is saved
to models/engine_choice.json and becomes that voice's "auto" engine.
Confirm with a blind listening test.
"""

import argparse
import glob
import json
import os
import sys
import tempfile

import numpy as np

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)
os.chdir(BACKEND)


def pitch_metrics(intended_f0, intended_fps, rendered_path):
    import soundfile as sf
    import melody
    import voice_enhance

    y, sr = sf.read(rendered_path, always_2d=True)
    out_f0 = voice_enhance.analyse_f0(y.mean(axis=1), sr)
    out_fps = 1000.0 / voice_enhance.FRAME_PERIOD_MS
    t = np.arange(len(out_f0)) / out_fps
    src_t = np.arange(len(intended_f0)) / intended_fps
    want = np.interp(t, src_t, intended_f0, left=0, right=0)
    want_v = want > 50
    got_v = out_f0 > 50
    both = want_v & got_v
    if both.sum() < 10:
        return {"pitch_accuracy": 0.0, "pitch_rmse_cents": None, "voicing_recall": float(got_v[want_v].mean()) if want_v.any() else 0.0}
    cents = 1200 * np.log2(out_f0[both] / want[both])
    return {
        "pitch_accuracy": round(float(np.mean(np.abs(cents) < 50)) * 100, 1),
        "pitch_rmse_cents": round(float(np.sqrt(np.mean(cents ** 2))), 1),
        "voicing_recall": round(float(got_v[want_v].mean()) * 100, 1),
    }


class SpeakerScorer:
    def __init__(self, reference_dir):
        from speechbrain.inference.speaker import EncoderClassifier
        self.model = EncoderClassifier.from_hparams(source="speechbrain/spkrec-ecapa-voxceleb")
        refs = sorted(glob.glob(os.path.join(reference_dir, "*.wav")))
        if not refs:
            raise ValueError(f"No reference .wav files in {reference_dir}")
        self.ref = np.mean([self.embed(p) for p in refs], axis=0)

    def embed(self, path):
        import librosa
        import torch
        y, _ = librosa.load(path, sr=16000, mono=True)
        with torch.no_grad():
            e = self.model.encode_batch(torch.from_numpy(y).unsqueeze(0)).squeeze().numpy()
        return e / (np.linalg.norm(e) + 1e-9)

    def score(self, path):
        e = self.embed(path)
        return round(float(np.dot(e, self.ref / (np.linalg.norm(self.ref) + 1e-9))), 4)


class WerScorer:
    def __init__(self, language=None):
        import whisper
        self.model = whisper.load_model("small")
        self.language = language

    def text(self, path):
        return self.model.transcribe(path, language=self.language)["text"].strip().lower()

    def wer(self, ref_text, path):
        hyp = self.text(path).split()
        ref = ref_text.split()
        d = np.zeros((len(ref) + 1, len(hyp) + 1), dtype=int)
        d[:, 0] = np.arange(len(ref) + 1)
        d[0, :] = np.arange(len(hyp) + 1)
        for i in range(1, len(ref) + 1):
            for j in range(1, len(hyp) + 1):
                d[i, j] = min(d[i - 1, j] + 1, d[i, j - 1] + 1, d[i - 1, j - 1] + (ref[i - 1] != hyp[j - 1]))
        return round(d[-1, -1] / max(len(ref), 1), 3)


def _score(avg: dict) -> float:
    """Combined score in 0..1 from whichever metrics were measured."""
    parts = []
    if avg.get("speaker_sim") is not None:
        parts.append((0.5, max(0.0, avg["speaker_sim"])))
    if avg.get("pitch_accuracy") is not None:
        parts.append((0.25, avg["pitch_accuracy"] / 100.0))
    if avg.get("wer") is not None:
        parts.append((0.25, max(0.0, 1.0 - avg["wer"])))
    if not parts:
        return 0.0
    return sum(w * v for w, v in parts) / sum(w for w, _ in parts)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--clips", required=True, help="folder of dry vocal clips (.wav)")
    ap.add_argument("--model", required=True, help="singer id or personal voice id")
    ap.add_argument("--reference", help="folder of the target voice's real recordings (for speaker_sim)")
    ap.add_argument("--index-rates", default="0.28", help="comma-separated index rates to sweep")
    ap.add_argument("--protects", default="0.33", help="comma-separated protect values to sweep")
    ap.add_argument("--correction", type=float, default=0.0, help="pitch correction strength during the test")
    ap.add_argument("--language", default=None, help="Whisper language code, e.g. hi")
    ap.add_argument("--engines", default="rvc", help="comma-separated: rvc, seedvc")
    ap.add_argument("--no-save-choice", action="store_true", help="don't update models/engine_choice.json")
    ap.add_argument("--out", default="benchmark_report.json")
    args = ap.parse_args()

    import audio_processor
    import engines
    import voice_enhance
    import soundfile as sf

    model_info = audio_processor.resolve_model_info(args.model)
    clips = sorted(glob.glob(os.path.join(args.clips, "*.wav")))
    if not clips:
        sys.exit(f"No .wav clips in {args.clips}")
    wanted = [e.strip() for e in args.engines.split(",") if e.strip()]
    available = engines.engine_options(model_info)
    run_engines = [e for e in wanted if available.get(e)]
    for e in wanted:
        if e not in run_engines:
            print(f"[skip engine {e}] not available for {args.model} (install Seed-VC / add a reference clip)")
    if not run_engines:
        sys.exit("No requested engine is available.")

    spk = None
    if args.reference:
        try:
            spk = SpeakerScorer(args.reference)
        except Exception as e:
            print(f"[speaker_sim disabled] {e}")
    wer = None
    try:
        wer = WerScorer(args.language)
    except Exception as e:
        print(f"[wer disabled] {e}")

    ref_texts = {c: wer.text(c) for c in clips} if wer else {}
    # Intended melody = the source melody (no correction during the test)
    src_f0 = {}
    for c in clips:
        y, sr = sf.read(c, always_2d=True)
        src_f0[c] = voice_enhance.analyse_f0(y.mean(axis=1), sr)
    src_fps = 1000.0 / voice_enhance.FRAME_PERIOD_MS

    rows = []
    work = tempfile.mkdtemp(prefix="lyra_bench_")
    settings = []
    for eng in run_engines:
        if eng == "rvc":
            settings += [("rvc", float(ir), float(pr)) for ir in args.index_rates.split(",") for pr in args.protects.split(",")]
        else:
            settings.append((eng, None, None))
    for eng, ir, pr in settings:
        for clip in clips:
            name = os.path.splitext(os.path.basename(clip))[0]
            out = os.path.join(work, f"{name}_{eng}_{ir}_{pr}.wav")
            if eng == "seedvc":
                engines.convert_seedvc(clip, model_info, out)
            else:
                audio_processor.convert_voice(
                    vocal_path=clip, output_dir=work, model_name=args.model, index_rate=ir, protect=pr,
                    output_name=os.path.basename(out),
                )
            row = {"clip": name, "engine": eng, "index_rate": ir, "protect": pr}
            row.update(pitch_metrics(src_f0[clip], src_fps, out))
            if spk:
                row["speaker_sim"] = spk.score(out)
            if wer:
                row["wer"] = wer.wer(ref_texts[clip], out)
            rows.append(row)
            print(row)

    summary = {}
    for row in rows:
        key = row["engine"] if row["engine"] != "rvc" else f"rvc index_rate={row['index_rate']} protect={row['protect']}"
        summary.setdefault(key, []).append(row)
    averages = {}
    for key, rs in summary.items():
        avg = {}
        for metric in ("pitch_accuracy", "pitch_rmse_cents", "voicing_recall", "speaker_sim", "wer"):
            vals = [r[metric] for r in rs if r.get(metric) is not None]
            if vals:
                avg[metric] = round(float(np.mean(vals)), 3)
        avg["score"] = round(_score(avg), 4)
        averages[key] = avg
    best_key = max(averages, key=lambda k: averages[k]["score"])
    best_engine = "rvc" if best_key.startswith("rvc") else best_key
    with open(args.out, "w") as f:
        json.dump({"model": args.model, "averages": averages, "winner": best_key, "rows": rows}, f, indent=2)
    if len(run_engines) > 1 and not args.no_save_choice:
        engines.write_engine_choice(model_info["id"], best_engine, averages)
        print(f"\nSaved: {args.model} will use '{best_engine}' when the engine is set to Auto.")
    print("\nAverages:")
    for key, avg in averages.items():
        print(f"  {key}: {avg}")
    print(f"\nReport written to {args.out}")


if __name__ == "__main__":
    main()
