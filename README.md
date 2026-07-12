# 🧠 NeuroSync — AI Digital Caretaker

AI-powered caregiving platform for children with Autism, ADHD, and Dyslexia.
Built for India — supports English, हिंदी, and मराठी.

---

## Deploy on Render (Free)

### Step 1 — Fork / push to GitHub
Make sure your code is pushed to GitHub (already done).

### Step 2 — Create a new Web Service on Render
1. Go to [render.com](https://render.com) → **New** → **Web Service**
2. Connect your GitHub account and select the **NeuroSync** repository
3. Render will auto-detect `render.yaml` and pre-fill settings

### Step 3 — Set environment variables
In the Render dashboard → **Environment** tab, add:

| Variable | Value | Required |
|---|---|---|
| `GROQ_API_KEY` | Your key from [console.groq.com](https://console.groq.com) (free) | ✅ Yes |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | ✅ Yes |
| `NODE_ENV` | `production` | ✅ Yes (auto-set) |
| `GEMINI_API_KEY` | From [aistudio.google.com](https://aistudio.google.com) | Optional |
| `RESEND_API_KEY` | From [resend.com](https://resend.com) — for email reports | Optional |
| `DB_PATH` | `/tmp/neurosync.db` (free tier) or `/data/neurosync.db` (paid disk) | Optional |

### Step 4 — Deploy
Click **Create Web Service**. Render will:
1. Run `npm install && npm run build` (builds the React frontend)
2. Start the server with `NODE_ENV=production node --import tsx/esm server.ts`
3. Serve everything from port `$PORT` (assigned by Render)

> **Note on the free tier:** Render's free tier has an ephemeral filesystem — the SQLite database resets on each redeploy. For persistent data, upgrade to a paid plan, add a **Disk** mounted at `/data`, and set `DB_PATH=/data/neurosync.db`.

---

## Run Locally

```bash
# Install dependencies
npm install

# Copy env template and fill in your API key
cp .env.example .env
# Edit .env — add at minimum: GROQ_API_KEY=your_key

# Start development server (hot reload)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Server | Node.js ESM, Express, tsx |
| Frontend | React 18, Vite, TailwindCSS v4, framer-motion |
| Database | SQLite via better-sqlite3 |
| AI | Groq (llama-3.3-70b-versatile) + Gemini 2.5 Flash fallback |
| Auth | Opaque session tokens, bcrypt, rate limiting |
| i18n | Baked-in EN / HI / MR translations |

## Modules

1. 💬 Helpful Chat — real-time streaming AI chat
2. 🧩 Behavior Interpreter — audio/video cue recognition + AI analysis
3. 🥗 Diet Planner — sensory-aware meal plans
4. 📅 Daily Routine — timed therapy schedules
5. 📚 Homeschooling Helper — multi-modal lesson plans
6. 🖼️ Visual Board — PECS communication cards with TTS
7. 📈 Progress Tracker — behavioral metrics + charts
8. 📋 Reports & Sharing — printable reports, email to institutions
9. 🚨 Emergency Support — India helplines + AI guidance
10. 📊 Population Insights — district admin analytics

---

## Privacy & Compliance

- DPDP Act 2023 compliant consent layer
- No data shared with third parties
- Right to erasure (§17) implemented
- Multi-tenant org model (family, Anganwadi, school, PHC, NGO, district admin)
