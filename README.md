# Lyra

Sing a take, fix its pitch and timing against the original song, and hear it back in your own voice or as a voice model. Every render also exports studio stems and a MIDI file.

## Quick start on a small Mac (little disk or RAM)

```bash
pip install -r backend/requirements.txt
./start-lite.sh          # then open http://127.0.0.1:8000
```

Lite mode is chosen automatically when you have less than 25 GB of free disk or 16 GB of RAM or less. You can also force it with `LYRA_PROFILE=lite`. In Lite mode Lyra:

- uses small separation models (about 0.6 GB instead of about 2.7 GB);
- uses half your CPU cores at low priority, so your editor and browser stay responsive;
- deletes each song's temporary files when the song finishes (masters, stems and MIDI are kept);
- skips a model download when it would leave less than 3 GB free (`LYRA_MIN_FREE_GB`);
- runs as one process, because the backend serves the built frontend (no Vite dev server).

The studio sidebar shows free space and has a **Free up space** button.

Each 4-minute song keeps roughly 150–250 MB of results. Delete old songs from **My Songs** to reclaim the space.

## Development (two processes)

```bash
cd backend && python -m uvicorn app:app --port 8000
cd frontend && npm run dev   # http://localhost:3000
```

## Accounts (Google sign-in + Cloudflare D1)

Sign-in is off until both Google and D1 are configured. Once on, the studio asks people to sign in with Google, and **My Songs** only lists the songs saved by that account. Accounts and song ownership live in Cloudflare D1; the audio stays in R2.

1. Create the database: `npx wrangler d1 create lyra-db`, and copy its `database_id`.
2. Create a Cloudflare API token with **Account → D1 → Edit** permission.
3. In Google Cloud Console → APIs & Services → Credentials, create an **OAuth client ID** (type *Web application*). Add every origin you open Lyra from under **Authorized JavaScript origins**, e.g. `http://localhost:8000`, `http://localhost:3000` and `https://lyra-studio.loca.lt`.
4. Copy `backend/.env.example` to `backend/.env` and fill in `CF_D1_DATABASE_ID`, `CF_API_TOKEN`, `GOOGLE_CLIENT_ID` and `LYRA_SESSION_SECRET`.

The backend creates the tables on startup (the same schema is in `cloudflare/schema.sql`). Songs saved before sign-in was turned on have no owner, so they no longer show in My Songs.

## Voice engines

| Engine | What it is | Strengths |
|---|---|---|
| **Seed-VC singing** | DiT diffusion + Whisper + BigVGAN, 44.1 kHz, pitch-conditioned | Sings as a voice from a 10–30 s sample; clearer lyrics and closer likeness in its authors' published singing test against trained RVC v2 48 kHz models |
| **RVC v2** | Retrieval-based VC, trained at 40 or 48 kHz | Tightest pitch, cleanest audio, small and fast |

Seed-VC is optional: it adds a few GB of models. Install it with `bash backend/tools/setup_seedvc.sh`.

With the engine set to **Auto**, Lyra uses:

1. the winner from your own benchmark for that voice;
2. otherwise Seed-VC, when it's installed and the voice has a sample;
3. otherwise RVC.

To compare the engines on a voice and save the winner:

```bash
python backend/tools/benchmark.py --clips my_clips/ --model <voice> \
    --reference target_voice_clips/ --engines rvc,seedvc
```

## Training your own voice (Voice Lab)

You can record in the browser with guided prompts or upload files. Choose a quality preset:

- **Quick**: RVC 40 kHz, 1,000 steps. Needs 3–5 minutes of recording.
- **Standard**: RVC 40 kHz, 2,000 steps. Needs about 10 minutes. Recommended.
- **Best**: RVC 48 kHz, 4,000 steps, plus a Seed-VC fine-tune. Needs 15–20 minutes; a GPU is strongly recommended.

Every preset also builds a voice sample from your recordings, so Seed-VC can sing as you.

Lyra is a personal project. Keep renders of real artists' voices private.
