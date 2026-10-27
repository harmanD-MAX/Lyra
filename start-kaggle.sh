#!/usr/bin/env bash
# ============================================================
# 🎵 Lyra launcher for Kaggle Notebooks (free GPU)
# Default address: https://lyra-studio.loca.lt (same fixed URL as Colab).
# Set LYRA_TUNNEL=cloudflare for a Cloudflare quick tunnel instead
# (steadier, but https://<random>.trycloudflare.com changes each session).
#
# Notebook settings: Accelerator = GPU T4 x2, Internet = On.
# Secrets come from the environment (see README → Kaggle), never this file.
# ============================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "Preparing Lyra Studio on Kaggle..."

if ! nvidia-smi >/dev/null 2>&1; then
  echo "⚠️  No GPU found. In the notebook sidebar set Accelerator to 'GPU T4 x2', then run again."
fi

# 1. System tools and backend dependencies
if ! command -v ffmpeg >/dev/null 2>&1; then
  apt-get -qq update && apt-get -qq install -y ffmpeg >/dev/null
fi
pip install -r backend/requirements.txt --quiet

# 2. Tunnel client
TUNNEL="${LYRA_TUNNEL:-loca}"
SUBDOMAIN="${LYRA_SUBDOMAIN:-lyra-studio}"
CLOUDFLARED="$ROOT_DIR/.bin/cloudflared"
if [ "$TUNNEL" = "cloudflare" ]; then
  if [ ! -x "$CLOUDFLARED" ]; then
    mkdir -p "$ROOT_DIR/.bin"
    curl -fsSL -o "$CLOUDFLARED" \
      https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
    chmod +x "$CLOUDFLARED"
  fi
elif ! command -v lt >/dev/null 2>&1; then
  if ! command -v npm >/dev/null 2>&1; then
    apt-get -qq update && apt-get -qq install -y nodejs npm >/dev/null
  fi
  npm install -g localtunnel >/dev/null 2>&1
fi

# localtunnel corrupts uploaded audio when it rewrites the Host header; swap in the byte-safe version
LT_FIX_TARGET="$(npm root -g 2>/dev/null || true)/localtunnel/lib/HeaderHostTransformer.js"
if [ -f "$LT_FIX_TARGET" ]; then
  cp "$ROOT_DIR/tools/localtunnel-host-fix.js" "$LT_FIX_TARGET"
fi

# 3. Storage: /kaggle/working is kept only if you "Save Version" the notebook,
#    so use "Save to cloud" in the player for songs you want to keep.
OUT_DIR="/kaggle/working/lyra-songs"
mkdir -p "$OUT_DIR/.internal_jobs"
export LYRA_OUTPUTS_DIR="$OUT_DIR/.internal_jobs"
export LYRA_JOBS_FILE="$OUT_DIR/jobs_db.json"

export PYTORCH_CUDA_ALLOC_CONF="expandable_segments:True"
export RVC_CUDA_GRAPH="0"

# 4. Start the backend
pkill -9 -f "uvicorn app:app" 2>/dev/null || true
pkill -9 -f "cloudflared tunnel" 2>/dev/null || true
pkill -9 -f "lt --port" 2>/dev/null || true
cd "$ROOT_DIR/backend"
rm -f /tmp/uvicorn.log /tmp/cloudflared.log /tmp/lt.log
python3 -m uvicorn app:app --host 127.0.0.1 --port 8000 > /tmp/uvicorn.log 2>&1 &
SERVER_PID=$!
TUNNEL_PID=""

cleanup() {
  [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" 2>/dev/null || true
  [ -n "${TUNNEL_PID:-}" ] && kill "$TUNNEL_PID" 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

echo "⏳ Waiting for Lyra backend to initialize..."
READY=0
for i in {1..60}; do
  if curl -s http://127.0.0.1:8000/api/info >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done
if [ "$READY" -eq 0 ]; then
  echo "❌ Backend did not respond on port 8000 within 60 seconds. Last log lines:"
  tail -n 30 /tmp/uvicorn.log 2>/dev/null || true
  exit 1
fi
echo "✅ Lyra backend is online."

# 5. Open the tunnel and print its address
start_tunnel() {
  URL=""
  if [ "$TUNNEL" = "cloudflare" ]; then
    "$CLOUDFLARED" tunnel --no-autoupdate --url http://127.0.0.1:8000 >> /tmp/cloudflared.log 2>&1 &
    TUNNEL_PID=$!
    for i in {1..30}; do
      URL=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" /tmp/cloudflared.log | tail -n 1 || true)
      [ -n "$URL" ] && break
      sleep 1
    done
  else
    : > /tmp/lt.log
    lt --port 8000 --local-host 127.0.0.1 --subdomain "$SUBDOMAIN" >> /tmp/lt.log 2>&1 &
    TUNNEL_PID=$!
    for i in {1..20}; do
      URL=$(grep -oE "https://[a-z0-9-]+\.loca\.lt" /tmp/lt.log | tail -n 1 || true)
      [ -n "$URL" ] && break
      sleep 1
    done
  fi
  echo ""
  echo "============================================================"
  echo " 🚀 LYRA STUDIO IS LIVE"
  echo " 👉 OPEN: ${URL:-(tunnel still starting, see /tmp/lt.log or /tmp/cloudflared.log)}"
  if [ "$TUNNEL" != "cloudflare" ]; then
    echo " 🔑 Tunnel password if asked: $(curl -s https://loca.lt/mytunnelpassword 2>/dev/null)"
    if [ -n "$URL" ] && [ "$URL" != "https://$SUBDOMAIN.loca.lt" ]; then
      echo " ℹ️  $SUBDOMAIN.loca.lt is still held by an old session; it frees up in a few"
      echo "    minutes. Stop this cell and run it again to get the fixed address back."
    fi
  fi
  echo "============================================================"
  echo " Server log: tail -n 30 /tmp/uvicorn.log"
  echo ""
}
start_tunnel

# 6. Keep alive: restart the tunnel if it drops
while kill -0 "$SERVER_PID" 2>/dev/null; do
  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo "⚠️ Tunnel disconnected. Reconnecting..."
    start_tunnel
  fi
  sleep 5
done
echo "❌ Backend stopped. Last log lines:"
tail -n 30 /tmp/uvicorn.log 2>/dev/null || true
