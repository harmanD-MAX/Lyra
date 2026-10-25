#!/usr/bin/env bash
# ============================================================
# 🎵 Lyra 1-Click Colab Launcher with Permanent Domain
# Permanent URL: https://lyra-studio.loca.lt
# ============================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo " Preparing Lyra Studio on Google Colab..."

# 1. Ensure backend dependencies are installed
pip install -r backend/requirements.txt --quiet

# 2. Ensure localtunnel is installed
if ! command -v lt &> /dev/null; then
  echo "Installing LocalTunnel..."
  npm install -g localtunnel > /dev/null 2>&1 || true
fi

# 3. Retrieve gateway password (server external IP)
TUNNEL_PASS=$(curl -s https://loca.lt/mytunnelpassword 2>/dev/null || curl -s https://ipv4.icanhazip.com 2>/dev/null || echo "Check Colab IP")

# Accounts: the Cloudflare D1 token is a secret, so it comes from Colab Secrets, never the repo
if [ -z "${CF_API_TOKEN:-}" ]; then
  echo "⚠️  CF_API_TOKEN is not set: Google login and My Songs accounts are off."
  echo "    In a notebook cell first run:"
  echo "      import os; from google.colab import userdata"
  echo "      os.environ['CF_API_TOKEN'] = userdata.get('CF_API_TOKEN')"
  echo "      os.environ['LYRA_SESSION_SECRET'] = userdata.get('LYRA_SESSION_SECRET')"
fi

# 4. Set CUDA performance & OOM prevention environment variables
export PYTORCH_CUDA_ALLOC_CONF="expandable_segments:True"
export RVC_CUDA_GRAPH="0"

# Auto-detect Google Drive if mounted
if [ -d "/content/drive/MyDrive" ]; then
  if [ -d "/content/drive/MyDrive/ysra-songs" ]; then
    DRIVE_DIR="/content/drive/MyDrive/ysra-songs"
  else
    DRIVE_DIR="/content/drive/MyDrive/lyra-songs"
  fi
  mkdir -p "$DRIVE_DIR"
  echo "📁 Google Drive detected! Saving all songs to: $DRIVE_DIR"
  export LYRA_OUTPUTS_DIR="$DRIVE_DIR"
  export LYRA_JOBS_FILE="$DRIVE_DIR/jobs_db.json"
fi

# 5. Launch Lyra backend in the background
cd "$ROOT_DIR/backend"
python3 -m uvicorn app:app --host 0.0.0.0 --port 8000 &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  kill "$LT_PID" 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# 6. Wait for backend server to be fully ready before opening tunnel
echo "⏳ Waiting for Lyra backend to initialize..."
for i in {1..30}; do
  if curl -s http://127.0.0.1:8000/api/info >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# 7. Start localtunnel and detect the actual assigned URL
rm -f /tmp/lt.log
lt --port 8000 --subdomain lyra-studio > /tmp/lt.log 2>&1 &
LT_PID=$!

# Wait for localtunnel to assign URL
ACTUAL_URL=""
for i in {1..15}; do
  if grep -q "your url is:" /tmp/lt.log 2>/dev/null; then
    ACTUAL_URL=$(grep "your url is:" /tmp/lt.log | awk '{print $NF}' | tr -d '\r\n')
    break
  fi
  sleep 1
done

if [ -z "$ACTUAL_URL" ]; then
  ACTUAL_URL="https://lyra-studio.loca.lt"
fi

echo ""
echo "============================================================"
echo " 🚀 LYRA STUDIO IS LIVE & READY!"
echo " 👉 CLICK THIS LINK TO OPEN: $ACTUAL_URL"
echo " 🔑 ONE-TIME PASSWORD (if prompted): $TUNNEL_PASS"
echo "============================================================"
echo ""

# Follow the tunnel log in foreground
wait $SERVER_PID
