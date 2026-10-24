import os
import time
import json
import shutil
import threading
import asyncio
import traceback
from concurrent.futures import ThreadPoolExecutor
from typing import Optional
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from jobs import job_manager
import audio_processor
import r2_storage
import engines
import resources
import separation
import studio_pipeline
import voices

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
OUTPUTS_DIR = os.environ.get("LYRA_OUTPUTS_DIR", os.path.join(BASE_DIR, "outputs"))
MODELS_DIR = os.path.join(BASE_DIR, "models", "arijit_singh")

os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(OUTPUTS_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)

app = FastAPI(
    title="Lyra Audio Engine API",
    description="High-fidelity neural vocal timbre studio & audio remastering engine powered by Demucs v4 and RVC v2.",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_scan_jobs():
    job_manager._load()
    job_manager.sync_cloud_catalog()

    for name in os.listdir(OUTPUTS_DIR):
        job_dir = os.path.join(OUTPUTS_DIR, name)
        if not os.path.isdir(job_dir):
            continue

        existing = job_manager._jobs.get(name)

        # 1. Check if meta.json exists inside the job directory
        meta_file = os.path.join(job_dir, "meta.json")
        saved_meta = None
        if os.path.exists(meta_file):
            try:
                with open(meta_file, "r") as f:
                    saved_meta = json.load(f)
            except Exception:
                saved_meta = None

        # If already preserved with a valid real title and singer (and not corrupted with Bigg Boss), keep it intact!
        if existing and existing.get("status") == "completed":
            ext_res = existing.get("results") or {}
            ext_title = ext_res.get("title") or existing.get("metadata", {}).get("title") or ""
            if ext_title and not ext_title.startswith("Song Conversion (") and "Bigg Boss" not in ext_title and ext_res.get("singer"):
                continue

        saved_res = (saved_meta.get("results") or {}) if isinstance(saved_meta, dict) else {}
        exist_res = (existing.get("results") or {}) if isinstance(existing, dict) else {}
        exist_meta = (existing.get("metadata") or {}) if isinstance(existing, dict) else {}

        master_wav = os.path.join(job_dir, "master_remastered.wav")
        master_mp3 = os.path.join(job_dir, "master_remastered.mp3")
        is_cloud_saved = bool(saved_res.get("saved_to_cloud") or exist_res.get("saved_to_cloud"))

        # If a song is not saved in Cloudflare, purge it from the Mac's outputs directory
        if not is_cloud_saved:
            try:
                shutil.rmtree(job_dir, ignore_errors=True)
                if name in job_manager._jobs:
                    del job_manager._jobs[name]
                print(f"Purged unsaved local output folder from Mac: {name}")
            except Exception as e:
                print(f"Could not purge {name}: {e}")
            continue

        has_master = os.path.exists(master_mp3) or os.path.exists(master_wav) or is_cloud_saved

        vocal_wav = None
        for candidate in ["arijit_vocals.wav", "vocal_processed.wav", "vocals.wav"]:
            p = os.path.join(job_dir, candidate)
            if os.path.exists(p):
                vocal_wav = p
                break

        if has_master:
            has_inst = os.path.exists(os.path.join(job_dir, "instrumental.wav"))
            has_orig_vocal = os.path.exists(os.path.join(job_dir, "vocals.wav"))

            # Determine model_name and singer
            model_name = (saved_meta.get("model_name") if saved_meta else None) or \
                         exist_meta.get("model_name") or \
                         exist_res.get("model_name") or \
                         "arijit_singh"
            model_info = audio_processor.AVAILABLE_MODELS.get(model_name, audio_processor.AVAILABLE_MODELS.get("arijit_singh", {"name": "Arijit Singh"}))
            singer_name = (saved_meta.get("singer") if saved_meta else None) or \
                          exist_res.get("singer") or \
                          model_info.get("name", "Arijit Singh")

            # Determine real song title
            real_title = None
            if saved_meta and saved_meta.get("title") and "Bigg Boss" not in saved_meta.get("title", ""):
                real_title = saved_meta["title"]
            elif existing:
                cand = exist_res.get("title") or exist_meta.get("title") or exist_meta.get("filename")
                if cand and not str(cand).startswith("Song Conversion (") and "Bigg Boss" not in str(cand):
                    real_title = cand
                elif exist_meta.get("youtube_url"):
                    real_title = f"YouTube Track ({singer_name} Version)"
                elif exist_meta.get("spotify_url"):
                    real_title = f"Spotify Track ({singer_name} Version)"

            if not real_title or real_title.startswith("Song Conversion (") or "Bigg Boss" in str(real_title):
                real_title = f"Studio Track {name[:6]} ({singer_name} Version)"

            thumbnail = (saved_meta.get("thumbnail") if saved_meta else None) or \
                        exist_res.get("thumbnail") or \
                        ""

            uploader = (saved_meta.get("uploader") if saved_meta else None) or \
                       exist_res.get("uploader") or \
                       "AI Studio"

            cloud_master_url = saved_res.get("cloud_master_3d_url") or exist_res.get("cloud_master_3d_url")

            job_manager._jobs[name] = {
                "id": name,
                "status": "completed",
                "progress": 100,
                "message": f"Completed with authentic {singer_name} diction & pitch lock",
                "created_at": existing.get("created_at") if existing else (os.path.getctime(master_mp3) if os.path.exists(master_mp3) else (os.path.getctime(master_wav) if os.path.exists(master_wav) else time.time())),
                "updated_at": existing.get("updated_at") if existing else (os.path.getmtime(master_mp3) if os.path.exists(master_mp3) else (os.path.getmtime(master_wav) if os.path.exists(master_wav) else time.time())),
                "metadata": {
                    "title": real_title,
                    "model_name": model_name,
                    "singer_name": singer_name,
                    **exist_meta
                },
                "results": {
                    "title": real_title,
                    "thumbnail": thumbnail,
                    "duration": (saved_meta.get("duration") if saved_meta else None) or exist_res.get("duration") or 52.8,
                    "uploader": uploader,
                    "singer": singer_name,
                    "model_name": model_name,
                    "saved_to_cloud": is_cloud_saved,
                    "cloud_master_3d_url": cloud_master_url,
                    "input_audio": f"/api/audio/{name}/input",
                    "vocals_original": f"/api/audio/{name}/vocal_original" if has_orig_vocal else "",
                    "instrumental": f"/api/audio/{name}/instrumental" if has_inst else "",
                    "vocals_arijit": f"/api/audio/{name}/vocal_arijit",
                    "vocals_converted": f"/api/audio/{name}/vocal_arijit",
                    "master_remastered_wav": f"/api/audio/{name}/master_wav",
                    "master_remastered_mp3": f"/api/audio/{name}/master_mp3",
                    "settings": {
                        "model_name": model_name,
                        "singer_name": singer_name,
                        "pitch_shift": 0,
                        "f0_method": "rmvpe",
                        "index_rate": 0.28,
                        "protect": 0.50,
                        "vocal_gain_db": 0.0,
                        "inst_gain_db": 0.0,
                        "reverb_amount": 0.0,
                        "echo_amount": 0.0,
                        "master_profile": "clean_natural"
                    }
                },
                "error": None,
                "logs": existing.get("logs", ["Synthesis completed successfully"]) if existing else ["Synthesis completed successfully"]
            }

    # Persist the preserved metadata
    job_manager._save()


# One GPU/CPU-heavy job at a time: separation, RVC and training all compete for
# the same memory, so a single worker keeps runs fast and predictable.
JOB_EXECUTOR = ThreadPoolExecutor(max_workers=1, thread_name_prefix="lyra-job",
                                  initializer=resources.apply_worker_limits)


def run_pipeline(job_id: str, params: "studio_pipeline.JobParams"):
    job_dir = os.path.join(OUTPUTS_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)

    def progress_callback(progress: int, message: str):
        job_manager.update_job(job_id, progress=progress, message=message)

    try:
        job_manager.update_job(job_id, status="processing", progress=3, message="Job started...")
        out = studio_pipeline.run(job_dir, params, progress_callback)
        meta_info = out["meta"]
        target_name = out["target_name"]
        stem_urls = {name: f"/api/stems/{job_id}/{name}" for name in out["stems"]}

        results = {
            "title": f"{meta_info.get('title', 'Song')} ({target_name} Version)",
            "thumbnail": meta_info.get("thumbnail", ""),
            "duration": meta_info.get("duration", 0),
            "uploader": meta_info.get("uploader", ""),
            "singer": target_name,
            "model_name": params.model_name,
            "mode": params.mode,
            "input_audio": f"/api/audio/{job_id}/input",
            "vocals_original": f"/api/audio/{job_id}/vocal_original",
            "instrumental": f"/api/audio/{job_id}/instrumental" if out["stems"].get("accompaniment") or out["stems"].get("instrumental") else "",
            "vocals_arijit": f"/api/audio/{job_id}/vocal_arijit",
            "vocals_converted": f"/api/audio/{job_id}/vocal_converted",
            "master_remastered_wav": f"/api/audio/{job_id}/master_wav",
            "master_remastered_mp3": f"/api/audio/{job_id}/master_mp3",
            "master_clean_wav": f"/api/audio/{job_id}/master_clean_wav",
            "master_clean_mp3": f"/api/audio/{job_id}/master_clean_mp3",
            "stems": stem_urls,
            "stems_zip": f"/api/stems/{job_id}/all.zip",
            "midi": f"/api/midi/{job_id}" if out["midi"] else "",
            "analysis": out["analysis"],
            "engine": out["engine"],
            "engine_label": out["engine_label"],
            "engine_reason": out["engine_reason"],
            "separation_engine": out["separation_engine"],
            "settings": params.to_dict(),
        }
        results["settings"]["singer_name"] = target_name

        # Auto-upload Master 3D to Cloudflare R2 cloud storage upon completion
        if r2_storage.is_r2_configured():
            master_file = os.path.join(job_dir, "master_remastered.mp3")
            if not os.path.exists(master_file):
                for cand in ["master_clean.mp3", "master_remastered.wav"]:
                    cp = os.path.join(job_dir, cand)
                    if os.path.exists(cp):
                        master_file = cp
                        break
            if os.path.exists(master_file):
                remote_key = f"{job_id}/master_3d.mp3"
                content_type = "audio/mpeg" if master_file.endswith(".mp3") else "audio/wav"
                cloud_url = r2_storage.upload_audio_to_r2(master_file, remote_key, content_type=content_type)
                if cloud_url:
                    results["saved_to_cloud"] = True
                    results["cloud_master_3d_url"] = cloud_url
                    try:
                        catalog = r2_storage.get_cloud_catalog()
                        catalog[job_id] = {
                            "id": job_id,
                            "status": "completed",
                            "progress": 100,
                            "created_at": time.time(),
                            "updated_at": time.time(),
                            "metadata": {
                                "title": results["title"],
                                "singer": target_name,
                                "model_name": params.model_name,
                                "duration": results["duration"],
                                "thumbnail": results["thumbnail"],
                            },
                            "results": results
                        }
                        r2_storage.save_cloud_catalog(catalog)
                        print(f"Job {job_id} Master 3D auto-saved to Cloudflare R2: {cloud_url}")
                    except Exception as cat_err:
                        print("Error updating R2 cloud catalog:", cat_err)

        job_manager.update_job(job_id, status="completed", progress=100,
                               message=f"{target_name} version finished!", results=results)
        try:
            with open(os.path.join(job_dir, "meta.json"), "w") as f:
                json.dump({
                    "id": job_id,
                    "title": results["title"],
                    "singer": target_name,
                    "model_name": params.model_name,
                    "thumbnail": results["thumbnail"],
                    "duration": results["duration"],
                    "uploader": results["uploader"],
                    "source_type": params.source_type,
                    "results": results
                }, f, indent=2)
        except Exception as err:
            print("Could not save job meta.json:", err)
        freed = resources.cleanup_job(job_dir)
        print(f"Job {job_id}: removed {freed:.0f} MB of temporary files")
    except BaseException as e:
        print(f"Error in job {job_id}: {traceback.format_exc()}")
        job_manager.update_job(job_id, status="error", error=str(e))
    finally:
        # Crucial for machines with small RAM (e.g. 8 GB): purge model weights and MPS buffers between songs
        if resources.LITE or (0 < resources.ram_gb() <= 10.0):
            audio_processor.unload_vc_cache()
            audio_processor.clear_memory()


def _save_upload(upload: UploadFile, prefix: str) -> str:
    clean_base = os.path.basename(upload.filename or "audio").replace(" ", "_").replace("'", "").replace('"', "")
    dest = os.path.join(UPLOADS_DIR, f"{prefix}_{clean_base}")
    with open(dest, "wb") as buffer:
        shutil.copyfileobj(upload.file, buffer)
    return dest


def _url_source(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    return "spotify" if ("spotify.com" in url or url.startswith("spotify:")) else "youtube"


@app.post("/api/convert")
async def start_conversion(
    audio_file: Optional[UploadFile] = File(None),
    youtube_url: Optional[str] = Form(None),
    spotify_url: Optional[str] = Form(None),
    mode: str = Form("convert"),
    model_name: str = Form("arijit_singh"),
    engine: str = Form("auto"),
    pitch_shift: int = Form(0),
    f0_method: str = Form("rmvpe"),
    index_rate: Optional[float] = Form(None),
    protect: float = Form(0.33),
    vocal_gain_db: float = Form(0.0),
    inst_gain_db: float = Form(0.0),
    reverb_amount: float = Form(0.0),
    echo_amount: float = Form(0.0),
    warmth: float = Form(0.55),
    clarity: float = Form(0.85),
    has_music: bool = Form(True),
    apply_autotune: bool = Form(True),
    autotune_strength: Optional[float] = Form(None),
    style_strength: float = Form(1.0),
    split_backing: bool = Form(True),
    dereverb: bool = Form(True),
    pitch_mode: str = Form("auto"),
    key: str = Form("auto"),
    retune_ms: float = Form(40.0),
    steadiness: float = Form(0.5),
    vibrato: float = Form(0.0),
    harmony: str = Form("none"),
    guide_file: Optional[UploadFile] = File(None),
    guide_url: Optional[str] = Form(None),
    align_timing: bool = Form(True),
):
    url = spotify_url or youtube_url
    if not audio_file and not url:
        raise HTTPException(status_code=400, detail="Please provide an audio file, YouTube URL, or Spotify URL.")
    if mode not in ("convert", "my_voice"):
        raise HTTPException(status_code=400, detail="mode must be 'convert' or 'my_voice'")
    if model_name == "raw" and mode != "my_voice":
        raise HTTPException(status_code=400, detail="'Keep my voice (raw)' is only available in My Voice mode.")

    source_type = "file" if audio_file else _url_source(url)
    job_id = job_manager.create_job(metadata={
        "source_type": source_type,
        "youtube_url": youtube_url,
        "spotify_url": spotify_url,
        "filename": audio_file.filename if audio_file else None,
        "model_name": model_name,
        "mode": mode,
        "pitch_shift": pitch_shift,
        "f0_method": f0_method
    })

    params = studio_pipeline.JobParams(
        mode=mode,
        source_type=source_type,
        file_path=_save_upload(audio_file, job_id) if audio_file else None,
        url=None if audio_file else url,
        model_name=model_name,
        engine=engine if engine in ("auto", "rvc", "seedvc") else "auto",
        pitch_shift=pitch_shift,
        f0_method=f0_method,
        index_rate=index_rate,
        protect=protect,
        style_strength=style_strength,
        has_music=has_music,
        split_backing=split_backing,
        dereverb=dereverb,
        pitch_mode=pitch_mode if apply_autotune else "off",
        key=key,
        correction_strength=autotune_strength,
        retune_ms=retune_ms,
        steadiness=steadiness,
        vibrato=vibrato,
        harmony=harmony,
        guide_source_type="file" if guide_file else _url_source(guide_url),
        guide_file_path=_save_upload(guide_file, f"{job_id}_guide") if guide_file else None,
        guide_url=None if guide_file else guide_url,
        align_timing=align_timing,
        vocal_gain_db=vocal_gain_db,
        inst_gain_db=inst_gain_db,
        reverb_amount=reverb_amount,
        echo_amount=echo_amount,
        warmth=warmth,
        clarity=clarity,
    )
    JOB_EXECUTOR.submit(run_pipeline, job_id, params)
    return JSONResponse(content={"job_id": job_id, "status": "queued", "message": "Job queued successfully"})


@app.post("/api/jobs/{job_id}/rerender")
async def rerender_section(
    job_id: str,
    start_sec: float = Form(...),
    end_sec: float = Form(...),
    pitch_shift: Optional[int] = Form(None),
    correction_strength: Optional[float] = Form(None),
    index_rate: Optional[float] = Form(None),
    protect: Optional[float] = Form(None),
    style_strength: Optional[float] = Form(None),
):
    """Re-sing only one section of a finished job with new settings."""
    job = job_manager.get_job(job_id)
    job_dir = os.path.join(OUTPUTS_DIR, job_id)
    if not job or job.get("status") != "completed" or not os.path.exists(os.path.join(job_dir, "pipeline_state.json")):
        raise HTTPException(status_code=400, detail="Job must be a completed job from this version of Lyra.")
    overrides = {"pitch_shift": pitch_shift, "correction_strength": correction_strength,
                 "index_rate": index_rate, "protect": protect, "style_strength": style_strength}

    def _work():
        try:
            job_manager.update_job(job_id, message=f"Re-rendering {start_sec:.1f}s-{end_sec:.1f}s...")
            studio_pipeline.rerender_section(job_dir, start_sec, end_sec, overrides,
                                             lambda p, m: job_manager.update_job(job_id, message=m))
            job_manager.update_job(job_id, message=f"Section {start_sec:.1f}s-{end_sec:.1f}s re-rendered.")
        except Exception as e:
            job_manager.update_job(job_id, message=f"Section re-render failed: {e}")

    future = JOB_EXECUTOR.submit(_work)
    await asyncio.wrap_future(future)
    now_ts = int(time.time() * 1000)
    return JSONResponse(content={
        "status": "success",
        "master_mp3": f"/api/audio/{job_id}/master_mp3?t={now_ts}",
        "master_clean_mp3": f"/api/audio/{job_id}/master_clean_mp3?t={now_ts}",
        "vocal_wav": f"/api/audio/{job_id}/vocal_converted?t={now_ts}",
    })


# ---------------------------------------------------------------------------
# Personal voices ("Keep my voice")
# ---------------------------------------------------------------------------

@app.get("/api/voices")
async def list_voices():
    return JSONResponse(content={"voices": voices.list_custom_voices()})


@app.post("/api/voices/upload")
async def upload_voice(name: str = Form(...), model_file: UploadFile = File(...), index_file: Optional[UploadFile] = File(None)):
    """Register an RVC v2 .pth (+ optional .index) trained elsewhere as a personal voice."""
    if not (model_file.filename or "").endswith(".pth"):
        raise HTTPException(status_code=400, detail="Model must be an RVC .pth file")
    stamp = str(int(time.time() * 1000))
    pth = _save_upload(model_file, f"voice_{stamp}")
    idx = _save_upload(index_file, f"voice_{stamp}") if index_file else None
    meta = voices.register_uploaded_voice(name, pth, idx)
    return JSONResponse(content={"voice": meta})


@app.post("/api/voices/train")
async def train_voice(
    name: str = Form(...),
    recordings: list[UploadFile] = File(...),
    preset: str = Form("standard"),
    steps: Optional[int] = Form(None),
):
    """Train a personal voice model from 10-20 minutes of your own recordings."""
    meta = voices.new_voice(name, status="queued")
    vid = meta["id"]
    data_dir = os.path.join(voices.CUSTOM_ROOT, vid, "recordings")
    os.makedirs(data_dir, exist_ok=True)
    paths = []
    import subprocess
    for i, rec in enumerate(recordings):
        raw = os.path.join(data_dir, f"{i:03d}_{os.path.basename(rec.filename or 'take')}")
        with open(raw, "wb") as f:
            shutil.copyfileobj(rec.file, f)
        # Browser recordings arrive as webm/ogg; normalise everything to WAV
        dest = os.path.splitext(raw)[0] + ".wav"
        try:
            subprocess.run(["ffmpeg", "-y", "-i", raw, "-ar", "44100", "-ac", "1", dest], capture_output=True, check=True)
            if dest != raw:
                os.remove(raw)
            paths.append(dest)
        except Exception:
            paths.append(raw)
    if preset not in ("auto", "quick", "standard", "best"):
        preset = "auto"
    if steps is not None:
        steps = int(max(100, min(steps, 20000)))

    def _work():
        import voice_training
        try:
            audio_processor.unload_vc_cache()
            voice_training.train_personal_voice(vid, paths, steps=steps, preset=preset)
        except Exception as e:
            print(f"Voice training failed for {vid}: {e}")

    JOB_EXECUTOR.submit(_work)
    return JSONResponse(content={"voice": meta})


@app.get("/api/voices/{voice_id}")
async def get_voice(voice_id: str):
    meta = voices.read_meta(voice_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Voice not found")
    return JSONResponse(content={"voice": meta})


@app.delete("/api/voices/{voice_id}")
async def delete_voice(voice_id: str):
    audio_processor.unload_vc_cache()
    if not voices.delete_voice(voice_id):
        raise HTTPException(status_code=404, detail="Voice not found")
    return JSONResponse(content={"status": "deleted", "id": voice_id})


@app.post("/api/models/{model_id}/reference")
async def upload_reference(model_id: str, sample: UploadFile = File(...)):
    """A dry, solo clip of a voice (10-30s) that lets Seed-VC sing as it."""
    info = audio_processor.resolve_model_info(model_id)
    if info["id"] != model_id:
        raise HTTPException(status_code=404, detail="Unknown voice")
    src = _save_upload(sample, f"ref_{int(time.time() * 1000)}")
    try:
        path = engines.save_reference_upload(src, info)
    finally:
        try:
            os.remove(src)
        except Exception:
            pass
    if not path:
        raise HTTPException(status_code=400, detail="No clear singing found in that clip")
    return JSONResponse(content={"status": "ok", "engines": engines.engine_options(info)})


@app.get("/api/storage")
async def storage_status():
    return JSONResponse(content=resources.storage_report(OUTPUTS_DIR))


@app.post("/api/storage/cleanup")
async def storage_cleanup():
    """Remove temporary files from every finished song (results are kept)."""
    freed = 0.0
    for jid in os.listdir(OUTPUTS_DIR):
        jdir = os.path.join(OUTPUTS_DIR, jid)
        job = job_manager.get_job(jid)
        if os.path.isdir(jdir) and (not job or job.get("status") in ("completed", "error")):
            freed += resources.cleanup_job(jdir)
    for name in os.listdir(UPLOADS_DIR):
        p = os.path.join(UPLOADS_DIR, name)
        if os.path.isfile(p) and time.time() - os.path.getmtime(p) > 3600:
            freed += os.path.getsize(p) / 1e6
            os.remove(p)
    return JSONResponse(content={"freed_mb": round(freed), **resources.storage_report(OUTPUTS_DIR)})


@app.get("/api/engines")
async def engine_status():
    """Which voice engines are installed and which one each voice will use."""
    per_voice = {}
    ids = list(audio_processor.AVAILABLE_MODELS) + [v["id"] for v in voices.list_custom_voices()]
    for vid in ids:
        info = audio_processor.resolve_model_info(vid)
        engine, reason = engines.choose_engine(info, "auto")
        per_voice[vid] = {"available": engines.engine_options(info), "auto": engine, "reason": reason,
                          "label": engines.ENGINE_LABELS.get(engine, engine)}
    return JSONResponse(content={
        "seedvc_installed": engines.seedvc_available(),
        "labels": engines.ENGINE_LABELS,
        "voices": per_voice,
        "benchmark": engines.read_engine_choices(),
    })


# ---------------------------------------------------------------------------
# Composer exports: stems, MIDI, analysis
# ---------------------------------------------------------------------------

@app.get("/api/stems/{job_id}/all.zip")
async def download_all_stems(job_id: str):
    job_dir = os.path.join(OUTPUTS_DIR, job_id)
    if not os.path.isdir(job_dir):
        raise HTTPException(status_code=404, detail="No files found for this job")
    zip_base = os.path.join(job_dir, "lyra_stems")
    staging = os.path.join(job_dir, "_zip")
    shutil.rmtree(staging, ignore_errors=True)
    os.makedirs(staging, exist_ok=True)

    # Collect available stems directly from job_dir
    stems_to_zip = {
        "master_cover.mp3": "master_remastered.mp3",
        "lead_vocals.wav": "converted_vocals.wav",
        "instrumental.wav": "accompaniment.wav"
    }
    for dest_name, src_name in stems_to_zip.items():
        src_path = os.path.join(job_dir, src_name)
        if os.path.exists(src_path):
            shutil.copy(src_path, os.path.join(staging, dest_name))

    stems_dir = os.path.join(job_dir, "stems")
    if os.path.isdir(stems_dir):
        for f in os.listdir(stems_dir):
            sp = os.path.join(stems_dir, f)
            if os.path.isfile(sp):
                shutil.copy(sp, os.path.join(staging, f))

    extra = [os.path.join(job_dir, f) for f in ("melody.mid", "analysis.json", "meta.json")]
    for f in extra:
        if os.path.exists(f):
            shutil.copy(f, staging)

    path = shutil.make_archive(zip_base, "zip", staging)
    shutil.rmtree(staging, ignore_errors=True)
    return FileResponse(path, media_type="application/zip", filename=f"Lyra_{job_id}_stems.zip")


@app.get("/api/stems/{job_id}/{stem}")
async def get_stem(job_id: str, stem: str, request: Request, download: bool = False):
    if not stem.replace("_", "").isalnum():
        raise HTTPException(status_code=400, detail="Invalid stem name")
    job_dir = os.path.join(OUTPUTS_DIR, job_id)
    path = os.path.join(job_dir, "stems", f"{stem}.wav")
    if not os.path.exists(path):
        # Fallback to stems stored directly in job_dir
        alt_map = {
            "lead_vocal_converted": "converted_vocals.wav",
            "vocals": "converted_vocals.wav",
            "accompaniment": "accompaniment.wav",
            "instrumental": "accompaniment.wav"
        }
        alt = alt_map.get(stem)
        if alt and os.path.exists(os.path.join(job_dir, alt)):
            path = os.path.join(job_dir, alt)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Stem not found")
    return stream_audio_file(path, request, "audio/wav", download=download, download_filename=f"Lyra_{stem}.wav")


@app.get("/api/midi/{job_id}")
async def get_midi(job_id: str):
    path = os.path.join(OUTPUTS_DIR, job_id, "melody.mid")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="No MIDI for this job")
    return FileResponse(path, media_type="audio/midi", filename=f"Lyra_{job_id}_melody.mid")


@app.get("/api/melody/{job_id}")
async def get_melody_notes(job_id: str):
    """Notes of the final melody (for the piano-roll view)."""
    path = os.path.join(OUTPUTS_DIR, job_id, "melody.mid")
    analysis_path = os.path.join(OUTPUTS_DIR, job_id, "analysis.json")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="No melody for this job")
    notes = _read_midi_notes(path)
    analysis = {}
    if os.path.exists(analysis_path):
        with open(analysis_path) as f:
            analysis = json.load(f)
    return JSONResponse(content={"notes": notes, "analysis": analysis})


def _read_midi_notes(path: str) -> list:
    """Minimal reader for the type-0 files melody.py writes."""
    import struct
    with open(path, "rb") as f:
        data = f.read()
    ppq = struct.unpack(">H", data[12:14])[0]
    pos = 22
    tick, tempo = 0, 500000
    active, notes = {}, []
    while pos < len(data):
        delta = 0
        while True:
            b = data[pos]; pos += 1
            delta = (delta << 7) | (b & 0x7F)
            if not b & 0x80:
                break
        tick += delta
        status = data[pos]
        if status == 0xFF:
            mtype, length = data[pos + 1], data[pos + 2]
            if mtype == 0x51:
                tempo = int.from_bytes(data[pos + 3: pos + 6], "big")
            pos += 3 + length
            if mtype == 0x2F:
                break
            continue
        note, vel = data[pos + 1], data[pos + 2]
        pos += 3
        sec = tick * tempo / 1e6 / ppq
        if status & 0xF0 == 0x90 and vel > 0:
            active[note] = (sec, vel)
        elif note in active:
            s, v = active.pop(note)
            notes.append({"start": round(s, 3), "end": round(sec, 3), "note": note, "velocity": v})
    return notes


@app.get("/api/spotify/info")
async def get_spotify_track_info(url: str = Query(...)):
    try:
        info = audio_processor.resolve_spotify_track_info(url)
        return JSONResponse(content={"status": "success", "data": info})
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch Spotify track info: {str(e)}")


@app.post("/api/tune_preview")
async def tune_preview(audio_file: UploadFile = File(...)):
    """
    Quick "how would I sound in tune?" preview of a recorded take: note-level
    pitch correction on the F0 curve, re-synthesized in the singer's own voice.
    """
    tmp_id = f"preview_{int(time.time() * 1000)}"
    tmp_dir = os.path.join(UPLOADS_DIR, tmp_id)
    os.makedirs(tmp_dir, exist_ok=True)
    raw_path = os.path.join(tmp_dir, "raw.wav")
    standard_path = os.path.join(tmp_dir, "standard.wav")
    tuned_path = os.path.join(tmp_dir, "tuned.wav")

    try:
        with open(raw_path, "wb") as buffer:
            shutil.copyfileobj(audio_file.file, buffer)

        import subprocess
        subprocess.run([
            "ffmpeg", "-y", "-i", raw_path,
            "-ar", "44100", "-ac", "2",
            standard_path
        ], capture_output=True, check=True)

        # Same engine as the full pipeline: correct the pitch curve, re-synthesize once
        import melody
        import voice_enhance
        voice_enhance.retune_world(
            standard_path, tuned_path,
            lambda f0, fps: melody.correct_pitch(f0, fps=fps, strength=0.9, retune_ms=30.0, steadiness=0.6, vibrato=0.3),
        )

        with open(tuned_path, "rb") as f:
            content = f.read()

        return Response(
            content=content,
            media_type="audio/wav",
            headers={
                "Content-Disposition": "inline; filename=vocal_recording_tuned.wav"
            }
        )
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Vocal note correction failed: {err}")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


@app.get("/api/status/{job_id}")
async def get_job_status(job_id: str):
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JSONResponse(content=job)


@app.post("/api/jobs/clear_queue")
async def clear_queue():
    with job_manager._lock:
        pending_ids = [jid for jid, j in job_manager._jobs.items() if j.get("status") in ["queued", "processing", "error"]]
        for jid in pending_ids:
            del job_manager._jobs[jid]
        job_manager._save()
    return JSONResponse(content={"status": "success", "cleared_count": len(pending_ids)})


@app.get("/api/jobs")
async def list_recent_jobs():
    return JSONResponse(content={"jobs": job_manager.list_jobs(20, completed_only=True, cloud_only=True)})


@app.post("/api/jobs/{job_id}/save_to_cloud")
async def save_job_to_cloud(job_id: str):
    """
    Saves ONLY 1 single audio file (Master 3D) to Cloudflare R2 upon explicit user confirmation.
    Other stems/clean versions are not uploaded to save storage.
    Frees up heavy local scratch WAV files.
    """
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job_dir = os.path.join(OUTPUTS_DIR, job_id)
    if not os.path.exists(job_dir):
        raise HTTPException(status_code=404, detail="Job directory not found")

    # Locate the Master 3D audio file
    master_file = None
    for candidate in ["master_remastered.mp3", "master_remastered.opus", "master_remastered.wav"]:
        cand_path = os.path.join(job_dir, candidate)
        if os.path.exists(cand_path) and os.path.getsize(cand_path) > 1000:
            master_file = cand_path
            break

    if not master_file:
        raise HTTPException(status_code=404, detail="Master 3D audio file not found to save")

    if not r2_storage.is_r2_configured():
        raise HTTPException(status_code=500, detail="Cloudflare R2 cloud storage is not configured")

    # Upload ONLY the 1 Master 3D version to R2
    remote_key = f"{job_id}/master_3d.mp3"
    content_type = "audio/mpeg" if master_file.endswith(".mp3") else ("audio/wav" if master_file.endswith(".wav") else "audio/ogg; codecs=opus")
    cloud_url = r2_storage.upload_audio_to_r2(master_file, remote_key, content_type=content_type)
    if not cloud_url:
        raise HTTPException(status_code=500, detail="Failed to upload Master 3D to Cloudflare R2")

    # Update job metadata in memory and disk
    if "results" not in job:
        job["results"] = {}
    job["results"]["saved_to_cloud"] = True
    job["results"]["cloud_master_3d_url"] = cloud_url
    job_manager._save()

    meta_path = os.path.join(job_dir, "meta.json")
    if os.path.exists(meta_path):
        try:
            with open(meta_path, "r") as f:
                data = json.load(f)
            if "results" not in data:
                data["results"] = {}
            data["results"]["saved_to_cloud"] = True
            data["results"]["cloud_master_3d_url"] = cloud_url
            with open(meta_path, "w") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print("Error updating meta.json:", e)

    # Update central R2 cloud catalog so all environments (Colab, Mac, Web) stay in sync
    try:
        catalog = r2_storage.get_cloud_catalog()
        catalog[job_id] = {
            "id": job_id,
            "status": "completed",
            "progress": 100,
            "created_at": job.get("created_at", time.time()),
            "updated_at": time.time(),
            "metadata": job.get("metadata", {}),
            "results": job.get("results", {})
        }
        r2_storage.save_cloud_catalog(catalog)
    except Exception as e:
        print("Error saving cloud catalog to R2:", e)

    # Clean up ALL heavy temporary local stems and uncompressed WAVs from outputs folder
    # Cloudflare R2 stores the single Master 3D MP3, so local outputs only needs meta.json (1 KB)
    for fname in os.listdir(job_dir):
        if fname not in ["meta.json", "master_remastered.mp3"]:
            try:
                fpath = os.path.join(job_dir, fname)
                if os.path.isfile(fpath):
                    os.remove(fpath)
            except Exception:
                pass

    return JSONResponse(content={
        "status": "success",
        "message": "Master 3D saved to Cloudflare R2 cloud storage successfully!",
        "cloud_url": cloud_url,
        "saved_to_cloud": True
    })


@app.delete("/api/jobs/{job_id}")
async def delete_job(job_id: str):
    success = job_manager.delete_job(job_id)
    # Remove files if exist
    job_dir = os.path.join(OUTPUTS_DIR, job_id)
    if os.path.exists(job_dir):
        shutil.rmtree(job_dir, ignore_errors=True)
    # Remove from cloud catalog if present
    try:
        catalog = r2_storage.get_cloud_catalog()
        if job_id in catalog:
            del catalog[job_id]
            r2_storage.save_cloud_catalog(catalog)
    except Exception:
        pass
    if not success:
        raise HTTPException(status_code=404, detail="Job not found")
    return JSONResponse(content={"status": "deleted", "job_id": job_id})


@app.post("/api/remix")
async def quick_remix(
    job_id: str = Form(...),
    vocal_gain_db: float = Form(2.8),
    inst_gain_db: float = Form(-7.5),
    reverb_amount: float = Form(0.05),
    echo_amount: float = Form(0.03),
    warmth: float = Form(0.55),
    clarity: float = Form(0.85),
    center_anchor: float = Form(1.0),
    presence_boost_db: float = Form(2.8),
    apply_autotune: bool = Form(True),
    autotune_strength: float = Form(0.50)
):
    """
    Rapidly re-masters and re-mixes existing converted stems with autotune, spiral echo, and reverb without re-running neural RVC.
    """
    job = job_manager.get_job(job_id)
    if not job or job.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Job must be completed before remixing.")

    job_dir = os.path.join(OUTPUTS_DIR, job_id)
    
    # Locate the dry rendered vocal (pitch is already corrected on the F0 curve)
    vocal_path = None
    for candidate in ["vocals_with_harmony.wav", "converted_vocals.wav", "arijit_vocals.wav", "vocal_autotuned.wav", "vocals.wav"]:
        p = os.path.join(job_dir, candidate)
        if os.path.exists(p):
            vocal_path = p
            break

    inst_path = os.path.join(job_dir, "instrumental.wav")
    for candidate in ["accompaniment.wav", os.path.join("guide", "accompaniment.wav"), "instrumental.wav"]:
        if os.path.exists(os.path.join(job_dir, candidate)):
            inst_path = os.path.join(job_dir, candidate)
            break
    raw_vocal_path = os.path.join(job_dir, "vocals_lead_dry.wav")
    if not os.path.exists(raw_vocal_path):
        raw_vocal_path = os.path.join(job_dir, "vocals.wav")

    if not vocal_path:
        raise HTTPException(status_code=404, detail="Vocal stem missing")

    # Re-run master with instant acoustics & balance (< 1 second)
    audio_processor.master_and_remaster_track(
        vocal_wav=vocal_path,
        inst_wav=inst_path if os.path.exists(inst_path) else None,
        output_dir=job_dir,
        raw_vocal_wav=raw_vocal_path if os.path.exists(raw_vocal_path) else None,
        vocal_gain_db=vocal_gain_db,
        inst_gain_db=inst_gain_db,
        reverb_amount=reverb_amount,
        echo_amount=echo_amount,
        warmth=warmth,
        clarity=clarity,
        apply_autotune=False,
        center_anchor=center_anchor,
        presence_boost_db=presence_boost_db
    )

    now_ts = int(time.time() * 1000)
    return JSONResponse(content={
        "status": "success",
        "message": "Remastered track updated successfully with new balance, autotune, echo, and reverb parameters!",
        "master_wav": f"/api/audio/{job_id}/master_wav?t={now_ts}",
        "master_mp3": f"/api/audio/{job_id}/master_mp3?t={now_ts}",
        "master_clean_wav": f"/api/audio/{job_id}/master_clean_wav?t={now_ts}",
        "master_clean_mp3": f"/api/audio/{job_id}/master_clean_mp3?t={now_ts}",
        "vocal_wav": f"/api/audio/{job_id}/vocal_arijit?t={now_ts}"
    })


def stream_audio_file(file_path: str, request: Request, media_type: str, download: bool = False, download_filename: str = ""):
    file_size = os.path.getsize(file_path)
    range_header = request.headers.get("range")

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Type": media_type,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
    }
    if download:
        headers["Content-Disposition"] = f'attachment; filename="{download_filename or os.path.basename(file_path)}"'

    # Handle HEAD request for browser audio preflight
    if request.method == "HEAD":
        headers["Content-Length"] = str(file_size)
        return Response(status_code=200, headers=headers)

    # Handle byte range seeking (e.g. user drags timeline slider)
    if range_header and range_header.startswith("bytes="):
        try:
            range_spec = range_header.replace("bytes=", "").strip()
            parts = range_spec.split("-")
            start = int(parts[0]) if parts[0] else 0
            end = int(parts[1]) if len(parts) > 1 and parts[1] else file_size - 1
            end = min(end, file_size - 1)

            if start > end or start >= file_size:
                return Response(status_code=416, headers={"Content-Range": f"bytes */{file_size}"})

            length = end - start + 1

            def iter_chunk():
                with open(file_path, "rb") as f:
                    f.seek(start)
                    remaining = length
                    while remaining > 0:
                        chunk_size = min(remaining, 64 * 1024)
                        data = f.read(chunk_size)
                        if not data:
                            break
                        remaining -= len(data)
                        yield data

            headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
            headers["Content-Length"] = str(length)
            return StreamingResponse(iter_chunk(), status_code=206, headers=headers, media_type=media_type)
        except Exception:
            pass

    # Standard streaming response
    def iter_full():
        with open(file_path, "rb") as f:
            while chunk := f.read(64 * 1024):
                yield chunk

    headers["Content-Length"] = str(file_size)
    return StreamingResponse(iter_full(), status_code=200, headers=headers, media_type=media_type)


