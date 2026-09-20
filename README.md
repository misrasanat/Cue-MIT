# Cue - Ambient Comprehension Companion for Gemini CLI

Cue is an AI-powered architectural decision logger and comprehension tool that automatically captures Gemini CLI coding sessions and generates real-time Cue Cards, trade-off quizzes, and standup prep notes.

---

## ⚡ Quick Start: Running the App

To run the full Cue stack, open **two separate terminal windows/tabs**:

### Terminal 1: Backend (Python / Flask)
```bash
cd backend
source venv/bin/activate
python server.py
```
> [!IMPORTANT]
> The backend is written in **Python**. Always use `pip`, **not** `npm`.
> - Do **not** run `npm install` in `backend/` or in the root folder.
> - If you ever need to install dependencies, run `pip install -r requirements.txt`.

---

### Terminal 2: Frontend (React / Vite)
```bash
cd frontend
npm install
npm run dev
```
> [!TIP]
> This starts the web dashboard at **http://localhost:5173**.
> - `frontend/` is the **only** directory where `npm` commands should be run.

---

## Architecture Overview

* **`backend/`** (Python / Flask on port `5001`):
  - Captures Gemini CLI tool events (`update_topic`, `write_file`, `replace`).
  - Calls Google Gemini 2.0 Flash to distill code diffs into architectural Cue Cards.
  - Automatically registers lifecycle hooks in `~/.gemini/settings.json`.
* **`frontend/`** (React / Vite on port `5173`):
  - Real-time dashboard displaying decision logs, alternative pros/cons, interactive quizzes, and standup notes.
  - Connects to the backend at `http://localhost:5001`.

---

## Detailed Setup Instructions

