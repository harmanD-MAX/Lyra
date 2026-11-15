"""
Lyra download helper: downloads songs and videos on this computer for Lyra.

YouTube (and Instagram) block downloads from cloud servers such as Colab, but
not from home internet. While this window is open, the Spotify / YouTube /
Instagram links you paste into Lyra are downloaded here and sent to your Lyra
server, which does the conversion.

Start it with start-helper.bat (Windows) or start-helper.command (Mac), which
install what it needs. Settings are in config.json next to this file:
    server   your Lyra address (change it if your Colab address changes)
    token    the private key that lets this helper talk to your Lyra

    python lyra_helper.py [--server https://your-lyra-address]
"""

import argparse
import json
import mimetypes
import os
import platform
import shutil
import socket
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
VERSION = "1.0"
POLL_WAIT = 25


def say(msg: str):
    print(time.strftime("%H:%M:%S"), msg, flush=True)


def load_config(args) -> dict:
    path = os.path.join(HERE, "config.json")
    cfg = {}
    if os.path.exists(path):
        with open(path) as f:
            cfg = json.load(f)
    if args.server:
        cfg["server"] = args.server.rstrip("/")
        with open(path, "w") as f:
            json.dump(cfg, f, indent=2)
    if not cfg.get("server") or not cfg.get("token"):
        sys.exit("config.json is missing. Download the helper again from Lyra (it includes your key).")
    return cfg


def js_runtime() -> dict:
    """yt-dlp needs a JavaScript runtime for YouTube; use Deno or Node if installed."""
    for name in ("deno", "node"):
        path = shutil.which(name)
        if path:
            return {name: {"path": path}}
    return {}


class Lyra:
    def __init__(self, server: str, token: str):
        self.server = server.rstrip("/")
        self.headers = {
            "Authorization": f"Bearer {token}",
            "User-Agent": f"LyraHelper/{VERSION}",
            "bypass-tunnel-reminder": "1",          # localtunnel: skip its browser page
            "X-Helper-Name": socket.gethostname()[:60],
            "X-Helper-Version": VERSION,
            "X-Helper-Platform": f"{platform.system()} {platform.release()}"[:60],
            "X-Helper-JS": ",".join(js_runtime()) or "none",
        }

    def _call(self, method: str, path: str, data: bytes = None, content_type: str = None, timeout: float = 60):
        headers = dict(self.headers)
        if content_type:
            headers["Content-Type"] = content_type
        req = urllib.request.Request(self.server + path, data=data, method=method, headers=headers)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read()
            return json.loads(body) if body else {}

    def poll(self) -> dict:
        return self._call("GET", f"/api/helper/poll?wait={POLL_WAIT}", timeout=POLL_WAIT + 20).get("task")

    def progress(self, tid: str, message: str, pct: int = None):
        try:
            body = json.dumps({"message": message, "pct": pct}).encode()
            self._call("POST", f"/api/helper/tasks/{tid}/progress", body, "application/json", timeout=20)
        except Exception:
            pass  # progress is best effort

    def fail(self, tid: str, message: str):
        body = json.dumps({"message": message}).encode()
        self._call("POST", f"/api/helper/tasks/{tid}/error", body, "application/json", timeout=30)

    def send_file(self, tid: str, path: str, meta: dict):
        boundary = "----lyra" + uuid.uuid4().hex
        name = os.path.basename(path)
        ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
        with open(path, "rb") as f:
            data = f.read()
        parts = [
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"meta\"\r\n\r\n{json.dumps(meta)}\r\n".encode(),
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\n"
            f"Content-Type: {ctype}\r\n\r\n".encode(), data, f"\r\n--{boundary}--\r\n".encode(),
        ]
        self._call("POST", f"/api/helper/tasks/{tid}/result", b"".join(parts),
                   f"multipart/form-data; boundary={boundary}", timeout=600)


