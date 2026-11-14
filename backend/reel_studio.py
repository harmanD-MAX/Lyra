"""
Reel Studio: put a converted song on a video (an Instagram post / reel, any
yt-dlp link, or an uploaded clip) and export a finished reel.

    import_video   download or take an upload, probe it, make a browser-safe
                   preview (H.264/AAC MP4) and a filmstrip of thumbnails
    song_peaks     waveform peaks of a song track for the editor timeline
    start_render   render a project (see normalize_project) with ffmpeg in a
                   background thread; progress is kept in reel.json

A project is a small JSON edit list; the editor in the browser previews it
live and the server renders exactly the same thing:

    clips   the video, as an ordered list of {in, out} pieces of the source
            (trim, split, delete) played back to back -> the reel timeline
    songs   pieces of converted song audio, each {track, in, out, at, volume,
            fade_in, fade_out}; `at` is where the piece starts on the reel
            timeline, so pieces can be moved, trimmed, split and overlapped
    video   original-audio volume (0 = muted), fade from / to black
    canvas  aspect (9:16, 4:5, 1:1, 16:9 or source), fit (fill / fit / blur),
            zoom and pan for the fill crop
    adjust  brightness, contrast, saturation
    texts   text overlays {text, start, end, x, y, size, color, box}
    export  resolution (1080 / 720) and quality
"""

import json
import logging
import math
import os
import re
import shutil
import subprocess
import threading
import time
import uuid
from typing import Callable, Dict, List, Optional

import numpy as np

logger = logging.getLogger(__name__)

SONG_TRACKS = ("master", "clean", "vocal", "instrumental")
ASPECTS = {"9:16": (9, 16), "4:5": (4, 5), "1:1": (1, 1), "16:9": (16, 9)}
FITS = ("fill", "fit", "blur")
MAX_TEXTS = 20
MAX_CLIPS = 60
MAX_IMPORT_SECONDS = 15 * 60
REEL_ID_RE = re.compile(r"^[a-f0-9]{12}$")
AUDIO_ID_RE = re.compile(r"^ext_[a-f0-9]{8}$")   # your own audio files added to a reel
MAX_AUDIO_SECONDS = 30 * 60
MAX_AUDIOS = 20

_LOCK = threading.Lock()
_RENDERS: Dict[str, subprocess.Popen] = {}


# ---------------------------------------------------------------------------
# storage
# ---------------------------------------------------------------------------

def reels_root(outputs_dir: str) -> str:
    return os.path.join(outputs_dir, "reels")


def reel_dir(outputs_dir: str, reel_id: str) -> str:
    if not REEL_ID_RE.match(reel_id or ""):
        raise ValueError("Invalid reel id")
    return os.path.join(reels_root(outputs_dir), reel_id)


def read_meta(rdir: str) -> dict:
    try:
        with open(os.path.join(rdir, "reel.json")) as f:
            return json.load(f)
    except Exception:
        return {}


def update_meta(rdir: str, **changes) -> dict:
    with _LOCK:
        meta = read_meta(rdir)
        meta.update(changes)
        meta["updated_at"] = time.time()
        tmp = os.path.join(rdir, "reel.json.tmp")
        with open(tmp, "w") as f:
            json.dump(meta, f, indent=2)
        os.replace(tmp, os.path.join(rdir, "reel.json"))
        return meta


def new_reel(outputs_dir: str, job_id: Optional[str]) -> tuple:
    reel_id = uuid.uuid4().hex[:12]
    rdir = reel_dir(outputs_dir, reel_id)
    os.makedirs(rdir, exist_ok=True)
    update_meta(rdir, id=reel_id, job_id=job_id, status="importing", message="Getting your video...",
                created_at=time.time(), render={"status": "idle"})
    return reel_id, rdir


# ---------------------------------------------------------------------------
# probing
# ---------------------------------------------------------------------------