### 1. Prerequisites
- **Python 3.9+**
- **Node.js 18+** & **npm**
- **Google Gemini API Key** (from [Google AI Studio](https://aistudio.google.com/))
- **Gemini CLI** installed on your system

---

### 2. Backend Detailed Setup
1. Navigate to the backend:
   ```bash
   cd backend
   ```
2. Activate the virtual environment:
   ```bash
   source venv/bin/activate
   ```
   *(If `venv` doesn't exist yet, run `python3 -m venv venv && source venv/bin/activate`)*
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Set up environment variables:
   ```bash
   cp .env.example .env
   ```
   Add your API key into `.env`:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   PORT=5001
   ```
5. Start the server:
   ```bash
   python server.py
   ```

---

### 3. Frontend Detailed Setup
1. Navigate to the frontend:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Using Cue with Gemini CLI

1. **Keep the Backend (`python server.py`) and Frontend (`npm run dev`) running.**
2. **Install the CLI Companion globally (Optional / from source)**:
   From the repository root:
   ```bash
   pip install -e .
   ```
   - Log in: `cue`
   - Setup/verify hook registration: `cue-setup`
3. **Use Gemini CLI as normal**:
   In any project terminal, prompt Gemini CLI:
   ```bash
   gemini "refactor authentication to use JWT tokens"
   ```
4. Watch the **Cue Web Dashboard** (`http://localhost:5173`) update live with architectural Cue Cards, trade-off evaluations, and comprehension quizzes!

---

## Sharing sessions with your team

Cue can show a teammate's coding sessions live in **Team Brain**, and anyone on the project can turn them into lessons.

1. **One-time database setup** (whoever runs your Supabase project): open the Supabase dashboard, go to *SQL Editor*, and run [`backend/schema_sessions.sql`](backend/schema_sessions.sql). If saving lessons fails with a "row-level security" error, also run `ALTER TABLE public.cue_cards DISABLE ROW LEVEL SECURITY;`.
2. **Link a repo to a team project**, once per repo, from inside the folder:
   ```bash
   cue link
   ```
   This writes `.cue/project.json`. Commit it to link everyone who clones the repo, or add `.cue/` to `.gitignore` to keep it to yourself. `cue unlink` stops sharing, and `cue status` shows what this folder is linked to.
3. **Code as usual** with Gemini CLI or Antigravity. Edits in linked folders appear under your name in your teammates' Team Brain.

> [!WARNING]
> Sharing uploads the code changes you make in linked folders, not just summaries. Obvious secrets (API keys, tokens, passwords) are masked, files like `.env` and `*.pem` are never uploaded with their contents, and command lines are never uploaded. This is best-effort. With row-level security disabled, anyone holding your project's Supabase key can read the shared rows, so only link repos you are comfortable sharing with the team.

---

## Team Brain: asking questions about your team's work

Ask things like *"What has Dhweya been working on?"*, *"Why did she add a random delay to retries?"* or *"What changed in auth.py?"* and Cue answers from your team's lessons **and** live coding sessions, with numbered sources you can open.

**How it stays accurate and cheap.** A local search (no AI, no cost) works out who and when you mean, ranks the team's notes, and picks the few that matter. Only those go to the model (Meta's `muse-spark-1.3`), which writes a short, cited answer. Repeat questions are answered from a cache and cost nothing, and if nothing relevant exists the model is never called.

**Set up (once per computer)**
1. Get a key from the [Meta Model API](https://ai.developer.meta.com) and add it to `backend/.env` (this file is git-ignored, so never commit it):
   ```env
   META_API_KEY=your_meta_api_key_here
   ```
   If you run Cue from pip instead of this repo, set `META_API_KEY` as an environment variable.
2. Run [`backend/schema_llm.sql`](backend/schema_llm.sql) once in the Supabase SQL editor. It creates the shared spending ledger. Until it exists, each computer only gets half the spending limit, because it can't see what a teammate spent.

**Spending limit.** Meta offers no billing cap of its own, so Cue enforces one before every model call: **$25 total for the whole team**, $5 per day, and 120 calls per hour. When the total is reached, smart answers stop, Team Brain keeps answering from your notes without the AI, and the addresses in `BUDGET_ALERT_EMAILS` are alerted once. Change the limits in `backend/.env`:

```env
LLM_BUDGET_USD=25
LLM_DAILY_USD=5
BUDGET_ALERT_EMAILS=you@example.com,teammate@example.com
```

To actually **send** the alert email, Cue needs an account to send from. For Gmail, create an [app password](https://myaccount.google.com/apppasswords) and add:

```env
SMTP_HOST=smtp.gmail.com
SMTP_USER=you@example.com
SMTP_PASSWORD=your-16-character-app-password
```

(A `RESEND_API_KEY` works too.) Without this the alert still appears in the app and is saved to `~/.cue/budget_alert.txt`. The amounts use Meta's published standard prices ($1.25 / $4.25 per million input / output tokens); override with `META_PRICE_INPUT`, `META_PRICE_CACHED` and `META_PRICE_OUTPUT` if they change.

> [!IMPORTANT]
> Meta's cheaper `-contributor` models let Meta **train on your prompts**, and your prompts include your team's code. Cue refuses to use them unless you set `META_ALLOW_TRAINING_TIER=1`.

---

## Deploying: Netlify (website) + Render (backend)

Cue has two halves. The **website** is static and lives on Netlify. The **backend** is a Flask server; on Render it powers the dashboard, teams and Team Brain. Capturing coding sessions always happens on each developer's own computer (the hooks read local files), so that part is never hosted.

**1. Backend on Render**: *New > Web Service* (or *New > Blueprint*, which reads [`render.yaml`](render.yaml)):

| Setting | Value |
|---|---|
| Root Directory | `backend` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `gunicorn server:app --bind 0.0.0.0:$PORT --workers 1 --threads 8 --timeout 120` |
| Health Check Path | `/health` |

Use **one worker**: the spending limit and search index live in memory. Set these environment variables in Render's dashboard (never in git):

| Variable | Value |
|---|---|
| `CUE_PUBLIC_MODE` | `1` (also automatic on Render) |
| `PUBLIC_APP_URL` | your Netlify address, used for invite links |
| `ALLOWED_ORIGINS` | your Netlify address, the only website allowed to call the server |
| `META_API_KEY` | your Meta key (secret) |
| `LLM_BUDGET_USD`, `LLM_DAILY_USD` | `25`, `5` |
| `BUDGET_ALERT_EMAILS` | who to email at the limit |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` | optional: send that email (Gmail app password) |
| `GEMINI_API_KEY` | optional: lets anyone turn a teammate's session into lessons |

Do **not** add `SUPABASE_SERVICE_ROLE_KEY` or `META_ALLOW_TRAINING_TIER`.

**2. Website on Netlify**: base directory `frontend`, build `npm run build`, publish `dist` (these are also in [`netlify.toml`](netlify.toml)). Add one environment variable, `VITE_API_BASE`, set to your Render address (for example `https://cue-backend.onrender.com`), then redeploy, because it is baked in at build time.

**3. Supabase**: under *Authentication > URL Configuration*, set the Site URL to your Netlify address and add it to the redirect URLs, so sign-up emails don't link to localhost. Also run `backend/schema_llm.sql` so the AI spending limit survives Render restarts.

**What public mode does.** It switches off everything that is only safe on your own computer: capturing hook events, wiping data, changing the AI key, and raw logs. It ignores identities sent in a request body, verifies every login against Supabase's public keys, allows only your website through CORS, and limits each visitor to 20 questions per 10 minutes.

**Known limits.** Render's free plan sleeps when idle, so wake it before a demo, and its disk resets on restart.

---

## Troubleshooting & Common Mistakes

| What happened | Why it happened | The Fix |
|---|---|---|
| `npm error ERR_INVALID_ARG_TYPE ... Received null` | Ran `npm install` in the root folder or `backend/`, which have no `package.json`. | Only run `npm` inside `frontend/` (`cd frontend && npm install`). |
| `npm install requirements.txt` (404 Not Found) | npm tried downloading a JavaScript package named `"requirements.txt"` from `npmjs.org`. | `requirements.txt` is for Python. Use `pip install -r requirements.txt` in `backend/`. |
| `ModuleNotFoundError: No module named 'flask'` | Ran `python3 server.py` using system Python without activating the virtual environment. | Run `source venv/bin/activate` first, then run `python server.py`. |
| No Cue Cards appearing on dashboard | Backend is not running or `GEMINI_API_KEY` is not set in `backend/.env`. | Make sure `python server.py` is running and your API key is in `.env`. |