def ydl_opts(out_dir: str, fmt: str, hook) -> dict:
    opts = {
        "format": fmt,
        "outtmpl": os.path.join(out_dir, "download.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "retries": 5,
        "fragment_retries": 5,
        "socket_timeout": 25,
        "progress_hooks": [hook],
    }
    js = js_runtime()
    if js:
        opts["js_runtimes"] = js
    return opts


def handle(lyra: Lyra, task: dict):
    import yt_dlp
    import song_source

    tid, kind = task["id"], task.get("kind")
    out_dir = tempfile.mkdtemp(prefix="lyra_helper_")
    last = {"pct": -10}

    def hook(d):
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            pct = int(d.get("downloaded_bytes", 0) * 100 / total) if total else 0
            if pct >= last["pct"] + 20:
                last["pct"] = pct
                say(f"  {pct}%")
                lyra.progress(tid, f"downloading {pct}%", 12 + pct // 10)

    try:
        if kind == "song":
            name = f"{task.get('artist')} - {task.get('title')}" if task.get("artist") else task.get("title")
            say(f"Finding '{name}'...")
            lyra.progress(tid, "finding the song", 12)
            base = {"quiet": True, "no_warnings": True, "socket_timeout": 25, **({"js_runtimes": js_runtime()} if js_runtime() else {})}
            info = song_source.download_song(task.get("title") or "", task.get("artist") or "", float(task.get("duration") or 0),
                                             base, ydl_opts(out_dir, "bestaudio/best", hook), log=say)
        else:
            url = task.get("url") or ""
            say(f"Downloading {url}")
            lyra.progress(tid, "downloading", 12)
            fmt = "b[ext=mp4]/bv*[ext=mp4]+ba[ext=m4a]/b" if kind == "video" else "bestaudio/best"
            if kind == "video" and not shutil.which("ffmpeg"):
                fmt = "b[ext=mp4]/b"  # a single file needs no ffmpeg to merge
            with yt_dlp.YoutubeDL(ydl_opts(out_dir, fmt, hook)) as ydl:
                info = ydl.extract_info(url, download=True)
            if info and info.get("entries"):
                info = next((e for e in info["entries"] if e), info)
        files = [os.path.join(out_dir, f) for f in os.listdir(out_dir) if f.startswith("download.")
                 and not f.endswith((".part", ".ytdl"))]
        if not files:
            raise RuntimeError("Nothing was downloaded (is it a photo post, or private?)")
        path = max(files, key=os.path.getsize)
        meta = {k: (info or {}).get(k) for k in ("title", "uploader", "duration", "thumbnail", "source", "matched_title")}
        mb = os.path.getsize(path) / 1e6
        say(f"Sending {mb:.1f} MB to Lyra...")
        lyra.progress(tid, f"sending {mb:.1f} MB to Lyra", 20)
        lyra.send_file(tid, path, meta)
        say("Done.")
    except Exception as e:
        msg = str(e).replace("ERROR: ", "").strip().splitlines()[0][:400] if str(e) else e.__class__.__name__
        say(f"Could not download: {msg}")
        try:
            lyra.fail(tid, msg)
        except Exception:
            pass
    finally:
        shutil.rmtree(out_dir, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser(description="Lyra download helper")
    ap.add_argument("--server", help="your Lyra address, e.g. https://lyra-studio.loca.lt")
    args = ap.parse_args()
    cfg = load_config(args)
    sys.path.insert(0, HERE)
    try:
        import yt_dlp  # noqa: F401
    except ImportError:
        sys.exit("yt-dlp is not installed. Start the helper with start-helper.bat / start-helper.command.")
    lyra = Lyra(cfg["server"], cfg["token"])

    print()
    print("  Lyra download helper")
    print(f"  Connected to {lyra.server}")
    print("  Keep this window open while you use Lyra. Close it to stop.")
    if not js_runtime():
        print("\n  Tip: install Deno (https://deno.com) so YouTube downloads work reliably.")
    print()

    online, backoff = False, 3
    while True:
        try:
            task = lyra.poll()
            if not online:
                say("Ready. Links you paste into Lyra will download here.")
                online, backoff = True, 3
            if task:
                handle(lyra, task)
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                sys.exit("\nLyra did not accept this helper's key (it was reset). Download the helper again from Lyra.")
            say(f"Lyra answered {e.code}; retrying...")
            online = False
            time.sleep(backoff)
            backoff = min(60, backoff * 2)
        except (urllib.error.URLError, socket.timeout, ConnectionError, TimeoutError) as e:
            if online or backoff == 3:
                say(f"Can't reach Lyra at {lyra.server} ({getattr(e, 'reason', e)}). Is it running? "
                    "If its address changed, run: start-helper --server NEW_ADDRESS")
            online = False
            time.sleep(backoff)
            backoff = min(60, backoff * 2)
        except KeyboardInterrupt:
            print("\nStopped.")
            return


if __name__ == "__main__":
    main()
