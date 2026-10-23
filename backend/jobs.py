import os
import json
import time
import uuid
import threading
from typing import Dict, Any, Optional

JOBS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "jobs_db.json")

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

    def list_jobs(self, limit: int = 20, completed_only: bool = True) -> list:
        with self._lock:
            outputs_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "outputs")
            valid_jobs = []
            for j in self._jobs.values():
                if completed_only and j.get("status") != "completed":
                    continue
                jid = j.get("id")
                if jid:
                    j_dir = os.path.join(outputs_dir, jid)
                    if not os.path.exists(j_dir):
                        continue
                valid_jobs.append(j)
            sorted_jobs = sorted(valid_jobs, key=lambda x: x.get("created_at", 0), reverse=True)
            return sorted_jobs[:limit]

job_manager = JobManager()
