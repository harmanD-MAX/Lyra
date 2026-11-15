"""
Lyra download helper: downloads happen on your own computer, conversion on the server.

YouTube treats cloud servers (Colab, Kaggle) as bots and blocks their downloads
("sign in to confirm you're not a bot"); Instagram does the same. Home internet
connections are not blocked. So when the helper (backend/helper/lyra_helper.py)
runs on your computer, Lyra hands it the downloads:

    server                                   your computer (helper)
    ------                                   ----------------------
    request()  -> task queued        <-----  poll()  (long-poll every ~25 s)
               <- progress messages   -----  downloads with yt-dlp at home
    returns the file                 <-----  result() uploads the audio / video

The helper authenticates with a private key (a random token stored on the
server, on Google Drive when mounted, and in the helper's config.json). Anyone
without it can neither take tasks nor send files.
"""

import hmac
import io
import json
import logging
import os
import secrets
import threading
import time
import uuid
import zipfile
from typing import Callable, Optional

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
HELPER_DIR = os.path.join(BASE_DIR, "helper")
ONLINE_SECONDS = 45          # the helper polls at least every ~25 s
PICKUP_SECONDS = 60          # a queued task the helper does not take in time fails
HELPER_VERSION = "1.0"


class HelperError(RuntimeError):
    pass


def _secrets_dir() -> str:
    d = os.environ.get("LYRA_SECRETS_DIR")
    if not d:
        drive = "/content/drive/MyDrive"
        d = os.path.join(drive, ".lyra") if os.path.isdir(drive) else os.path.join(BASE_DIR, "data")
    os.makedirs(d, exist_ok=True)
    return d