def probe(path: str) -> dict:
    out = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", path],
                         capture_output=True, text=True, check=True).stdout
    info = json.loads(out)
    v = next((s for s in info.get("streams", []) if s.get("codec_type") == "video"), None)
    a = next((s for s in info.get("streams", []) if s.get("codec_type") == "audio"), None)
    if v is None:
        raise RuntimeError("This file has no video stream")
    w, h = int(v.get("width") or 0), int(v.get("height") or 0)
    rot = 0
    for sd in v.get("side_data_list", []) or []:
        if "rotation" in sd:
            rot = int(float(sd["rotation"])) % 360
    if str((v.get("tags") or {}).get("rotate", "0")).lstrip("-").isdigit():
        rot = rot or int((v.get("tags") or {}).get("rotate", 0)) % 360
    if rot in (90, 270):
        w, h = h, w
    fps = 30.0
    try:
        num, den = (v.get("avg_frame_rate") or v.get("r_frame_rate") or "30/1").split("/")
        fps = float(num) / float(den) if float(den) else 30.0
    except Exception:
        pass
    duration = float(info.get("format", {}).get("duration") or v.get("duration") or 0.0)
    return {
        "width": w, "height": h, "fps": round(fps if 1 < fps < 121 else 30.0, 3),
        "duration": round(duration, 3), "has_audio": a is not None,
        "vcodec": v.get("codec_name"), "acodec": a.get("codec_name") if a else None,
        "pix_fmt": v.get("pix_fmt"),
    }


# ---------------------------------------------------------------------------
# import
# ---------------------------------------------------------------------------

def _ydl_opts(out_template: str) -> dict:
    import audio_processor
    opts = audio_processor._get_yt_dlp_opts()  # same headers / cookies as song downloads
    opts.update({
        "format": "bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b[ext=mp4]/b",
        "merge_output_format": "mp4",
        "outtmpl": out_template,
        "noplaylist": True,
    })
    opts.pop("postprocessors", None)
    opts.pop("postprocessor_args", None)
    ig_cookies = os.environ.get("INSTAGRAM_COOKIES_PATH")
    if ig_cookies and os.path.isfile(ig_cookies):
        opts["cookiefile"] = ig_cookies
    return opts


def download_video(url: str, rdir: str) -> dict:
    """Download a post / reel (Instagram, YouTube Shorts, TikTok, ... anything yt-dlp reads)."""
    import yt_dlp
    out_template = os.path.join(rdir, "download.%(ext)s")
    try:
        with yt_dlp.YoutubeDL(_ydl_opts(out_template)) as ydl:
            info = ydl.extract_info(url, download=True)
    except Exception as e:
        msg = str(e)
        low = msg.lower()
        if "instagram" in url.lower() and "proxy" not in low and any(
                k in low for k in ("login", "cookie", "rate-limit", "rate limit", "private", "401")):
            raise RuntimeError("Instagram wants a login for this post. Download the video on your phone and upload "
                               "it here instead, or set INSTAGRAM_COOKIES_PATH on the server to a cookies.txt file.")
        raise RuntimeError(f"Could not download this video: {msg[-300:]}")
    if info and info.get("entries"):
        info = next((e for e in info["entries"] if e), info)  # carousel: first video
    files = [f for f in os.listdir(rdir) if f.startswith("download.")]
    if not files:
        raise RuntimeError("The link did not contain a video (a photo post?). Try a reel or video post.")
    return {"path": os.path.join(rdir, sorted(files)[0]), "title": (info or {}).get("title") or "",
            "uploader": (info or {}).get("uploader") or "", "source_url": url}


def _make_preview(src: str, rdir: str, meta: dict) -> str:
    """A browser-safe preview: the source itself when it is already H.264/AAC MP4, else a fast transcode."""
    safe = (src.lower().endswith(".mp4") and meta["vcodec"] == "h264" and meta["pix_fmt"] in ("yuv420p", "yuvj420p")
            and (not meta["has_audio"] or meta["acodec"] == "aac"))
    if safe:
        return src
    out = os.path.join(rdir, "preview.mp4")
    scale = "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'"
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", src, "-vf", f"{scale},format=yuv420p",
           "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "128k",
           "-movflags", "+faststart", out]
    subprocess.run(cmd, capture_output=True, check=True)
    return out


