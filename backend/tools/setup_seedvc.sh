#!/usr/bin/env bash
# Install the Seed-VC singing engine next to Lyra.
#
#   bash backend/tools/setup_seedvc.sh
#
# Seed-VC (https://github.com/Plachtaa/seed-vc, GPL-3.0) is cloned into
# backend/third_party/seed-vc and run by Lyra as a separate process. Its
# models (DiT singing 44k, Whisper-small, BigVGAN, CAMPPlus, RMVPE) download
# from Hugging Face on first use.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${LYRA_SEEDVC_DIR:-$HERE/third_party/seed-vc}"

if [ ! -d "$DEST/.git" ]; then
  mkdir -p "$(dirname "$DEST")"
  git clone --depth 1 https://github.com/Plachtaa/seed-vc.git "$DEST"
else
  git -C "$DEST" pull --ff-only
fi

REQ="$DEST/requirements.txt"
if [ "$(uname)" = "Darwin" ] && [ -f "$DEST/requirements-mac.txt" ]; then
  REQ="$DEST/requirements-mac.txt"
fi
python -m pip install -r "$REQ"

echo
echo "Seed-VC installed at $DEST"
echo "Restart the Lyra backend; /api/info will report seedvc_available: true."
