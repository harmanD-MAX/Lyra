"""
Lyra studio pipeline.

Two modes share one engine:

    convert   A song (file / YouTube / Spotify) is separated and its lead
              vocal re-sung by a target voice (a singer or a personal model).

    my_voice  You sing. Your take is cleaned, optionally time-aligned and
              pitch-aligned to a guide (the original song), pitch-corrected
              musically, then rendered in the target you choose:
                - "raw"       your own voice (WORLD re-synthesis, no model)
                - <personal>  your own trained voice model (best "keep my voice")
                - <singer>    Arijit / Sonu / KK

All pitch work happens once on the F0 curve (melody.py). Every job exports
24-bit stems, a MIDI file of the final melody and key/BPM analysis.
"""

import json
import logging
import os
import shutil
import subprocess
from dataclasses import dataclass, field, asdict
from typing import Callable, Optional

import numpy as np
import soundfile as sf

import audio_processor
import engines
import melody
import resources
import separation

logger = logging.getLogger(__name__)

HARMONY_DEGREES = {"none": 0, "third_above": 2, "third_below": -2, "fifth_above": 4, "sixth_below": -3}


@dataclass
class JobParams:
    mode: str = "convert"                  # convert | my_voice
    source_type: str = "file"              # file | youtube | spotify
    file_path: Optional[str] = None
    url: Optional[str] = None
    model_name: str = "arijit_singh"       # singer id, personal voice id, or "raw"
    engine: str = "auto"                   # auto | rvc | seedvc (see engines.py)
    pitch_shift: int = 0
    f0_method: str = "rmvpe"
    index_rate: Optional[float] = None
    protect: float = 0.33
    style_strength: float = 1.0
    has_music: bool = True
    split_backing: bool = True
    dereverb: bool = True
    # melody engine
    pitch_mode: str = "auto"               # auto | scale | guide | off
    key: str = "auto"
    correction_strength: Optional[float] = None
    retune_ms: float = 40.0
    steadiness: float = 0.5
    vibrato: float = 0.0
    harmony: str = "none"
    # guide (my_voice)
    guide_source_type: Optional[str] = None  # file | youtube | spotify
    guide_file_path: Optional[str] = None
    guide_url: Optional[str] = None
    align_timing: bool = True
    # mix
    vocal_gain_db: float = 0.0
    inst_gain_db: float = 0.0
    reverb_amount: float = 0.0
    echo_amount: float = 0.0
    warmth: float = 0.55
    clarity: float = 0.85

    def to_dict(self):
        return asdict(self)


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def ingest(source_type: str, file_path: Optional[str], url: Optional[str], work_dir: str,
           name: str, progress: Callable) -> dict:
    """Bring any source to a 44.1 kHz stereo WAV. Returns {"audio_path", meta...}."""
    os.makedirs(work_dir, exist_ok=True)
    if source_type == "spotify" or (url and ("spotify.com" in url or url.startswith("spotify:"))):
        res = audio_processor.download_spotify_audio(url, work_dir, progress_cb=progress)
    elif source_type == "youtube":
        res = audio_processor.download_youtube_audio(url, work_dir, progress_cb=progress)
    else:
        out = os.path.join(work_dir, f"{name}.wav")
        try:
            subprocess.run(["ffmpeg", "-y", "-i", file_path, "-ar", "44100", "-ac", "2", out],
                           capture_output=True, check=True)
        except Exception as e:
            raise RuntimeError(f"Failed to decode uploaded audio with FFmpeg: {e}")
        if not os.path.exists(out) or os.path.getsize(out) < 100:
            raise RuntimeError("Converted audio file is empty or missing.")
        res = {"audio_path": out, "title": os.path.basename(file_path or name), "thumbnail": "", "duration": 0, "uploader": ""}
        try:
            os.remove(file_path)
        except Exception:
            pass
        return res
    # Normalise downloaded audio to the same format
    std = os.path.join(work_dir, f"{name}.wav")
    if os.path.abspath(res["audio_path"]) != os.path.abspath(std):
        subprocess.run(["ffmpeg", "-y", "-i", res["audio_path"], "-ar", "44100", "-ac", "2", std],
                       capture_output=True, check=True)
        res["audio_path"] = std
    return res


