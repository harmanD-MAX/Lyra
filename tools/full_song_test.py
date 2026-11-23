"""
Full-song test (run on Colab through tools/full_song_test.sh, inside ACE-Step's environment).

Takes a song Lyra already converted, reads its lyrics with Whisper, and asks
ACE-Step 1.5 (cover mode) to sing the same song again with a natural voice,
keeping the melody, music style and singing style. Saves a few versions with
different "closeness" settings so you can hear which works best.

    python full_song_test.py [--job JOB_FOLDER] [--lyrics lyrics.txt] [--caption "..."]
"""

import argparse
import glob
import json
import os
import shutil
import sys
import time

DRIVE_ROOTS = ["/content/drive/MyDrive/Lyra_Songs", "/content/drive/MyDrive/lyra-songs",
               "/content/drive/MyDrive/ysra-songs"]
DEFAULT_CAPTION = ("Bollywood Hindi song, natural expressive male vocals, emotional, warm, "
                   "studio quality, clear lyrics")


def say(msg):
    print(f"\n==> {msg}", flush=True)


def find_job(job_arg):
    """The Lyra job folder: the one given, or the most recently converted song."""
    if job_arg and os.path.isdir(job_arg):
        return job_arg
    roots = [os.environ.get("LYRA_OUTPUTS_DIR", "")] + [os.path.join(r, ".internal_jobs") for r in DRIVE_ROOTS] \
        + ["/content/Lyra/backend/outputs"]
    jobs = []
    for root in roots:
        if root and os.path.isdir(root):
            for d in os.listdir(root):
                p = os.path.join(root, d)
                if os.path.exists(os.path.join(p, "master_remastered.wav")):
                    if job_arg and d != job_arg:
                        continue
                    jobs.append(p)
    if not jobs:
        sys.exit("No converted song found. Convert a song in Lyra first (with Google Drive mounted), "
                 "or pass --job /path/to/job_folder.")
    return max(jobs, key=lambda p: os.path.getmtime(os.path.join(p, "master_remastered.wav")))


