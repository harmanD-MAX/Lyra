#!/usr/bin/env bash
# ============================================================
# 🎵 Lyra 1-Click Colab Launcher with Permanent Domain
# Permanent URL: https://lyra-studio.loca.lt
# ============================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "🎵 Preparing Lyra Studio on Google Colab..."

# 1. Ensure backend dependencies are installed
pip install -r backend/requirements.txt --quiet

# 2. Ensure localtunnel is installed
if ! command -v lt &> /dev/null; then
  echo "Installing LocalTunnel..."
  npm install -g localtunnel > /dev/null 2>&1 || true
fi

# 3. Retrieve gateway password (server external IP)
TUNNEL_PASS=$(curl -s https://loca.lt/mytunnelpassword 2>/dev/null || curl -s https://ipv4.icanhazip.com 2>/dev/null || echo "Check Colab IP")

# 4. Set CUDA performance & OOM prevention environment variables
export PYTORCH_CUDA_ALLOC_CONF="expandable_segments:True"
export RVC_CUDA_GRAPH="0"

# 5. Launch Lyra backend in the background
cd "$ROOT_DIR/backend"
python3 -m uvicorn app:app --host 0.0.0.0 --port 8000 &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# 6. Wait for server to initialize
sleep 2

echo ""
echo "============================================================"
echo "🚀 LYRA STUDIO IS READY!"
echo "👉 PERMANENT URL: https://lyra-studio.loca.lt"
echo "🔑 ONE-TIME PASSWORD (if prompted): $TUNNEL_PASS"
echo "============================================================"
echo ""

# 7. Bind to the permanent subdomain lyra-studio
exec lt --port 8000 --subdomain lyra-studio