def _mono(path: str):
    y, sr = sf.read(path, always_2d=True)
    return y.mean(axis=1).astype(np.float32), sr


def _write_stereo(path: str, y: np.ndarray, sr: int):
    y = np.asarray(y, dtype=np.float32)
    if y.ndim == 1:
        y = np.column_stack([y, y])
    peak = float(np.max(np.abs(y))) if y.size else 0.0
    if peak > 0.99:
        y = y / peak * 0.98
    sf.write(path, y, sr, subtype="PCM_24")


def _resolve_key(params: JobParams, reference_audio: Optional[str]) -> tuple:
    """Returns (key_tuple_or_None, analysis dict)."""
    analysis = {}
    forced = melody.parse_key(params.key)
    if reference_audio and os.path.exists(reference_audio):
        try:
            y, sr = _mono(reference_audio)
            tonic, mode, conf = melody.detect_key_from_audio(y, sr)
            analysis.update(detected_key=melody.key_name(tonic, mode), key_confidence=round(conf, 3),
                            bpm=melody.detect_tempo(y, sr))
            if forced is None and conf > 0.45:
                forced = (tonic, mode)
        except Exception as e:
            logger.warning(f"Key/tempo analysis failed: {e}")
    if forced is not None:
        analysis["key"] = melody.key_name(*forced)
    return forced, analysis


def _mix_harmony(lead_path: str, harmony_path: str, out_path: str, gain: float = 0.45) -> str:
    lead, sr = sf.read(lead_path, always_2d=True)
    harm, sr_h = sf.read(harmony_path, always_2d=True)
    if sr_h != sr:
        import librosa
        harm = librosa.resample(harm.T, orig_sr=sr_h, target_sr=sr).T
    n = min(len(lead), len(harm))
    lead = lead[:n].mean(axis=1)
    harm = harm[:n].mean(axis=1)
    # Slight stereo spread so the harmony sits beside the lead
    left = lead + gain * harm * 0.8
    right = lead + gain * harm * 1.2
    _write_stereo(out_path, np.column_stack([left, right]), sr)
    return out_path