def _make_filmstrip(src: str, rdir: str, duration: float, frames: int = 24, height: int = 96) -> str:
    out = os.path.join(rdir, "filmstrip.jpg")
    rate = frames / max(duration, 0.1)
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", src,
           "-vf", f"fps={rate:.5f},scale=-2:{height},tile={frames}x1", "-frames:v", "1", "-q:v", "5", out]
    subprocess.run(cmd, capture_output=True, check=True)
    return out


def import_video(rdir: str, url: Optional[str] = None, upload_path: Optional[str] = None) -> dict:
    """Background job: fetch, probe, preview, filmstrip. Progress and result go to reel.json."""
    try:
        if url:
            update_meta(rdir, status="importing", message="Downloading the video...")
            got = download_video(url, rdir)
        elif upload_path:
            ext = os.path.splitext(upload_path)[1].lower() or ".mp4"
            dest = os.path.join(rdir, "download" + ext)
            shutil.move(upload_path, dest)
            name = os.path.splitext(os.path.basename(upload_path))[0]
            name = name[len("_upload_"):] if name.startswith("_upload_") else name
            got = {"path": dest, "title": name.replace("_", " "), "uploader": "", "source_url": ""}
        else:
            raise RuntimeError("Give a link or upload a video")
        update_meta(rdir, message="Reading the video...")
        meta = probe(got["path"])
        if meta["duration"] <= 0.2:
            raise RuntimeError("This video is too short")
        if meta["duration"] > MAX_IMPORT_SECONDS:
            raise RuntimeError("Videos up to 15 minutes are supported")
        update_meta(rdir, message="Preparing the preview...")
        preview = _make_preview(got["path"], rdir, meta)
        try:
            _make_filmstrip(preview, rdir, meta["duration"])
        except Exception as e:
            logger.warning(f"Filmstrip failed: {e}")
        return update_meta(rdir, status="ready", message="Ready", source=os.path.basename(got["path"]),
                           preview=os.path.basename(preview), title=got["title"], uploader=got["uploader"],
                           source_url=got["source_url"], **meta)
    except Exception as e:
        logger.warning(f"Reel import failed: {e}")
        return update_meta(rdir, status="error", message=str(e))


# ---------------------------------------------------------------------------
# song audio
# ---------------------------------------------------------------------------

def song_file(job_dir: str, track: str, for_render: bool = True) -> Optional[str]:
    """Best file on disk for a song track (lossless for rendering)."""
    names = {
        "master": ["master_remastered.wav", "master_remastered.mp3"],
        "clean": ["master_clean.wav", "master_clean.mp3", "master_remastered.wav"],
        "vocal": ["vocal_processed.wav", "converted_vocals.wav", "vocal_processed.mp3"],
        "instrumental": ["accompaniment.wav", "instrumental.wav", "accompaniment.mp3",
                         os.path.join("guide", "accompaniment.wav")],
    }.get(track, [])
    if not for_render:
        names = sorted(names, key=lambda n: not n.endswith(".mp3"))
    for n in names:
        p = os.path.join(job_dir, n)
        if os.path.exists(p) and os.path.getsize(p) > 1000:
            return p
    return None


def probe_audio_duration(path: str) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                         capture_output=True, text=True).stdout.strip()
    try:
        return float(out)
    except ValueError:
        return 0.0


