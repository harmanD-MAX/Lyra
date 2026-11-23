#!/usr/bin/env bash
# Full-song test on Colab: sing a song Lyra converted again with ACE-Step 1.5 (natural voice,
# same lyrics, melody and music style). Run in a Colab cell after converting a song:
#
#   !bash /content/Lyra/tools/full_song_test.sh
#   !bash /content/Lyra/tools/full_song_test.sh --lyrics /content/lyrics.txt --caption "sad romantic Bollywood, piano"
#
# Results go to Google Drive: MyDrive/lyra-full-song-test/
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACE="${ACESTEP_DIR:-/content/ACE-Step-1.5}"

if ! command -v uv >/dev/null 2>&1; then
  echo "==> Installing uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

if [ ! -d "$ACE/.git" ]; then
  echo "==> Getting ACE-Step 1.5..."
  git clone --depth 1 https://github.com/ACE-Step/ACE-Step-1.5.git "$ACE"
fi
cd "$ACE"
echo "==> Installing ACE-Step (first time takes a few minutes)..."
uv sync
uv pip install --quiet openai-whisper soundfile
echo "==> Downloading the models (first time only)..."
uv run acestep-download || echo "(model download step reported a problem; continuing, models may download on first use)"

uv run python "$HERE/full_song_test.py" --acestep "$ACE" "$@"