def _splice(base_path: str, patch_path: str, start: float, end: float, out_path: str, fade: float = 0.03):
    base, sr = sf.read(base_path, always_2d=True)
    patch, sr_p = sf.read(patch_path, always_2d=True)
    if sr_p != sr:
        import librosa
        patch = librosa.resample(patch.T, orig_sr=sr_p, target_sr=sr).T
    if patch.shape[1] != base.shape[1]:
        patch = np.repeat(patch.mean(axis=1, keepdims=True), base.shape[1], axis=1)
    s = int(start * sr)
    e = min(int(end * sr), len(base), s + len(patch))
    seg = patch[: e - s]
    f = min(int(fade * sr), (e - s) // 2)
    ramp = np.ones(e - s)
    if f > 0:
        ramp[:f] = np.linspace(0, 1, f)
        ramp[-f:] = np.linspace(1, 0, f)
    out = base.copy()
    out[s:e] = base[s:e] * (1 - ramp[:, None]) + seg * ramp[:, None]
    sf.write(out_path, out, sr, subtype="PCM_24")
    return out_path


def export_stems(job_dir: str, stems: dict) -> dict:
    """Copy stems into job_dir/stems with DAW-friendly names; returns name->filename."""
    out_dir = os.path.join(job_dir, "stems")
    os.makedirs(out_dir, exist_ok=True)
    out = {}
    for name, path in stems.items():
        if path and os.path.exists(path):
            dest = os.path.join(out_dir, f"{name}.wav")
            if os.path.abspath(path) != os.path.abspath(dest):
                if os.path.exists(dest):
                    os.remove(dest)
                try:
                    os.link(path, dest)  # same bytes on disk, no extra space
                except OSError:
                    shutil.copyfile(path, dest)
            out[name] = f"{name}.wav"
    return out


# ---------------------------------------------------------------------------
# rendering
# ---------------------------------------------------------------------------

def _world_retune(src: str, out: str, pitch_options: Optional[dict], key, strength: float,
                  guide_lead: Optional[str], shift: int, harmony_degrees: int = 0,
                  retune_ms: float = 40.0, vibrato: float = 0.0, progress=None) -> dict:
    """Correct the melody of `src` and re-synthesize it in the same voice (WORLD)."""
    import voice_enhance
    guide_f0 = None
    if pitch_options and pitch_options.get("mode") == "guide" and guide_lead:
        gy, gsr = _mono(guide_lead)
        guide_f0 = voice_enhance.analyse_f0(gy, gsr)

    def correct(f0_in, fps_in):
        f0_out = f0_in * (2 ** (shift / 12.0))
        if pitch_options:
            if guide_f0 is not None:
                g = guide_f0 * (2 ** (shift / 12.0))
                g = np.pad(g, (0, max(0, len(f0_out) - len(g))))[: len(f0_out)]
                f0_out = melody.align_to_guide(f0_out, g, fps=fps_in, strength=strength, key=key,
                                               use_dtw=pitch_options.get("guide_dtw", False), retune_ms=retune_ms)
            else:
                f0_out = melody.correct_pitch(f0_out, fps=fps_in, key=key, strength=strength, retune_ms=retune_ms,
                                              steadiness=pitch_options.get("steadiness", 0.5), vibrato=vibrato)
        if harmony_degrees:
            f0_out = melody.harmony_f0(f0_out, fps=fps_in, key=key, degrees=harmony_degrees)
        return f0_out

    return voice_enhance.retune_world(src, out, correct, progress_cb=progress)


def _render(source: str, out_name: str, job_dir: str, p: "JobParams", model_info: dict, engine: str,
            pitch_options: Optional[dict], key, strength: float, guide_lead: Optional[str],
            harmony_degrees: int = 0, progress=None) -> dict:
    """Render `source` in the target voice with the chosen engine. Returns {path, f0, fps, engine}."""
    out = os.path.join(job_dir, out_name)
    if engine == "seedvc":
        try:
            src, f0, fps = source, None, 100.0
            if pitch_options or harmony_degrees:
                # Seed-VC follows the source melody, so correct it first (same voice, WORLD)
                tuned = os.path.join(job_dir, out_name.replace(".wav", "_tuned_source.wav"))
                r = _world_retune(source, tuned, pitch_options, key, strength, guide_lead, 0, harmony_degrees,
                                  p.retune_ms, p.vibrato, progress)
                src, f0, fps = tuned, r["f0"] * (2 ** (p.pitch_shift / 12.0)), r["fps"]
            engines.convert_seedvc(src, model_info, out, semitones=p.pitch_shift, progress_cb=progress)
            return {"path": out, "f0": f0, "fps": fps, "engine": "seedvc"}
        except Exception as e:
            logger.warning(f"Seed-VC render failed, falling back to RVC: {e}")
            if progress:
                progress(74, "Seed-VC unavailable for this render; using RVC v2...")

    opts = dict(pitch_options) if pitch_options else None
    if harmony_degrees:
        opts = dict(opts or {"mode": "off"})
        opts["harmony_degrees"] = harmony_degrees
        opts["key"] = key
    r = audio_processor.convert_voice(
        vocal_path=source, output_dir=job_dir, model_name=p.model_name,
        pitch_shift=p.pitch_shift, f0_method=p.f0_method, index_rate=p.index_rate,
        protect=p.protect, style_strength=p.style_strength, pitch_options=opts,
        output_name=out_name, progress_cb=progress,
    )
    return {"path": r["path"], "f0": r["f0"], "fps": r["fps"], "engine": "rvc" if r["engine"] == "rvc" else r["engine"]}


# ---------------------------------------------------------------------------
# main entry
# ---------------------------------------------------------------------------

def run(job_dir: str, p: JobParams, progress: Callable[[int, str], None]) -> dict:
    os.makedirs(job_dir, exist_ok=True)
    is_raw = p.model_name == "raw"
    model_info = None if is_raw else audio_processor.resolve_model_info(p.model_name)
    target_name = "Your Voice" if is_raw else model_info["name"]

    progress(5, f"Starting Lyra pipeline ({'My Voice' if p.mode == 'my_voice' else 'Convert'} → {target_name})...")
    src = ingest(p.source_type, p.file_path, p.url, job_dir, "input_audio", progress)
    meta = {k: src.get(k, "") for k in ("title", "thumbnail", "duration", "uploader")}

    # 1. Separation / cleanup of the main source
    if p.mode == "convert" or p.has_music:
        progress(25, "Separating vocals (RoFormer chain)...")
    else:
        progress(25, "Cleaning your recording (removing room reverb)...")
    sep = separation.separate_pro(
        src["audio_path"], job_dir,
        has_music=p.has_music,
        split_backing=p.split_backing and p.has_music and not resources.LITE,
        dereverb=p.dereverb and not resources.LITE,
        progress_cb=progress,
    )
    converter_input = sep["lead_dry_path"]
    accompaniment = sep["accompaniment_path"] or sep["instrumental_path"] or None
    audio_processor.clear_memory()

    # 2. Guide (my_voice): separate the reference song
    guide_lead = None
    if p.mode == "my_voice" and (p.guide_file_path or p.guide_url):
        progress(40, "Preparing the guide song (original melody & backing track)...")
        gdir = os.path.join(job_dir, "guide")
        g_src = ingest(p.guide_source_type or "file", p.guide_file_path, p.guide_url, gdir, "guide_audio", progress)
        g_sep = separation.separate_pro(g_src["audio_path"], gdir, has_music=True,
                                        split_backing=not resources.LITE,
                                        dereverb=not resources.LITE, progress_cb=progress)
        guide_lead = g_sep["lead_dry_path"]
        accompaniment = g_sep["accompaniment_path"] or g_sep["instrumental_path"] or accompaniment
        meta["guide_title"] = g_src.get("title", "")
        audio_processor.clear_memory()

    # 3. Musical analysis (key, tempo) from the backing track when we have one
    key, analysis = _resolve_key(p, accompaniment or sep["instrumental_path"] or None)

    # 4. Timing alignment to the guide
    if guide_lead and p.align_timing:
        progress(52, "Aligning your phrasing to the original's timing...")
        user_y, sr = _mono(converter_input)
        guide_y, sr_g = _mono(guide_lead)
        if sr_g != sr:
            import librosa
            guide_y = librosa.resample(guide_y, orig_sr=sr_g, target_sr=sr)
        aligned = melody.align_timing_to_guide(user_y, guide_y, sr, strength=1.0)
        converter_input = os.path.join(job_dir, "vocals_timing_aligned.wav")
        _write_stereo(converter_input, aligned, sr)

    # 5. Pitch options
    pitch_mode = p.pitch_mode
    if pitch_mode == "auto":
        pitch_mode = "guide" if guide_lead else "scale"
    if p.correction_strength is not None:
        strength = float(p.correction_strength)
    else:
        # A pro recording only needs a touch; your own take gets real correction
        strength = 0.85 if p.mode == "my_voice" else 0.2
    pitch_options = None
    if pitch_mode != "off" and strength > 0.01:
        pitch_options = {
            "mode": pitch_mode,
            "key": key,
            "strength": strength,
            "retune_ms": p.retune_ms,
            "steadiness": p.steadiness if p.mode == "my_voice" else min(p.steadiness, 0.2),
            "vibrato": p.vibrato,
            "guide_audio_path": guide_lead,
            "guide_dtw": bool(guide_lead and not p.align_timing),
        }
    analysis["pitch_mode"] = pitch_mode if pitch_options else "off"
    analysis["correction_strength"] = round(strength, 2) if pitch_options else 0.0

    # 6. Render the lead
    lead_out = os.path.join(job_dir, "converted_vocals.wav")
    if is_raw:
        engine, engine_reason = "world", "keep your own voice"
        r = _world_retune(converter_input, lead_out, pitch_options, key, strength, guide_lead, p.pitch_shift,
                          retune_ms=p.retune_ms, vibrato=p.vibrato, progress=progress)
        f0, fps = r["f0"], r["fps"]
    else:
        engine, engine_reason = engines.choose_engine(model_info, p.engine)
        progress(64, f"Voice engine: {engines.ENGINE_LABELS.get(engine, engine)} ({engine_reason})")
        r = _render(converter_input, "converted_vocals.wav", job_dir, p, model_info, engine,
                    pitch_options, key, strength, guide_lead, progress=progress)
        if r["engine"] != engine:
            engine_reason = f"fell back from {engine}"
        f0, fps, engine = r["f0"], r["fps"], r["engine"]

    # IMMEDIATELY UNLOAD NEURAL MODELS FROM RAM / VRAM AT 85%
    # HuBERT, RMVPE, and RVC Synthesizer weights (~2.5GB) are purged before mastering starts
    try:
        audio_processor.unload_vc_cache()
    except Exception as e_unl:
        logger.warning(f"Unload VC cache notice: {e_unl}")
    audio_processor.clear_memory()

    if f0 is None:
        try:
            import voice_enhance
            y_out, sr_out = _mono(lead_out)
            f0, fps = voice_enhance.analyse_f0(y_out, sr_out), 200.0
        except Exception as e:
            logger.warning(f"Melody analysis of output failed: {e}")
            f0, fps = None, 100.0
    analysis["engine"] = engines.ENGINE_LABELS.get(engine, engine)
    analysis["engine_reason"] = engine_reason

    # 7. Harmony voice
    harmony_path = None
    degrees = HARMONY_DEGREES.get(p.harmony, 0)
    if degrees and not is_raw:
        progress(86, "Singing a harmony line in key...")
        harmony_path = _render(converter_input, "harmony_vocals.wav", job_dir, p, model_info,
                               "seedvc" if engine == "seedvc" else "rvc",
                               pitch_options, key, strength, guide_lead, harmony_degrees=degrees)["path"]

    vocal_for_mix = lead_out
    if harmony_path:
        vocal_for_mix = _mix_harmony(lead_out, harmony_path, os.path.join(job_dir, "vocals_with_harmony.wav"))
    audio_processor.clear_memory()

    # 8. MIDI of the final melody
    midi_file = ""
    if f0 is not None and len(f0):
        try:
            midi_file = melody.export_melody_midi(np.asarray(f0), os.path.join(job_dir, "melody.mid"),
                                                  fps=fps, bpm=analysis.get("bpm", 120.0))
        except Exception as e:
            logger.warning(f"MIDI export failed: {e}")

    # 9. Mix & master
    progress(88, "Mixing and mastering...")
    master = audio_processor.master_and_remaster_track(
        vocal_wav=vocal_for_mix, inst_wav=accompaniment, output_dir=job_dir,
        raw_vocal_wav=converter_input, vocal_gain_db=p.vocal_gain_db, inst_gain_db=p.inst_gain_db,
        reverb_amount=p.reverb_amount, echo_amount=p.echo_amount, warmth=p.warmth, clarity=p.clarity,
        apply_autotune=False, progress_cb=progress,
    )

    stems = export_stems(job_dir, {
        "lead_vocal_converted": lead_out,
        "harmony_vocal": harmony_path,
        "lead_vocal_original_dry": converter_input,
        "backing_vocals_original": sep["backing_path"],
        "instrumental": sep["instrumental_path"] if p.mode == "convert" else accompaniment,
        "accompaniment": accompaniment,
    })

    state = {
        "params": p.to_dict(),
        "converter_input": converter_input,
        "accompaniment": accompaniment,
        "guide_lead": guide_lead,
        "key": list(key) if key else None,
        "pitch_options": {k: v for k, v in (pitch_options or {}).items() if k != "key"} or None,
        "engine": engine,
        "engine_reason": engine_reason,
        "strength": strength,
        "separation_engine": sep["engine"],
    }
    with open(os.path.join(job_dir, "pipeline_state.json"), "w") as f:
        json.dump(state, f, indent=2)
    with open(os.path.join(job_dir, "analysis.json"), "w") as f:
        json.dump(analysis, f, indent=2)

    return {
        "meta": meta,
        "target_name": target_name,
        "analysis": analysis,
        "stems": stems,
        "midi": bool(midi_file),
        "engine": engine,
        "engine_label": engines.ENGINE_LABELS.get(engine, engine),
        "engine_reason": engine_reason,
        "separation_engine": sep["engine"],
        "master": master,
    }


def rerender_section(job_dir: str, start: float, end: float, overrides: dict,
                     progress: Callable[[int, str], None]) -> dict:
    """Re-render only [start, end] seconds of the lead with new settings and splice it in."""
    with open(os.path.join(job_dir, "pipeline_state.json")) as f:
        state = json.load(f)
    p = JobParams(**{**state["params"], **{k: v for k, v in overrides.items() if v is not None}})
    if p.model_name == "raw":
        raise ValueError("Section re-render needs a neural voice target (not 'raw').")
    if end <= start:
        raise ValueError("end must be after start")

    pad = 0.5  # render with context so the model's edges are clean
    src, sr = sf.read(state["converter_input"], always_2d=True)
    s0 = max(0, int((start - pad) * sr))
    e0 = min(len(src), int((end + pad) * sr))
    seg_path = os.path.join(job_dir, "_section_in.wav")
    sf.write(seg_path, src[s0:e0], sr, subtype="PCM_24")

    pitch_options = state.get("pitch_options")
    if pitch_options is not None:
        pitch_options = dict(pitch_options)
        pitch_options["key"] = tuple(state["key"]) if state.get("key") else None
        if overrides.get("correction_strength") is not None:
            pitch_options["strength"] = float(overrides["correction_strength"])
        if pitch_options.get("mode") == "guide" and state.get("guide_lead"):
            g, gsr = sf.read(state["guide_lead"], always_2d=True)
            gseg = os.path.join(job_dir, "_section_guide.wav")
            sf.write(gseg, g[int(s0 * gsr / sr): int(e0 * gsr / sr)], gsr, subtype="PCM_24")
            pitch_options["guide_audio_path"] = gseg

    progress(30, f"Re-rendering {start:.1f}s - {end:.1f}s...")
    model_info = audio_processor.resolve_model_info(p.model_name)
    engine = state.get("engine", "rvc")
    r = _render(seg_path, "_section_out.wav", job_dir, p, model_info, "seedvc" if engine == "seedvc" else "rvc",
                pitch_options, pitch_options.get("key") if pitch_options else None,
                float(pitch_options.get("strength", 0.0)) if pitch_options else 0.0,
                pitch_options.get("guide_audio_path") if pitch_options else None)
    # Trim the context padding off the rendered section
    out, osr = sf.read(r["path"], always_2d=True)
    lead_pad = (start - s0 / sr)
    trimmed = out[int(lead_pad * osr): int((lead_pad + (end - start)) * osr)]
    trimmed_path = os.path.join(job_dir, "_section_trimmed.wav")
    sf.write(trimmed_path, trimmed, osr, subtype="PCM_24")

    lead = os.path.join(job_dir, "converted_vocals.wav")
    _splice(lead, trimmed_path, start, end, lead)
    vocal_for_mix = lead
    harmony = os.path.join(job_dir, "harmony_vocals.wav")
    if os.path.exists(harmony):
        vocal_for_mix = _mix_harmony(lead, harmony, os.path.join(job_dir, "vocals_with_harmony.wav"))
    progress(70, "Re-mixing...")
    master = audio_processor.master_and_remaster_track(
        vocal_wav=vocal_for_mix, inst_wav=state.get("accompaniment"), output_dir=job_dir,
        raw_vocal_wav=state["converter_input"], vocal_gain_db=p.vocal_gain_db, inst_gain_db=p.inst_gain_db,
        reverb_amount=p.reverb_amount, echo_amount=p.echo_amount, warmth=p.warmth, clarity=p.clarity,
        apply_autotune=False,
    )
    export_stems(job_dir, {"lead_vocal_converted": lead})
    for tmp in ("_section_in.wav", "_section_out.wav", "_section_trimmed.wav", "_section_guide.wav",
                "_section_out_tuned_source.wav"):
        try:
            os.remove(os.path.join(job_dir, tmp))
        except Exception:
            pass
    return master