class Bridge:
    def __init__(self):
        self._cond = threading.Condition()
        self._tasks = {}
        self._queue = []
        self.last_seen = 0.0
        self.info = {}
        self._token = None

    # ---- key ----------------------------------------------------------------
    def _token_path(self) -> str:
        return os.path.join(_secrets_dir(), "helper_token.txt")

    def token(self) -> str:
        if self._token:
            return self._token
        p = self._token_path()
        if os.path.exists(p):
            with open(p) as f:
                self._token = f.read().strip()
        if not self._token:
            self.reset_token()
        return self._token

    def reset_token(self) -> str:
        self._token = secrets.token_urlsafe(32)
        p = self._token_path()
        fd = os.open(p + ".tmp", os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(self._token)
        os.replace(p + ".tmp", p)
        self.last_seen = 0.0
        return self._token

    def check(self, presented: str) -> bool:
        return bool(presented) and hmac.compare_digest(presented.encode(), self.token().encode())

    # ---- status -------------------------------------------------------------
    def is_online(self) -> bool:
        return time.time() - self.last_seen < ONLINE_SECONDS

    def status(self) -> dict:
        return {"online": self.is_online(), "last_seen": self.last_seen or None, "helper": self.info or None}

    def seen(self, info: dict):
        self.last_seen = time.time()
        if info:
            self.info = {k: str(v)[:80] for k, v in info.items() if v}

    # ---- server side: ask the helper for a download -------------------------
    def request(self, payload: dict, save_dir: str, progress: Optional[Callable[[int, str], None]] = None,
                timeout: float = 900.0) -> dict:
        """
        Queue a download for the helper and wait for it. payload: {"kind": "song" | "url" | "video", ...}.
        Returns {"path", "meta"}; raises HelperError with a plain message on failure.
        """
        tid = uuid.uuid4().hex[:12]
        task = {"id": tid, "payload": payload, "state": "queued", "created": time.time(),
                "save_dir": save_dir, "message": "", "result": None, "error": None, "claimed": None}
        with self._cond:
            self._tasks[tid] = task
            self._queue.append(tid)
            self._cond.notify_all()
        last_msg = ""
        try:
            with self._cond:
                while True:
                    now = time.time()
                    if task["state"] == "done":
                        return task["result"]
                    if task["state"] == "error":
                        raise HelperError(task["error"] or "The download helper could not get this file.")
                    if task["state"] == "queued" and now - task["created"] > PICKUP_SECONDS:
                        raise HelperError("Your computer's download helper didn't respond. Check that its window "
                                          "is still open, then try again.")
                    if now - task["created"] > timeout:
                        raise HelperError("The download on your computer took too long.")
                    if progress and task["message"] and task["message"] != last_msg:
                        last_msg = task["message"]
                        progress(task.get("pct") or 15, f"Your computer: {last_msg}")
                    self._cond.wait(timeout=1.0)
        finally:
            with self._cond:
                self._tasks.pop(tid, None)
                if tid in self._queue:
                    self._queue.remove(tid)

    # ---- helper side ------------------------------------------------------------
    def poll(self, wait: float, info: dict) -> Optional[dict]:
        """Long-poll: the next queued task (claimed for this helper), or None after `wait` seconds."""
        self.seen(info)
        end = time.time() + max(0.0, min(wait, 30.0))
        with self._cond:
            while True:
                while self._queue:
                    tid = self._queue.pop(0)
                    task = self._tasks.get(tid)
                    if task and task["state"] == "queued":
                        task["state"] = "working"
                        task["claimed"] = time.time()
                        self._cond.notify_all()
                        return {"id": tid, **task["payload"]}
                left = end - time.time()
                if left <= 0:
                    self.seen(info)
                    return None
                self._cond.wait(timeout=min(left, 5.0))
                self.seen(info)

    def _task(self, tid: str) -> dict:
        task = self._tasks.get(tid)
        if not task or task["state"] != "working":
            raise KeyError(tid)
        return task

    def progress(self, tid: str, message: str, pct: Optional[int] = None):
        with self._cond:
            task = self._task(tid)
            task["message"] = str(message)[:200]
            if pct is not None:
                task["pct"] = int(pct)
            self.last_seen = time.time()
            self._cond.notify_all()

    def save_dir(self, tid: str) -> str:
        with self._cond:
            return self._task(tid)["save_dir"]

    def finish(self, tid: str, path: str, meta: dict):
        with self._cond:
            task = self._task(tid)
            task["result"] = {"path": path, "meta": meta or {}}
            task["state"] = "done"
            self._cond.notify_all()

    def fail(self, tid: str, message: str):
        with self._cond:
            task = self._task(tid)
            task["error"] = str(message)[:500]
            task["state"] = "error"
            self._cond.notify_all()

    # ---- the helper package -----------------------------------------------------
    def package(self, server_url: str) -> bytes:
        """A zip with the helper, its start scripts and a config.json holding this server's address and key."""
        files = {
            "lyra_helper.py": os.path.join(HELPER_DIR, "lyra_helper.py"),
            "song_source.py": os.path.join(BASE_DIR, "song_source.py"),
            "start-helper.bat": os.path.join(HELPER_DIR, "start-helper.bat"),
            "start-helper.command": os.path.join(HELPER_DIR, "start-helper.sh"),
            "start-helper.sh": os.path.join(HELPER_DIR, "start-helper.sh"),
            "README.txt": os.path.join(HELPER_DIR, "README.txt"),
        }
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            for name, src in files.items():
                with open(src, "rb") as f:
                    data = f.read()
                zi = zipfile.ZipInfo(f"Lyra Helper/{name}", date_time=time.localtime()[:6])
                zi.compress_type = zipfile.ZIP_DEFLATED
                executable = name.endswith((".sh", ".command"))
                zi.external_attr = ((0o755 if executable else 0o644) | 0o100000) << 16
                z.writestr(zi, data)
            cfg = {"server": server_url.rstrip("/"), "token": self.token(), "version": HELPER_VERSION}
            zi = zipfile.ZipInfo("Lyra Helper/config.json", date_time=time.localtime()[:6])
            zi.external_attr = (0o600 | 0o100000) << 16
            z.writestr(zi, json.dumps(cfg, indent=2))
        return buf.getvalue()


BRIDGE = Bridge()