@app.api_route("/api/audio/{job_id}/{track_type}", methods=["GET", "HEAD"])
async def get_audio_file(job_id: str, track_type: str, request: Request, download: bool = False):
    job_dir = os.path.join(OUTPUTS_DIR, job_id)
    
    # Check for processed vocal stem with studio acoustics first
    vocal_filename = "vocal_processed.wav"
    for cand in ["vocal_processed.wav", "converted_vocals.wav", "arijit_vocals.wav"]:
        if os.path.exists(os.path.join(job_dir, cand)):
            vocal_filename = cand
            break
    
    file_map = {
        "input": "input_audio.wav",
        "vocal_original": "vocals.wav",
        "instrumental": "accompaniment.wav" if os.path.exists(os.path.join(job_dir, "accompaniment.wav")) else (
            "guide/accompaniment.wav" if os.path.exists(os.path.join(job_dir, "guide", "accompaniment.wav")) else "instrumental.wav"),
        "vocal_arijit": vocal_filename,
        "vocal_converted": vocal_filename,
        "vocal_autotuned": "vocal_autotuned.wav",
        "master_wav": "master_remastered.wav",
        "master_mp3": "master_remastered.mp3",
        "master_clean_wav": "master_clean.wav",
        "master_clean_mp3": "master_clean.mp3",
        "master_clean": "master_clean.mp3",
    }
    
    filename = file_map.get(track_type)
    if not filename:
        raise HTTPException(status_code=400, detail="Invalid track type")
        
    file_path = os.path.join(job_dir, filename)
    if not os.path.exists(file_path):
        # Ensure clean unremastered master is synthesized on the fly if missing (0% remastering)
        if track_type in ["master_clean", "master_clean_mp3", "master_clean_wav"]:
            clean_wav, clean_mp3 = audio_processor.export_clean_unremastered_master(job_dir)
            target_f = clean_mp3 if track_type != "master_clean_wav" else clean_wav
            if os.path.exists(target_f) and os.path.getsize(target_f) > 100:
                file_path = target_f
            else:
                for alt in ["master_clean.mp3", "master_clean.wav"]:
                    alt_p = os.path.join(job_dir, alt)
                    if os.path.exists(alt_p) and os.path.getsize(alt_p) > 100:
                        file_path = alt_p
                        break
        # Fallbacks for master tracks
        elif track_type in ["master_mp3", "master_wav"]:
            for alt in ["master_remastered.mp3", "master_remastered.wav", "vocal_processed.wav", "converted_vocals.wav", "arijit_vocals.wav", "vocal_pitch_perfect.wav", "vocals.wav"]:
                alt_p = os.path.join(job_dir, alt)
                if os.path.exists(alt_p) and os.path.getsize(alt_p) > 100:
                    file_path = alt_p
                    break
        elif track_type in ["vocal_arijit", "vocal_converted", "vocal_autotuned"]:
            for alt in ["vocal_processed.wav", "converted_vocals.wav", "vocal_autotuned.wav", "arijit_vocals.wav", "vocal_pitch_perfect.wav", "vocals.wav"]:
                alt_p = os.path.join(job_dir, alt)
                if os.path.exists(alt_p) and os.path.getsize(alt_p) > 100:
                    file_path = alt_p
                    break
        elif track_type in ["vocal_original", "input"]:
            for alt in ["vocals.wav", "input_audio.wav", "vocals_lead_dry.wav", "vocals_timing_aligned.wav"]:
                alt_p = os.path.join(job_dir, alt)
                if os.path.exists(alt_p) and os.path.getsize(alt_p) > 100:
                    file_path = alt_p
                    break

        if not os.path.exists(file_path):
            if r2_storage.is_r2_configured():
                candidate_keys = [f"{job_id}/{filename}"]
                if track_type in ["master_mp3", "master_wav", "master"]:
                    candidate_keys = [f"{job_id}/master_3d.mp3", f"{job_id}/master_remastered.mp3", f"{job_id}/{filename}"]
                for ck in candidate_keys:
                    r2_url = r2_storage.get_r2_presigned_url(ck)
                    if r2_url:
                        from fastapi.responses import RedirectResponse
                        return RedirectResponse(url=r2_url, status_code=307)
            raise HTTPException(status_code=404, detail=f"Audio file '{filename}' not found for job {job_id}")

    media_type = "audio/mpeg" if file_path.endswith(".mp3") else "audio/wav"
    download_filename = f"StudioMaster_{track_type}_{os.path.basename(file_path)}"
    return stream_audio_file(file_path, request, media_type, download=download, download_filename=download_filename)


