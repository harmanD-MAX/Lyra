import os
import json
import time
import uuid
import threading
from typing import Dict, Any, Optional

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DRIVE_BASE = "/content/drive/MyDrive"
if os.path.isdir(DRIVE_BASE):
    if os.path.isdir(os.path.join(DRIVE_BASE, "ysra-songs")):
        DEFAULT_OUTPUTS_DIR = os.path.join(DRIVE_BASE, "ysra-songs")
    else:
        DEFAULT_OUTPUTS_DIR = os.path.join(DRIVE_BASE, "lyra-songs")
    os.makedirs(DEFAULT_OUTPUTS_DIR, exist_ok=True)
    DEFAULT_JOBS_FILE = os.path.join(DEFAULT_OUTPUTS_DIR, "jobs_db.json")
else:
    DEFAULT_OUTPUTS_DIR = os.path.join(BASE_DIR, "outputs")
    DEFAULT_JOBS_FILE = os.path.join(BASE_DIR, "jobs_db.json")

JOBS_FILE = os.environ.get("LYRA_JOBS_FILE", DEFAULT_JOBS_FILE)

class JobManager:
    def __init__(self):
        self._jobs: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()
        self._load()

    def _load(self):
        if os.path.exists(JOBS_FILE):
            try:
                with open(JOBS_FILE, "r") as f:
                    self._jobs = json.load(f)
            except Exception:
                self._jobs = {}

    def _save(self):
        try:
            with open(JOBS_FILE, "w") as f:
                json.dump(self._jobs, f, indent=2)
        except Exception:
            pass

    def create_job(self, metadata: Optional[Dict[str, Any]] = None) -> str:
        job_id = str(uuid.uuid4())[:12]
        with self._lock:
            self._jobs[job_id] = {
                "id": job_id,
                "status": "queued", # queued, processing, completed, error
                "progress": 0,
                "message": "Job queued for processing...",
                "created_at": time.time(),
                "updated_at": time.time(),
                "metadata": metadata or {},
                "results": None,
                "error": None,
                "logs": [f"[{time.strftime('%H:%M:%S')}] Job initialized"]
            }
            self._save()
        return job_id

    def update_job(self, job_id: str, progress: int = None, message: str = None, status: str = None, results: Any = None, error: str = None):
        with self._lock:
            if job_id not in self._jobs:
                return
            job = self._jobs[job_id]
            job["updated_at"] = time.time()
            if progress is not None:
                job["progress"] = min(100, max(0, progress))
            if message:
                job["message"] = message
                job["logs"].append(f"[{time.strftime('%H:%M:%S')}] {message}")
            if status:
                job["status"] = status
            if results is not None:
                job["results"] = results
            if error:
                job["error"] = error
                job["status"] = "error"
                job["logs"].append(f"[{time.strftime('%H:%M:%S')}] ERROR: {error}")
            self._save()

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            if job_id in self._jobs:
                return dict(self._jobs[job_id])
            return None

    def delete_job(self, job_id: str) -> bool:
        with self._lock:
            if job_id in self._jobs:
                del self._jobs[job_id]
                self._save()
                return True
            return False

    def sync_cloud_catalog(self):
        try:
            import r2_storage
            cloud_jobs = r2_storage.get_cloud_catalog()
            if cloud_jobs and isinstance(cloud_jobs, dict):
                with self._lock:
                    updated = False
                    for jid, jdata in cloud_jobs.items():
                        if jid not in self._jobs or not self._jobs[jid].get("results", {}).get("saved_to_cloud"):
                            self._jobs[jid] = jdata
                            updated = True
                    if updated:
                        self._save()
        except Exception:
            pass

    def list_jobs(self, limit: int = 20, completed_only: bool = True, cloud_only: bool = True) -> list:
        self.sync_cloud_catalog()
        with self._lock:
            outputs_dir = os.environ.get("LYRA_OUTPUTS_DIR", DEFAULT_OUTPUTS_DIR)
            valid_jobs = []
            for j in self._jobs.values():
                if completed_only and j.get("status") != "completed":
                    continue
                res = j.get("results") or {}
                is_cloud = bool(res.get("saved_to_cloud") or res.get("cloud_master_3d_url") or j.get("saved_to_cloud"))
                if cloud_only and not is_cloud:
                    continue
                jid = j.get("id")
                if jid:
                    j_dir = os.path.join(outputs_dir, jid)
                    if not is_cloud and not os.path.exists(j_dir):
                        continue
                valid_jobs.append(j)
            sorted_jobs = sorted(valid_jobs, key=lambda x: x.get("created_at", 0), reverse=True)
            return sorted_jobs[:limit]

job_manager = JobManager()