def transcribe(vocal_path, out_txt):
    """Lyrics from the vocal with Whisper large-v3 (Hindi), split into sections at long pauses."""
    import whisper
    say("Reading the lyrics with Whisper (first time downloads the model, ~3 GB)...")
    model = whisper.load_model("large-v3")
    res = model.transcribe(vocal_path, language="hi", task="transcribe", condition_on_previous_text=False)
    lines, last_end = [], None
    for seg in res.get("segments", []):
        text = seg["text"].strip()
        if not text:
            continue
        if last_end is not None and seg["start"] - last_end > 2.5:
            lines.append("")  # a long pause starts a new section
        lines.append(text)
        last_end = seg["end"]
    # dedupe repeated hallucinated lines Whisper sometimes produces in music
    cleaned = []
    for ln in lines:
        if ln and len(cleaned) >= 2 and cleaned[-1] == ln and cleaned[-2] == ln:
            continue
        cleaned.append(ln)
    sections, cur = [], []
    for ln in cleaned + [""]:
        if ln:
            cur.append(ln)
        elif cur:
            sections.append(cur)
            cur = []
    tagged = []
    for i, sec in enumerate(sections):
        tag = "[Verse]" if i % 2 == 0 else "[Chorus]"
        tagged.append(tag + "\n" + "\n".join(sec))
    lyrics = "\n\n".join(tagged)
    with open(out_txt, "w", encoding="utf-8") as f:
        f.write(lyrics)
    del model
    try:
        import torch
        torch.cuda.empty_cache()
    except Exception:
        pass
    return lyrics


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--job", help="Lyra job folder or id (default: the latest converted song)")
    ap.add_argument("--lyrics", help="a text file with the lyrics (default: read them with Whisper)")
    ap.add_argument("--caption", default=DEFAULT_CAPTION, help="style description")
    ap.add_argument("--model", default="acestep-v15-turbo", help="acestep-v15-turbo (fast) or acestep-v15-sft (slower)")
    ap.add_argument("--strengths", default="0.5,0.7,0.9", help="closeness to the original, 0..1")
    ap.add_argument("--acestep", default="/content/ACE-Step-1.5")
    ap.add_argument("--out", default="/content/drive/MyDrive/lyra-full-song-test")
    args = ap.parse_args()

    job = find_job(args.job)
    song = os.path.join(job, "master_remastered.wav")
    vocal = next((os.path.join(job, n) for n in ("vocals_lead_dry.wav", "vocals_lead.wav", "vocals.wav",
                                                 "vocal_processed.wav") if os.path.exists(os.path.join(job, n))), song)
    out_dir = os.path.join(args.out, time.strftime("%Y%m%d-%H%M%S"))
    if not os.path.isdir(os.path.dirname(args.out)):
        out_dir = os.path.join("/content/lyra-full-song-test", time.strftime("%Y%m%d-%H%M%S"))
    os.makedirs(out_dir, exist_ok=True)
    say(f"Song: {song}")

    # 1. lyrics (same as the converted song)
    lyr_file = os.path.join(out_dir, "lyrics.txt")
    if args.lyrics:
        shutil.copy(args.lyrics, lyr_file)
        lyrics = open(lyr_file, encoding="utf-8").read()
    else:
        lyrics = transcribe(vocal, lyr_file)
    print("\n--- lyrics used (edit lyrics.txt and pass --lyrics to fix words) ---\n" + lyrics[:1500])

    # 2. ACE-Step 1.5, cover mode
    say(f"Loading ACE-Step 1.5 ({args.model})...")
    sys.path.insert(0, args.acestep)
    os.chdir(args.acestep)
    from acestep.handler import AceStepHandler
    from acestep.llm_inference import LLMHandler
    from acestep.inference import GenerationParams, GenerationConfig, generate_music

    dit = AceStepHandler()
    dit.initialize_service(project_root=args.acestep, config_path=args.model, device="cuda")
    llm = LLMHandler()  # cover mode skips the language model, so it is not loaded (saves GPU memory)

    duration = None
    try:
        import soundfile as sf
        duration = min(600.0, sf.info(song).duration)
    except Exception:
        pass

    results = []
    for strength in [float(s) for s in args.strengths.split(",")]:
        for lang in ("hi", "unknown"):  # Hindi code if ACE-Step accepts it, else auto-detect
            say(f"Singing it again (closeness {strength}, language '{lang}')...")
            t0 = time.time()
            params = GenerationParams(
                task_type="cover", src_audio=song, caption=args.caption[:512], lyrics=lyrics[:4096],
                audio_cover_strength=strength, vocal_language=lang, duration=duration or -1,
                seed=42, shift=3.0 if "turbo" in args.model else 1.0, thinking=False,
            )
            config = GenerationConfig(batch_size=1, use_random_seed=False, seeds=[42], audio_format="wav")
            try:
                result = generate_music(dit, llm, params, config, save_dir=out_dir)
            except Exception as e:
                print(f"   failed: {e}")
                result = None
            if result is not None and result.success and result.audios:
                src = result.audios[0]["path"]
                dest = os.path.join(out_dir, f"full_song_closeness_{int(strength * 100)}.wav")
                shutil.move(src, dest)
                results.append({"file": dest, "closeness": strength, "language": lang,
                                "seconds": round(time.time() - t0)})
                print(f"   saved {dest} ({round(time.time() - t0)} s)")
                break
            print(f"   language '{lang}' did not work: {getattr(result, 'error', '')}")

    with open(os.path.join(out_dir, "results.json"), "w") as f:
        json.dump({"song": song, "caption": args.caption, "model": args.model, "results": results}, f, indent=2)
    say("Done. Listen to these and tell me which closeness sounds best:")
    for r in results:
        print(f"   {r['file']}")
    if not results:
        print("   Nothing was generated; copy the error lines above into the chat.")


if __name__ == "__main__":
    main()