def add_audio(rdir: str, upload_path: str, name: str) -> dict:
    """
    Add your own audio file (another song, a voice-over, a sound effect...) to a reel.
    Kept as a lossless WAV for export and a small MP3 for the editor preview.
    Any format ffmpeg reads works, including the audio track of a video file.
    """
    adir = os.path.join(rdir, "audio")
    os.makedirs(adir, exist_ok=True)
    meta = read_meta(rdir)
    if len(meta.get("audios") or []) >= MAX_AUDIOS:
        raise RuntimeError(f"A reel can hold up to {MAX_AUDIOS} audio files")
    aid = "ext_" + uuid.uuid4().hex[:8]
    wav, mp3 = os.path.join(adir, aid + ".wav"), os.path.join(adir, aid + ".mp3")
    try:
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", upload_path, "-vn", "-map", "0:a:0",
                        "-ac", "2", "-ar", "44100", "-t", str(MAX_AUDIO_SECONDS), wav], capture_output=True, check=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", wav, "-b:a", "192k", mp3], capture_output=True, check=True)
    except subprocess.CalledProcessError:
        for p in (wav, mp3):
            if os.path.exists(p):
                os.remove(p)
        raise RuntimeError("That file has no audio Lyra can read")
    finally:
        if os.path.exists(upload_path):
            os.remove(upload_path)
    duration = probe_audio_duration(wav)
    if duration < 0.2:
        for p in (wav, mp3):
            os.remove(p)
        raise RuntimeError("That audio file is empty")
    clean = re.sub(r"\s+", " ", os.path.splitext(os.path.basename(name or "Audio"))[0]).strip()[:60] or "Audio"
    entry = {"id": aid, "name": clean, "duration": round(duration, 3)}
    meta = read_meta(rdir)
    update_meta(rdir, audios=(meta.get("audios") or []) + [entry])
    return entry


def audio_file(rdir: str, aid: str, for_render: bool = True) -> Optional[str]:
    if not AUDIO_ID_RE.match(aid or ""):
        return None
    if not any(a.get("id") == aid for a in read_meta(rdir).get("audios") or []):
        return None
    p = os.path.join(rdir, "audio", aid + (".wav" if for_render else ".mp3"))
    return p if os.path.exists(p) else None


def remove_audio(rdir: str, aid: str) -> bool:
    meta = read_meta(rdir)
    audios = meta.get("audios") or []
    if not any(a.get("id") == aid for a in audios) or not AUDIO_ID_RE.match(aid):
        return False
    for ext in (".wav", ".mp3"):
        p = os.path.join(rdir, "audio", aid + ext)
        if os.path.exists(p):
            os.remove(p)
    update_meta(rdir, audios=[a for a in audios if a.get("id") != aid])
    return True


def song_peaks(path: str, per_second: int = 50) -> dict:
    """Waveform peaks (0..1) for the editor timeline, decoded with ffmpeg to 8 kHz mono."""
    sr = 8000
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(sr), "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    y = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    hop = sr // per_second
    n = len(y) // hop
    if n == 0:
        return {"duration": 0.0, "per_second": per_second, "peaks": []}
    peaks = np.abs(y[: n * hop]).reshape(n, hop).max(axis=1)
    peaks = peaks / (float(peaks.max()) + 1e-9)
    return {"duration": round(len(y) / sr, 3), "per_second": per_second,
            "peaks": [round(float(p), 3) for p in peaks]}


# ---------------------------------------------------------------------------
# project
# ---------------------------------------------------------------------------

def _f(v, default, lo, hi):
    try:
        v = float(v)
        if math.isnan(v) or math.isinf(v):
            return default
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, v))


def _color(c: str, default: str = "#ffffff") -> str:
    c = str(c or "").strip()
    return c if re.match(r"^#[0-9a-fA-F]{6}$", c) else default


