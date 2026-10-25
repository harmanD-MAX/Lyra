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

## Accounts (Sign in with Google + Cloudflare D1)

Sign-in is off until both Firebase and D1 are configured. Once on, the **Log in** button opens Google sign-in, and **My Songs** lists every song that account saved. Firebase Authentication only runs the Google popup (free Spark plan, no Google Cloud Console setup). The accounts and the list of who owns which song live in Cloudflare D1, and the audio stays in R2.

1. **D1:** run `npx wrangler d1 create lyra-db` and copy its `database_id`. Then create a Cloudflare API token with **Account → D1 → Edit** permission.
2. **Firebase:** at [console.firebase.google.com](https://console.firebase.google.com), create a project (you can turn Google Analytics off). Then:
   - In **Authentication → Sign-in method**, turn on **Google**.
   - In **Authentication → Settings → Authorized domains**, add the addresses you open Lyra from, e.g. `lyra-studio.loca.lt` (`localhost` is already there).
   - In **Project settings → Your apps**, add a **Web app** and copy its `apiKey`, `authDomain`, `projectId` and `appId`.
3. Copy `backend/.env.example` to `backend/.env` and fill in the D1, Firebase and `LYRA_SESSION_SECRET` values.

The backend creates the tables on startup; the same schema is in `cloudflare/schema.sql`. Songs saved before sign-in was turned on have no owner, so they don't show in anyone's My Songs.

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