@app.get("/api/models")
async def get_available_models():
    models_list = []
    seen = set()
    for m_id, m in audio_processor.AVAILABLE_MODELS.items():
        if m["id"] in seen:
            continue
        seen.add(m["id"])
        pth_path = os.path.join(m["dir"], m["pth"])
        idx_path = os.path.join(m["dir"], m["index"])
        models_list.append({
            "id": m["id"],
            "name": m["name"],
            "tagline": m["tagline"],
            "is_ready": os.path.exists(pth_path),
            "weights_size_mb": round(os.path.getsize(pth_path)/(1024*1024), 2) if os.path.exists(pth_path) else 0,
            "has_index": os.path.exists(idx_path),
            "index_size_mb": round(os.path.getsize(idx_path)/(1024*1024), 2) if os.path.exists(idx_path) else 0,
            "kind": "singer",
        })
    for v in voices.list_custom_voices():
        models_list.append({
            "id": v["id"],
            "name": v["name"],
            "tagline": v.get("tagline", ""),
            "is_ready": v["is_ready"],
            "has_index": v["has_index"],
            "kind": "personal",
            "status": v.get("status"),
        })
    return JSONResponse(content={"models": models_list})


@app.get("/api/info")
async def get_system_info():
    import torch
    models_summary = []
    seen = set()
    for m_id, m in audio_processor.AVAILABLE_MODELS.items():
        if m["id"] in seen:
            continue
        seen.add(m["id"])
        pth_path = os.path.join(m["dir"], m["pth"])
        idx_path = os.path.join(m["dir"], m["index"])
        models_summary.append({
            "id": m["id"],
            "name": m["name"],
            "tagline": m["tagline"],
            "weights_present": os.path.exists(pth_path),
            "weights_size_mb": round(os.path.getsize(pth_path)/(1024*1024), 2) if os.path.exists(pth_path) else 0,
            "index_present": os.path.exists(idx_path),
            "index_size_mb": round(os.path.getsize(idx_path)/(1024*1024), 2) if os.path.exists(idx_path) else 0,
        })

    return {
        "model_name": "Arijit Singh, Sonu Nigam & KK RVC v2",
        "models": models_summary,
        "default_model": "arijit_singh",
        "torch_device": "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu"),
        "separation": {"vocals": separation.VOCAL_MODEL, "karaoke": separation.KARAOKE_MODEL, "dereverb": separation.DEREVERB_MODEL},
        "personal_voices": len(voices.list_custom_voices()),
        "seedvc_available": engines.seedvc_available(),
        "resources": resources.storage_report(OUTPUTS_DIR),
        "demucs_ready": True,
        "autotune_ready": True
    }


# Serve the built frontend (npm run build) from the same process, so a small
# machine doesn't need the Vite dev server running. API routes take priority.
FRONTEND_DIST = os.path.join(os.path.dirname(BASE_DIR), "frontend", "dist")
if os.path.isdir(FRONTEND_DIST):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=False)