def normalize_project(project: dict, video_duration: float, song_durations: Dict[str, float]) -> dict:
    """Validate and clamp an editor project. Unknown keys are dropped."""
    D = float(video_duration)
    clips = []
    for c in (project.get("clips") or [])[:MAX_CLIPS]:
        a = _f(c.get("in"), 0.0, 0.0, D)
        b = _f(c.get("out"), D, 0.0, D)
        if b - a >= 0.1:
            clips.append({"in": round(a, 3), "out": round(b, 3)})
    if not clips:
        clips = [{"in": 0.0, "out": round(D, 3)}]
    length = sum(c["out"] - c["in"] for c in clips)

    songs = []
    for s in (project.get("songs") or [])[:MAX_CLIPS]:
        track = s.get("track") or "master"
        sd = song_durations.get(track)  # only tracks the server could find (song tracks or your audio files)
        if not sd:
            continue
        a = _f(s.get("in"), 0.0, 0.0, sd)
        b = _f(s.get("out"), sd, 0.0, sd)
        at = _f(s.get("at"), 0.0, -sd, length)
        if at < 0:  # starts before the reel: drop the part that would play before 0
            a, at = a - at, 0.0
        if b - a < 0.05 or at >= length:
            continue
        dur = b - a
        songs.append({"track": track, "in": round(a, 3), "out": round(b, 3), "at": round(at, 3),
                      "volume": _f(s.get("volume"), 1.0, 0.0, 2.0),
                      "fade_in": _f(s.get("fade_in"), 0.0, 0.0, dur / 2),
                      "fade_out": _f(s.get("fade_out"), 0.0, 0.0, dur / 2)})

    video = project.get("video") or {}
    canvas = project.get("canvas") or {}
    adjust = project.get("adjust") or {}
    export = project.get("export") or {}
    texts = []
    for t in (project.get("texts") or [])[:MAX_TEXTS]:
        txt = str(t.get("text") or "").strip()[:200]
        if not txt:
            continue
        st = _f(t.get("start"), 0.0, 0.0, length)
        en = _f(t.get("end"), length, 0.0, length)
        if en - st < 0.05:
            continue
        texts.append({"text": txt, "start": round(st, 3), "end": round(en, 3),
                      "x": _f(t.get("x"), 0.5, 0.0, 1.0), "y": _f(t.get("y"), 0.8, 0.0, 1.0),
                      "size": _f(t.get("size"), 0.05, 0.015, 0.2),
                      "color": _color(t.get("color")), "box": bool(t.get("box", False))})
    return {
        "clips": clips,
        "length": round(length, 3),
        "songs": songs,
        "video": {"volume": _f(video.get("volume"), 0.0, 0.0, 2.0),
                  "fade_in": _f(video.get("fade_in"), 0.0, 0.0, min(5.0, length / 2)),
                  "fade_out": _f(video.get("fade_out"), 0.0, 0.0, min(5.0, length / 2))},
        "canvas": {"aspect": canvas.get("aspect") if canvas.get("aspect") in list(ASPECTS) + ["source"] else "9:16",
                   "fit": canvas.get("fit") if canvas.get("fit") in FITS else "fill",
                   "zoom": _f(canvas.get("zoom"), 1.0, 1.0, 3.0),
                   "pan_x": _f(canvas.get("pan_x"), 0.0, -1.0, 1.0),
                   "pan_y": _f(canvas.get("pan_y"), 0.0, -1.0, 1.0)},
        "adjust": {"brightness": _f(adjust.get("brightness"), 0.0, -0.5, 0.5),
                   "contrast": _f(adjust.get("contrast"), 1.0, 0.5, 2.0),
                   "saturation": _f(adjust.get("saturation"), 1.0, 0.0, 3.0)},
        "texts": texts,
        "export": {"resolution": 720 if int(_f(export.get("resolution"), 1080, 360, 2160)) <= 720 else 1080,
                   "quality": "standard" if export.get("quality") == "standard" else "high"},
    }


def canvas_size(canvas: dict, src_w: int, src_h: int, resolution: int) -> tuple:
    """Output frame size: the short side is `resolution` (1080 / 720), even numbers."""
    if canvas["aspect"] == "source":
        aw, ah = max(src_w, 2), max(src_h, 2)
    else:
        aw, ah = ASPECTS[canvas["aspect"]]
    if aw <= ah:
        w, h = resolution, resolution * ah / aw
    else:
        w, h = resolution * aw / ah, resolution
    return int(round(w / 2) * 2), int(round(h / 2) * 2)


