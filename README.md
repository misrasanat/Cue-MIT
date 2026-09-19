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

## Troubleshooting & Common Mistakes

| What happened | Why it happened | The Fix |
|---|---|---|
| `npm error ERR_INVALID_ARG_TYPE ... Received null` | Ran `npm install` in the root folder or `backend/`, which have no `package.json`. | Only run `npm` inside `frontend/` (`cd frontend && npm install`). |
| `npm install requirements.txt` (404 Not Found) | npm tried downloading a JavaScript package named `"requirements.txt"` from `npmjs.org`. | `requirements.txt` is for Python. Use `pip install -r requirements.txt` in `backend/`. |
| `ModuleNotFoundError: No module named 'flask'` | Ran `python3 server.py` using system Python without activating the virtual environment. | Run `source venv/bin/activate` first, then run `python server.py`. |
| No Cue Cards appearing on dashboard | Backend is not running or `GEMINI_API_KEY` is not set in `backend/.env`. | Make sure `python server.py` is running and your API key is in `.env`. |
