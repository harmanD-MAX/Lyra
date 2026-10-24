#!/usr/bin/env bash
# Run Lyra on a small machine (e.g. a Mac with little free disk / RAM):
#   - small separation models (~0.6 GB), half the CPU cores, low priority
#   - one process: the backend also serves the built frontend
#   - open http://127.0.0.1:8000
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d frontend/dist ] || [ -n "$(find frontend/src -newer frontend/dist -print -quit 2>/dev/null)" ]; then
  echo "Building the frontend once..."
  (cd frontend && npm install --silent && npm run build --silent)
fi

export LYRA_PROFILE=lite
export PYTORCH_ENABLE_MPS_FALLBACK=1
export PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.0
cd backend
echo "Lyra (lite) → http://127.0.0.1:8000"
PYTHON="${PYTHON:-python3}"
exec "$PYTHON" -m uvicorn app:app --host 127.0.0.1 --port 8000