# ---------------------------------------------------------------------------
# rendering
# ---------------------------------------------------------------------------

def _font_file() -> Optional[str]:
    for cand in (os.environ.get("LYRA_REEL_FONT"),
                 "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                 "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
                 "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
                 "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
                 "C:/Windows/Fonts/arialbd.ttf"):
        if cand and os.path.exists(cand):
            return cand
    try:
        p = subprocess.run(["fc-match", "-f", "%{file}", "sans:bold"], capture_output=True, text=True).stdout.strip()
        return p if p and os.path.exists(p) else None
    except Exception:
        return None


def _ff_path(p: str) -> str:
    """Escape a path for use inside an ffmpeg filter argument."""
    return p.replace("\\", "/").replace(":", "\\:").replace("'", "\\'")


def build_command(src: str, src_meta: dict, song_paths: Dict[str, str], project: dict, out_path: str,
                  work_dir: str) -> List[str]:
    """ffmpeg command that renders a normalized project."""
    clips, songs, L = project["clips"], project["songs"], project["length"]
    canvas, adjust, video = project["canvas"], project["adjust"], project["video"]
    W, H = canvas_size(canvas, src_meta["width"], src_meta["height"], project["export"]["resolution"])
    fps = min(60.0, max(24.0, float(src_meta.get("fps") or 30.0)))
    use_orig_audio = src_meta["has_audio"] and video["volume"] > 0.001

    inputs = ["-i", src]
    song_inputs = {}
    for track in sorted({s["track"] for s in songs}):
        song_inputs[track] = len(song_inputs) + 1
        inputs += ["-i", song_paths[track]]

    g = []
    # 1. video clips (and their original audio) back to back
    n = len(clips)
    vsrc, asrc = ["[0:v]"], ["[0:a]"]
    if n > 1:  # an input stream feeds one filter only, so split it per clip
        vsrc = [f"[vs{i}]" for i in range(n)]
        g.append(f"[0:v]split={n}" + "".join(vsrc))
        if use_orig_audio:
            asrc = [f"[as{i}]" for i in range(n)]
            g.append(f"[0:a]asplit={n}" + "".join(asrc))
    for i, c in enumerate(clips):
        g.append(f"{vsrc[min(i, len(vsrc) - 1)]}trim=start={c['in']}:end={c['out']},setpts=PTS-STARTPTS[v{i}]")
        if use_orig_audio:
            g.append(f"{asrc[min(i, len(asrc) - 1)]}atrim=start={c['in']}:end={c['out']},asetpts=PTS-STARTPTS[oa{i}]")
    if use_orig_audio:
        g.append("".join(f"[v{i}][oa{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=1[vcat][ocat]")
    else:
        g.append("".join(f"[v{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=0[vcat]")

    # 2. frame: fill (crop), fit (bars) or blur (blurred copy behind)
    fit = canvas["fit"]
    if fit == "fill":
        z = canvas["zoom"]
        zw, zh = int(round(W * z / 2) * 2), int(round(H * z / 2) * 2)
        px, py = 0.5 + canvas["pan_x"] / 2, 0.5 + canvas["pan_y"] / 2
        g.append(f"[vcat]scale={zw}:{zh}:force_original_aspect_ratio=increase,"
                 f"crop={W}:{H}:(iw-{W})*{px:.4f}:(ih-{H})*{py:.4f}[vfr]")
    elif fit == "fit":
        g.append(f"[vcat]scale={W}:{H}:force_original_aspect_ratio=decrease,"
                 f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=black[vfr]")
    else:
        g.append("[vcat]split[vb][vf]")
        g.append(f"[vb]scale={W // 4}:{H // 4}:force_original_aspect_ratio=increase,crop={W // 4}:{H // 4},"
                 f"gblur=sigma=12,scale={W}:{H},eq=brightness=-0.08[vbg]")
        g.append(f"[vf]scale={W}:{H}:force_original_aspect_ratio=decrease[vfg]")
        g.append("[vbg][vfg]overlay=(W-w)/2:(H-h)/2[vfr]")

    # 3. colour, fades, text
    chain = [f"fps={fps:.3f}", "setsar=1"]
    if abs(adjust["brightness"]) > 1e-3 or abs(adjust["contrast"] - 1) > 1e-3 or abs(adjust["saturation"] - 1) > 1e-3:
        chain.append(f"eq=brightness={adjust['brightness']:.3f}:contrast={adjust['contrast']:.3f}"
                     f":saturation={adjust['saturation']:.3f}")
    if video["fade_in"] > 0.01:
        chain.append(f"fade=t=in:st=0:d={video['fade_in']:.3f}")
    if video["fade_out"] > 0.01:
        chain.append(f"fade=t=out:st={max(0.0, L - video['fade_out']):.3f}:d={video['fade_out']:.3f}")
    font = _font_file()
    for k, t in enumerate(project["texts"]):
        tf = os.path.join(work_dir, f"text_{k}.txt")
        with open(tf, "w", encoding="utf-8") as f:
            f.write(t["text"])
        size = max(8, int(round(H * t["size"])))
        opts = [f"textfile='{_ff_path(tf)}'", f"fontsize={size}", f"fontcolor={t['color']}",
                f"x=(w*{t['x']:.4f})-text_w/2", f"y=(h*{t['y']:.4f})-text_h/2",
                f"enable='between(t,{t['start']:.3f},{t['end']:.3f})'",
                f"borderw={max(1, size // 18)}", "bordercolor=black@0.55", "line_spacing=6"]
        if font:
            opts.insert(0, f"fontfile='{_ff_path(font)}'")
        if t["box"]:
            opts += ["box=1", "boxcolor=black@0.55", f"boxborderw={max(4, size // 3)}"]
        chain.append("drawtext=" + ":".join(opts))
    chain.append("format=yuv420p")
    g.append("[vfr]" + ",".join(chain) + "[vout]")

    # 4. audio: original (if not muted) + song pieces, placed on the timeline
    mix = []
    if use_orig_audio:
        g.append(f"[ocat]aresample=48000,volume={video['volume']:.3f}[orig]")
        mix.append("[orig]")
    track_uses = {}
    for s in songs:
        track_uses.setdefault(s["track"], []).append(s)
    for track, pieces in track_uses.items():
        idx = song_inputs[track]
        labels = [f"[{track}_{j}]" for j in range(len(pieces))]
        if len(pieces) > 1:
            g.append(f"[{idx}:a]asplit={len(pieces)}" + "".join(labels))
        else:
            labels = [f"[{idx}:a]"]
        for j, (s, lab) in enumerate(zip(pieces, labels)):
            dur = s["out"] - s["in"]
            ch = [f"atrim=start={s['in']}:end={s['out']}", "asetpts=PTS-STARTPTS", "aresample=48000"]
            if s["fade_in"] > 0.005:
                ch.append(f"afade=t=in:st=0:d={s['fade_in']:.3f}")
            if s["fade_out"] > 0.005:
                ch.append(f"afade=t=out:st={max(0.0, dur - s['fade_out']):.3f}:d={s['fade_out']:.3f}")
            ch.append(f"volume={s['volume']:.3f}")
            if s["at"] > 0.0005:
                ch.append(f"adelay=delays={int(round(s['at'] * 1000))}:all=1")
            out_lab = f"[s_{track}_{j}]"
            g.append(lab + ",".join(ch) + out_lab)
            mix.append(out_lab)
    if mix:
        if len(mix) > 1:
            g.append("".join(mix) + f"amix=inputs={len(mix)}:normalize=0:duration=longest:dropout_transition=0[amx]")
            last = "[amx]"
        else:
            last = mix[0]
        g.append(f"{last}alimiter=limit=0.95:level=false,apad,atrim=end={L:.3f}[aout]")
    else:
        g.append(f"anullsrc=r=48000:cl=stereo,atrim=end={L:.3f}[aout]")

    high = project["export"]["quality"] == "high"
    graph_path = os.path.join(work_dir, "graph.txt")
    with open(graph_path, "w", encoding="utf-8") as f:
        f.write(";\n".join(g))
    return ["ffmpeg", "-y", "-v", "error", "-nostats", "-progress", "pipe:1", *inputs,
            "-filter_complex_script", graph_path, "-map", "[vout]", "-map", "[aout]",
            "-c:v", "libx264", "-preset", "medium" if high else "veryfast", "-crf", "18" if high else "22",
            "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", f"{fps:.3f}",
            "-c:a", "aac", "-b:a", "256k" if high else "192k", "-ar", "48000", "-ac", "2",
            "-t", f"{L:.3f}", "-movflags", "+faststart", out_path]


def start_render(rdir: str, project: dict, song_paths: Dict[str, str],
                 on_done: Optional[Callable[[dict], None]] = None) -> dict:
    """Render in a background thread. Returns the render status right away."""
    meta = read_meta(rdir)
    if meta.get("status") != "ready":
        raise RuntimeError("The video is not ready yet")
    if (meta.get("render") or {}).get("status") == "rendering":
        raise RuntimeError("A render is already running for this reel")
    src = os.path.join(rdir, meta["source"])
    work = os.path.join(rdir, "_render")
    shutil.rmtree(work, ignore_errors=True)
    os.makedirs(work, exist_ok=True)
    out_tmp = os.path.join(work, "reel.mp4")
    cmd = build_command(src, meta, song_paths, project, out_tmp, work)
    with open(os.path.join(rdir, "project.json"), "w") as f:
        json.dump(project, f, indent=2)
    status = {"status": "rendering", "progress": 0, "message": "Rendering your reel...", "started_at": time.time()}
    update_meta(rdir, render=status)

    def run():
        reel_id = meta["id"]
        try:
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            with _LOCK:
                _RENDERS[reel_id] = proc
            L = max(project["length"], 0.1)
            last = 0
            for line in proc.stdout:
                if line.startswith("out_time_us=") or line.startswith("out_time_ms="):
                    try:
                        t = int(line.split("=", 1)[1]) / 1e6
                    except ValueError:
                        continue
                    pct = int(max(0, min(99, t / L * 100)))
                    if pct >= last + 2:
                        last = pct
                        update_meta(rdir, render={**status, "progress": pct})
            err = proc.stderr.read()
            rc = proc.wait()
            with _LOCK:
                _RENDERS.pop(reel_id, None)
            if rc != 0 or not os.path.exists(out_tmp):
                cancelled = (read_meta(rdir).get("render") or {}).get("status") == "cancelled"
                if cancelled:
                    return
                raise RuntimeError(err.strip()[-600:] or f"ffmpeg exited with {rc}")
            final = os.path.join(rdir, "reel.mp4")
            os.replace(out_tmp, final)
            done = {"status": "done", "progress": 100, "message": "Your reel is ready",
                    "finished_at": time.time(), "file": "reel.mp4", "length": project["length"]}
            update_meta(rdir, render=done)
            if on_done:
                on_done(done)
        except Exception as e:
            logger.error(f"Reel render failed: {e}")
            update_meta(rdir, render={"status": "error", "progress": 0, "message": f"Render failed: {e}"})
        finally:
            shutil.rmtree(work, ignore_errors=True)

    threading.Thread(target=run, daemon=True).start()
    return status


def cancel_render(rdir: str) -> bool:
    meta = read_meta(rdir)
    with _LOCK:
        proc = _RENDERS.get(meta.get("id"))
    if not proc:
        return False
    update_meta(rdir, render={"status": "cancelled", "progress": 0, "message": "Render cancelled"})
    proc.terminate()
    return True
