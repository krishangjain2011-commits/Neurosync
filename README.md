# 🧠 NeuroSync — AI Digital Caretaker

AI-powered caregiving platform for children with Autism, ADHD, and Dyslexia.
Built for India — supports English, हिंदी, and मराठी.

---

## Quick Start (Local)

```bash
# 1. Clone and install
git clone https://github.com/krishangjain2011-commits/NeuroSync.git
cd NeuroSync
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — add your GROQ_API_KEY (free at console.groq.com)

# 3. Start the app
start.bat          # Windows — starts app + ML sidecar together
# or
npm run dev:full   # cross-platform via npm

# Open http://localhost:3000
```

### With Python ML Sidecar (recommended for Behavior Interpreter)

The sidecar provides real MFCC audio embeddings via librosa + ffmpeg.
Falls back to a JS approximation automatically if not running.

**Prerequisites:** Python 3.10+, ffmpeg (`winget install Gyan.FFmpeg` on Windows)

```bash
# First-time setup
npm run ml:setup

# Start everything together
npm run dev:full
```

---

## Deploy on Render (Free)

### Step 1 — Push to GitHub
Push your repo to GitHub (already done if you cloned this).

### Step 2 — Create a Web Service on Render
1. Go to [render.com](https://render.com) → **New** → **Web Service**
2. Connect GitHub and select the **NeuroSync** repository
3. Render auto-detects `render.yaml` and pre-fills settings

### Step 3 — Set environment variables
In **Render dashboard → Environment tab**, add:

| Variable | Value | Required |
|---|---|---|
| `GROQ_API_KEY` | Free key from [console.groq.com](https://console.groq.com) | ✅ Yes |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | auto-set |
| `NODE_ENV` | `production` | auto-set |
| `RESEND_API_KEY` | From [resend.com](https://resend.com) — for email reports | Optional |
| `DB_PATH` | `/data/neurosync.db` (add paid Disk) or `/tmp/neurosync.db` | Optional |
| `UPLOADS_DIR` | `/data/uploads` (paid Disk) or `/tmp/uploads` | Optional |

### Step 4 — Deploy
Click **Create Web Service**. Build takes ~2 min.

> **Free tier note:** Render's free tier has an ephemeral filesystem — SQLite DB and uploaded audio files reset on each redeploy. For persistence, upgrade to a paid plan, add a **Disk** at `/data`, and set `DB_PATH=/data/neurosync.db` and `UPLOADS_DIR=/data/uploads`.

> **ML sidecar note:** The Python ML sidecar cannot run on Render's free tier (requires a separate Python service). The app automatically falls back to the JS embedder for audio matching when the sidecar is unavailable.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Server | Node.js ESM, Express 4, tsx |
| Frontend | React 18, Vite 6, TailwindCSS v4, framer-motion |
| Database | SQLite via better-sqlite3 |
| AI — Text | Groq (llama-3.3-70b-versatile) + Gemini 2.5 Flash fallback |
| AI — Vision | Groq (meta-llama/llama-4-scout-17b-16e-instruct) for handwriting |
| ML — Audio | Python FastAPI sidecar: librosa MFCC + nearest-centroid classifier |
| Auth | Opaque session tokens, bcrypt, express-rate-limit |
| i18n | Baked-in EN / HI / MR translations |
| File storage | Multer disk storage, 30-day auto-purge |

---

## Modules

| # | Module | Description |
|---|---|---|
| 1 | 💬 Helpful Chat | Real-time streaming AI chat with child profile context |
| 2 | 🎙️ Behaviour Interpreter | Audio cue recording → MFCC embedding → on-device matching |
| 3 | 🥗 Diet Planner | Sensory-aware AI meal plans |
| 4 | 📅 Daily Routine | Timed therapy schedules |
| 5 | 📚 Homeschooling Helper | Lesson planner + handwriting analysis (Groq vision) |
| 6 | 🖼️ Visual Board | PECS communication cards with text-to-speech |
| 7 | 📈 Progress Tracker | Behavioral metrics + trend charts |
| 8 | 📋 Reports & Sharing | Printable PDF reports, email to institutions |
| 9 | 🚨 Emergency Support | India helplines + AI de-escalation guidance |
| 10 | 📊 Population Insights | District admin analytics (de-identified) |

---

## Privacy & Compliance

- **DPDP Act 2023** compliant consent layer
- Right to erasure (§17) fully implemented — deletes DB rows, audio files, and ML models
- Audio recordings auto-purged after 30 days
- On-device IndexedDB model — no audio embeddings leave the user's device for local matching
- Multi-tenant org model (family, Anganwadi, school, PHC, NGO, district admin)
- No data shared with third parties without explicit consent

---

## Project Structure

```
neurosync/
├── server.ts          # Express server (API + Vite SSR in dev)
├── db/index.ts        # SQLite schema + migrations
├── lib/
│   ├── ai-client.ts   # Groq/Gemini unified client
│   ├── auth.ts        # Session tokens + RBAC
│   ├── consent.ts     # DPDP consent enforcement
│   ├── embedder.ts    # JS audio embedder (fallback)
│   └── language-bridge.ts  # Bhashini i18n bridge
├── ml/                # Python FastAPI ML sidecar
│   ├── main.py        # FastAPI endpoints
│   ├── embedder.py    # MFCC feature extraction (librosa)
│   ├── classifier.py  # Nearest-centroid + softmax classifier
│   └── requirements.txt
├── src/               # React frontend
│   ├── pages/         # One file per module
│   ├── components/    # Shared UI components
│   ├── context/       # React contexts (auth, offline, lang)
│   └── lib/           # Client utilities (api, cue-model, i18n)
├── uploads/           # Audio recordings (gitignored, auto-purged)
├── start.bat          # Windows one-click launcher
├── render.yaml        # Render deployment config
└── .env.example       # Environment variable template
```
