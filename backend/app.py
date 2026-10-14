import os
import time
import json
import shutil
import threading
import traceback
from typing import Optional
from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from jobs import job_manager
import audio_processor

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
OUTPUTS_DIR = os.path.join(BASE_DIR, "outputs")
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

        master_wav = os.path.join(job_dir, "master_remastered.wav")
        vocal_wav = None
        for candidate in ["arijit_vocals.wav", "vocal_processed.wav", "vocals.wav"]:
            p = os.path.join(job_dir, candidate)
            if os.path.exists(p):
                vocal_wav = p
                break

        if os.path.exists(master_wav) and vocal_wav:
            has_inst = os.path.exists(os.path.join(job_dir, "instrumental.wav"))
            has_orig_vocal = os.path.exists(os.path.join(job_dir, "vocals.wav"))

            # Determine model_name and singer
            model_name = (saved_meta.get("model_name") if saved_meta else None) or \
                         (existing.get("metadata", {}).get("model_name") if existing else None) or \
                         (existing.get("results", {}).get("model_name") if existing else None) or \
                         "arijit_singh"
            model_info = audio_processor.AVAILABLE_MODELS.get(model_name, audio_processor.AVAILABLE_MODELS.get("arijit_singh", {"name": "Arijit Singh"}))
            singer_name = (saved_meta.get("singer") if saved_meta else None) or \
                          (existing.get("results", {}).get("singer") if existing else None) or \
                          model_info.get("name", "Arijit Singh")

            # Determine real song title
            real_title = None
            if saved_meta and saved_meta.get("title") and "Bigg Boss" not in saved_meta.get("title", ""):
                real_title = saved_meta["title"]
            elif existing:
                ex_m = existing.get("metadata", {})
                ex_r = existing.get("results", {})
                cand = ex_r.get("title") or ex_m.get("title") or ex_m.get("filename")
                if cand and not str(cand).startswith("Song Conversion (") and "Bigg Boss" not in str(cand):
                    real_title = cand
                elif ex_m.get("youtube_url"):
                    real_title = f"YouTube Track ({singer_name} Version)"
                elif ex_m.get("spotify_url"):
                    real_title = f"Spotify Track ({singer_name} Version)"

            if not real_title or real_title.startswith("Song Conversion (") or "Bigg Boss" in str(real_title):
                real_title = f"Studio Track {name[:6]} ({singer_name} Version)"

            thumbnail = (saved_meta.get("thumbnail") if saved_meta else None) or \
                        (existing.get("results", {}).get("thumbnail") if existing else None) or \
                        ""

            uploader = (saved_meta.get("uploader") if saved_meta else None) or \
                       (existing.get("results", {}).get("uploader") if existing else None) or \
                       "AI Studio"

            job_manager._jobs[name] = {
                "id": name,
                "status": "completed",
                "progress": 100,
                "message": f"Completed with authentic {singer_name} diction & pitch lock",
                "created_at": existing.get("created_at") if existing else os.path.getctime(master_wav),
                "updated_at": existing.get("updated_at") if existing else os.path.getmtime(master_wav),
                "metadata": {
                    "title": real_title,
                    "model_name": model_name,
                    "singer_name": singer_name,
                    **(existing.get("metadata", {}) if existing else {})
                },
                "results": {
                    "title": real_title,
                    "thumbnail": thumbnail,
                    "duration": (saved_meta.get("duration") if saved_meta else None) or (existing.get("results", {}).get("duration") if existing else 52.8) or 52.8,
                    "uploader": uploader,
                    "singer": singer_name,
                    "model_name": model_name,
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


def run_pipeline(
    job_id: str,
    source_type: str,
    file_path: Optional[str],
    youtube_url: Optional[str],
    model_name: str,
    pitch_shift: int,
    f0_method: str,
    index_rate: float,
    protect: float,
    vocal_gain_db: float = 0.0,
    inst_gain_db: float = 0.0,
    reverb_amount: float = 0.0,
    echo_amount: float = 0.0,
    warmth: float = 0.55,
    clarity: float = 0.85,
    has_music: bool = True,
    apply_autotune: bool = True,
    autotune_strength: float = 0.50,
    spotify_url: Optional[str] = None
):
    job_dir = os.path.join(OUTPUTS_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)

    def progress_callback(progress: int, message: str):
        job_manager.update_job(job_id, progress=progress, message=message)

    try:
        model_info = audio_processor.AVAILABLE_MODELS.get(model_name, audio_processor.AVAILABLE_MODELS["arijit_singh"])
        singer_name = model_info["name"]

        job_manager.update_job(job_id, status="processing", progress=5, message=f"Starting AI studio pipeline ({singer_name})...")
        meta_info = {}

        # 1. Ingest input audio
        if source_type == "spotify" or (spotify_url and ("spotify.com" in spotify_url or spotify_url.startswith("spotify:"))):
            target_url = spotify_url or youtube_url
            progress_callback(8, f"Ingesting Spotify track from: {target_url[:40]}...")
            spot_res = audio_processor.download_spotify_audio(target_url, job_dir, progress_cb=progress_callback)
            input_audio_path = spot_res["audio_path"]
            meta_info["title"] = spot_res["title"]
            meta_info["thumbnail"] = spot_res["thumbnail"]
            meta_info["duration"] = spot_res["duration"]
            meta_info["uploader"] = spot_res["uploader"]
        elif source_type == "youtube":
            if youtube_url and ("spotify.com" in youtube_url or youtube_url.startswith("spotify:")):
                progress_callback(8, f"Detected Spotify track from: {youtube_url[:40]}...")
                spot_res = audio_processor.download_spotify_audio(youtube_url, job_dir, progress_cb=progress_callback)
                input_audio_path = spot_res["audio_path"]
                meta_info["title"] = spot_res["title"]
                meta_info["thumbnail"] = spot_res["thumbnail"]
                meta_info["duration"] = spot_res["duration"]
                meta_info["uploader"] = spot_res["uploader"]
            else:
                progress_callback(8, f"Ingesting YouTube audio from: {youtube_url[:40]}...")
                yt_res = audio_processor.download_youtube_audio(youtube_url, job_dir, progress_cb=progress_callback)
                input_audio_path = yt_res["audio_path"]
                meta_info["title"] = yt_res["title"]
                meta_info["thumbnail"] = yt_res["thumbnail"]
                meta_info["duration"] = yt_res["duration"]
                meta_info["uploader"] = yt_res["uploader"]
        else:
            progress_callback(10, "Validating and preparing uploaded audio file...")
            input_audio_path = os.path.join(job_dir, "input_audio.wav")
            # Convert uploaded file to 44.1kHz standard WAV via ffmpeg
            os.system(f"ffmpeg -y -i '{file_path}' -ar 44100 -ac 2 '{input_audio_path}' > /dev/null 2>&1")
            meta_info["title"] = os.path.basename(file_path) if file_path else "Uploaded Audio"
            # Delete redundant file in uploads folder to save precious disk space
            if file_path and os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except Exception:
                    pass

        # 2. Separation with Demucs
        if has_music:
            progress_callback(28, "Separating audio into Vocal and Instrumental stems (Demucs)...")
            stems = audio_processor.separate_stems_demucs(input_audio_path, job_dir, progress_cb=progress_callback)
            isolated_vocal_path = stems["vocals_path"]
            instrumental_path = stems["instrumental_path"]
        else:
            progress_callback(35, "Input marked as pure vocal track (skipping stem separation)...")
            isolated_vocal_path = input_audio_path
            instrumental_path = None

        # 3. Voice Conversion to Selected Singer (Arijit Singh or Sonu Nigam)
        progress_callback(62, f"Converting vocal stem into {singer_name}'s voice (F0={f0_method}, pitch={pitch_shift:+d})...")
        converted_vocal_path = audio_processor.convert_voice(
            vocal_path=isolated_vocal_path,
            output_dir=job_dir,
            model_name=model_name,
            pitch_shift=pitch_shift,
            f0_method=f0_method,
            index_rate=index_rate,
            protect=protect,
            progress_cb=progress_callback
        )

        # 4. Studio Remastering, AI Diction Enhancement & Acoustics
        progress_callback(85, "Remastering audio: enhancing Hindi lyric diction, consonant clarity & studio limiter...")
        master_res = audio_processor.master_and_remaster_track(
            vocal_wav=converted_vocal_path,
            inst_wav=instrumental_path,
            output_dir=job_dir,
            raw_vocal_wav=isolated_vocal_path,
            vocal_gain_db=vocal_gain_db,
            inst_gain_db=inst_gain_db,
            reverb_amount=reverb_amount,
            echo_amount=echo_amount,
            warmth=warmth,
            clarity=clarity,
            apply_autotune=apply_autotune,
            autotune_strength=autotune_strength,
            progress_cb=progress_callback
        )

        results = {
            "title": f"{meta_info.get('title', 'Song')} ({singer_name} Version)",
            "thumbnail": meta_info.get("thumbnail", ""),
            "duration": meta_info.get("duration", 0),
            "uploader": meta_info.get("uploader", ""),
            "singer": singer_name,
            "model_name": model_name,
            "input_audio": f"/api/audio/{job_id}/input",
            "vocals_original": f"/api/audio/{job_id}/vocal_original" if has_music else "",
            "instrumental": f"/api/audio/{job_id}/instrumental" if instrumental_path else "",
            "vocals_arijit": f"/api/audio/{job_id}/vocal_arijit",
            "vocals_converted": f"/api/audio/{job_id}/vocal_arijit",
            "master_remastered_wav": f"/api/audio/{job_id}/master_wav",
            "master_remastered_mp3": f"/api/audio/{job_id}/master_mp3",
            "settings": {
                "model_name": model_name,
                "singer_name": singer_name,
                "pitch_shift": pitch_shift,
                "f0_method": f0_method,
                "index_rate": index_rate,
                "protect": protect,
                "vocal_gain_db": vocal_gain_db,
                "inst_gain_db": inst_gain_db,
                "reverb_amount": reverb_amount,
                "echo_amount": echo_amount,
                "apply_autotune": apply_autotune,
                "autotune_strength": autotune_strength
            }
        }

        job_manager.update_job(
            job_id,
            status="completed",
            progress=100,
            message=f"{singer_name} conversion & studio polish finalized successfully!",
            results=results
        )

        # Save meta.json in job directory to survive restarts
        try:
            with open(os.path.join(job_dir, "meta.json"), "w") as f:
                json.dump({
                    "id": job_id,
                    "title": results["title"],
                    "singer": singer_name,
                    "model_name": model_name,
                    "thumbnail": results["thumbnail"],
                    "duration": results["duration"],
                    "uploader": results["uploader"],
                    "source_type": source_type,
                    "results": results
                }, f, indent=2)
        except Exception as err:
            print("Could not save job meta.json:", err)

    except BaseException as e:
        err_msg = str(e)
        logger_trace = traceback.format_exc()
        print(f"Error in job {job_id}: {logger_trace}")
        job_manager.update_job(job_id, status="error", error=err_msg)


@app.post("/api/convert")
async def start_conversion(
    background_tasks: BackgroundTasks,
    audio_file: Optional[UploadFile] = File(None),
    youtube_url: Optional[str] = Form(None),
    spotify_url: Optional[str] = Form(None),
    model_name: str = Form("arijit_singh"),
    pitch_shift: int = Form(0),
    f0_method: str = Form("rmvpe"),
    index_rate: float = Form(0.28),
    protect: float = Form(0.05),
    vocal_gain_db: float = Form(0.0),
    inst_gain_db: float = Form(0.0),
    reverb_amount: float = Form(0.0),
    echo_amount: float = Form(0.0),
    warmth: float = Form(0.55),
    clarity: float = Form(0.85),
    has_music: bool = Form(True),
    apply_autotune: bool = Form(True),
    autotune_strength: float = Form(0.50)
):
    # Auto-detect spotify URL passed in youtube_url field
    if youtube_url and ("spotify.com" in youtube_url or youtube_url.startswith("spotify:")):
        if not spotify_url:
            spotify_url = youtube_url
            youtube_url = None

    if not audio_file and not youtube_url and not spotify_url:
        raise HTTPException(status_code=400, detail="Please provide an audio file, YouTube URL, or Spotify URL.")

    source_type = "file" if audio_file else ("spotify" if spotify_url else "youtube")
    saved_file_path = None

    job_id = job_manager.create_job(metadata={
        "source_type": source_type,
        "youtube_url": youtube_url,
        "spotify_url": spotify_url,
        "filename": audio_file.filename if audio_file else None,
        "model_name": model_name,
        "pitch_shift": pitch_shift,
        "f0_method": f0_method
    })

    if audio_file:
        dest_filename = f"{job_id}_{audio_file.filename}"
        saved_file_path = os.path.join(UPLOADS_DIR, dest_filename)
        with open(saved_file_path, "wb") as buffer:
            shutil.copyfileobj(audio_file.file, buffer)

    background_tasks.add_task(
        run_pipeline,
        job_id=job_id,
        source_type=source_type,
        file_path=saved_file_path,
        youtube_url=youtube_url,
        model_name=model_name,
        pitch_shift=pitch_shift,
        f0_method=f0_method,
        index_rate=index_rate,
        protect=protect,
        vocal_gain_db=vocal_gain_db,
        inst_gain_db=inst_gain_db,
        reverb_amount=reverb_amount,
        echo_amount=echo_amount,
        warmth=warmth,
        clarity=clarity,
        has_music=has_music,
        apply_autotune=apply_autotune,
        autotune_strength=autotune_strength,
        spotify_url=spotify_url
    )

    return JSONResponse(content={"job_id": job_id, "status": "queued", "message": "Job queued successfully"})


@app.get("/api/spotify/info")
async def get_spotify_track_info(url: str = Query(...)):
    try:
        info = audio_processor.resolve_spotify_track_info(url)
        return JSONResponse(content={"status": "success", "data": info})
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch Spotify track info: {str(e)}")


@app.get("/api/status/{job_id}")
async def get_job_status(job_id: str):
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JSONResponse(content=job)


@app.get("/api/jobs")
async def list_recent_jobs():
    return JSONResponse(content={"jobs": job_manager.list_jobs(20, completed_only=True)})


@app.delete("/api/jobs/{job_id}")
async def delete_job(job_id: str):
    success = job_manager.delete_job(job_id)
    # Remove files if exist
    job_dir = os.path.join(OUTPUTS_DIR, job_id)
    if os.path.exists(job_dir):
        shutil.rmtree(job_dir, ignore_errors=True)
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
    
    # Locate cleanest vocal stem:
    # If vocal_autotuned.wav already exists, use it directly and bypass redundant PSOLA processing
    autotuned_candidate = os.path.join(job_dir, "vocal_autotuned.wav")
    need_autotune = apply_autotune
    if os.path.exists(autotuned_candidate):
        vocal_path = autotuned_candidate
        need_autotune = False  # already tuned, saves 15-20s CPU processing!
    else:
        vocal_path = None
        for candidate in ["arijit_vocals.wav", "vocal_processed.wav", "vocals.wav"]:
            p = os.path.join(job_dir, candidate)
            if os.path.exists(p):
                vocal_path = p
                break

    inst_path = os.path.join(job_dir, "instrumental.wav")
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
        apply_autotune=need_autotune,
        autotune_strength=autotune_strength,
        center_anchor=center_anchor,
        presence_boost_db=presence_boost_db
    )

    now_ts = int(time.time() * 1000)
    return JSONResponse(content={
        "status": "success",
        "message": "Remastered track updated successfully with new balance, autotune, echo, and reverb parameters!",
        "master_wav": f"/api/audio/{job_id}/master_wav?t={now_ts}",
        "master_mp3": f"/api/audio/{job_id}/master_mp3?t={now_ts}",
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
    vocal_filename = "vocal_processed.wav" if os.path.exists(os.path.join(job_dir, "vocal_processed.wav")) else "arijit_vocals.wav"
    
    file_map = {
        "input": "input_audio.wav",
        "vocal_original": "vocals.wav",
        "instrumental": "instrumental.wav",
        "vocal_arijit": vocal_filename,
        "vocal_converted": vocal_filename,
        "vocal_autotuned": "vocal_autotuned.wav",
        "master_wav": "master_remastered.wav",
        "master_mp3": "master_remastered.mp3",
    }
    
    filename = file_map.get(track_type)
    if not filename:
        raise HTTPException(status_code=400, detail="Invalid track type")
        
    file_path = os.path.join(job_dir, filename)
    if not os.path.exists(file_path):
        # Fallbacks for vocal variations
        if track_type in ["vocal_arijit", "vocal_converted", "vocal_autotuned"]:
            for alt in ["vocal_processed.wav", "vocal_autotuned.wav", "arijit_vocals.wav"]:
                alt_p = os.path.join(job_dir, alt)
                if os.path.exists(alt_p):
                    file_path = alt_p
                    break
        if not os.path.exists(file_path):
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
        "torch_device": "mps" if torch.backends.mps.is_available() else "cpu",
        "demucs_ready": True,
        "autotune_ready": True
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=False)
