# TEFILAH - Complete Setup & Run Guide

A full-stack sacred prayer request platform with AI-powered comfort messages.

## Architecture Overview

```
Frontend (Expo/React Native)  -->  Backend (FastAPI/Python)  -->  MongoDB
                                        |
                                        +--> LLM - comfort messages & Bible verses
                                        |    (Gemini by default; Ollama/OpenRouter optional)
                                        +--> Resend API - verification & notification email
```

| Component      | Technology                          | Default Port |
|----------------|-------------------------------------|--------------|
| Frontend       | Expo SDK 54, React Native, TypeScript | 8081         |
| Backend API    | FastAPI, Python 3.11+, Motor (async MongoDB) | 8001  |
| Database       | MongoDB                             | 27017        |
| Email          | Resend HTTP API (`RESEND_API_KEY`)  | outbound HTTPS |
| LLM (default)  | Google Gemini (`gemini-2.5-flash`)  | outbound HTTPS |
| LLM (optional) | Ollama (deepseek-r1:8b), local      | 11434        |

## Prerequisites

Install these before proceeding:

- **Python 3.11+** - https://www.python.org/downloads/
- **Node.js 18+** - https://nodejs.org/
- **Yarn** - `npm install -g yarn` (after Node.js is installed)
- **MongoDB Community Server** - https://www.mongodb.com/try/download/community
- **Ollama** (optional) - https://ollama.com/download

---

## Step 1: Install & Start MongoDB

### Windows
1. Download the MongoDB Community Server MSI installer
2. Run the installer - choose "Complete" installation
3. Check "Install MongoDB as a Service" (starts automatically)
4. After install, verify it's running:
   ```bash
   mongosh --eval "db.adminCommand('ping')"
   ```
   Expected output: `{ ok: 1 }`

### If MongoDB isn't running as a service
```bash
# Start manually (Windows)
"C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe" --dbpath="C:\data\db"
```
Make sure `C:\data\db` directory exists first: `mkdir C:\data\db`

---

## Step 2: Configure Email (Resend)

The backend no longer speaks SMTP — there is no MailHog/local mail step. All
outbound mail (verification codes, password resets, account notices) goes through
the **Resend HTTP API**.

1. Get an API key from https://resend.com
2. Set it in `backend/.env`:
   ```
   RESEND_API_KEY=re_...
   SENDER_EMAIL=admin@tefillah.in
   ```

### Running without an API key
If `RESEND_API_KEY` is empty the backend still starts and every account action
still succeeds — sending is skipped and the backend logs:
```
RESEND_API_KEY not set - skipping email to <address>
```
Verification codes are **not** printed to the console, so to verify a local test
account you need either a working Resend key or a direct database update.

---

## Step 3: Install & Start Ollama (Optional)

Ollama runs a local AI model that generates personalized comfort messages and Bible verses for each prayer request. **The app works without Ollama** - it will use hardcoded fallback messages instead.

**Only needed if you set `LLM_PROVIDER=ollama`.** The default provider is Gemini
(`LLM_PROVIDER=gemini` + `GEMINI_API_KEY`), which needs no local model download.

### Windows
1. Download and install from https://ollama.com/download
2. After installation, Ollama runs automatically in the system tray
3. Open a terminal and pull the model:
   ```bash
   ollama pull deepseek-r1:8b
   ```
   This downloads ~5GB. Wait for it to complete.
4. Verify Ollama is running:
   ```bash
   ollama list
   ```
   You should see `deepseek-r1:8b` in the list.

### If Ollama isn't running
```bash
ollama serve
```
Keep this terminal open.

### Note on Performance
- First prayer request after starting Ollama may take 30-60 seconds (model loading into RAM)
- Subsequent requests take 5-20 seconds depending on your hardware
- Requires at least 8GB RAM free for the deepseek-r1:8b model

---

## Step 4: Set Up the Backend

### 4.1 Create Python Virtual Environment
```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate it
# Windows (PowerShell):
venv\Scripts\Activate.ps1
# Windows (Command Prompt):
venv\Scripts\activate.bat
# Windows (Git Bash / WSL):
source venv/Scripts/activate
```

### 4.2 Install Python Dependencies
```bash
pip install -r requirements.txt
```

### 4.3 Configure Environment
```bash
cat .env
```

If missing, copy from example:
```bash
cp .env.example .env
```

⚠️ **The committed `backend/.env` points at the PRODUCTION Atlas cluster.** Before
doing local work, override `MONGO_URL` and `DB_NAME` so you are not reading and
writing live data.

**`.env.example` values (see that file for the full list):**
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=tefilah
JWT_SECRET=your-super-secret-key-change-in-production
ADMIN_SECRET=tefilah-admin-secret-2024
LLM_PROVIDER=gemini            # gemini (default) | openrouter | ollama
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=deepseek-r1:8b
RESEND_API_KEY=
SENDER_EMAIL=admin@tefillah.in
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8081,http://localhost:19006
```

Two of these fail closed rather than defaulting quietly once the environment looks
like production (a `mongodb+srv://` or non-localhost `MONGO_URL`, a `DB_BACKEND`
other than `mongo`, or `RAILWAY_ENVIRONMENT`/`PRODUCTION` set):

- `JWT_SECRET` left at its built-in default **refuses to start the API** (override
  with `ALLOW_DEFAULT_JWT_SECRET=true`, not recommended)
- `ADMIN_SECRET` left at its built-in default disables the admin-bootstrap
  endpoint — see Step 6

### 4.4 Start the Backend Server
```bash
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

**Expected output:**
```
INFO:     Uvicorn running on http://0.0.0.0:8001
INFO:     Application startup complete.
INFO:     server - Database indexes created
```

### 4.5 Verify Backend
Open http://localhost:8001/api/ in your browser. You should see:
```json
{
  "message": "Tefillah - Sacred Prayer Platform",
  "status": "active"
}
```

The version and LLM-provider fields were deliberately removed from this response
so it does not fingerprint the stack. For a liveness probe use
http://localhost:8001/api/health. Interactive API docs (`/docs`, `/redoc`,
`/openapi.json`) are disabled unless you set `ENABLE_DOCS=true`.

---

## Step 5: Set Up the Frontend

### 5.1 Install Dependencies
```bash
cd frontend
yarn install
```

### 5.2 Configure Environment
Only `.env.example` is committed, so create your own:
```bash
cp .env.example .env
```

It must contain:
```
EXPO_PUBLIC_BACKEND_URL=http://localhost:8001
```

⚠️ **This is not optional for local work.** When `EXPO_PUBLIC_BACKEND_URL` is unset
the client falls back to the *production* API, `https://api.tefillah.in` — so a
missing `.env` silently points your dev build at live data. The value is baked in
at build time, so restart the Expo dev server after changing it.

### 5.3 Start the Frontend (Web)
```bash
yarn dev
```

This starts Expo development server. Press `w` if it doesn't auto-open the web browser, or open http://localhost:8081 manually.

### 5.4 Alternative: Build & Serve Static Files
```bash
yarn build          # expo export --platform web  ->  static files in dist/
```

`yarn start` runs `expo start` (the Expo dev server), it does **not** serve the
built `dist/` folder. To preview the build, point any static file server at it:
```bash
python -m http.server 3000 --directory dist
```

### 5.5 Alternative: Run on Mobile
```bash
yarn ios            # iOS Simulator (macOS only)
yarn android        # Android Emulator
```

There is no per-platform URL rewriting — the Android emulator uses whatever
`EXPO_PUBLIC_BACKEND_URL` says. Since `localhost` inside the emulator is the
emulator itself, set `EXPO_PUBLIC_BACKEND_URL=http://10.0.2.2:8001` to reach a
backend running on the host machine.

---

## Step 6: Create an Admin User (Optional)

There is no admin registration UI. The first admin is created through a one-time
bootstrap endpoint, which is deliberately hard to reach. Read 6.1 before running
the curl — the endpoint refuses the secret shipped in this repo.

### 6.1 Set a real `ADMIN_SECRET` first

The secret goes in the **`x-admin-secret` request header**, not in a query
parameter, and it is compared against the `ADMIN_SECRET` environment variable.

If `ADMIN_SECRET` is still the built-in repo default (`tefilah-admin-secret-2024`)
**and** the environment looks like production, the endpoint fails closed and
returns `403` to *every* caller — including one that presents the correct default.
The default value is published in this repository, so it is treated as no secret
at all.

"Looks like production" is true when any of these hold:

- `DB_BACKEND` is set to anything other than `mongo`
- `RAILWAY_ENVIRONMENT` or `PRODUCTION` is set
- `MONGO_URL` is a `mongodb+srv://` URL, or points at any host other than `localhost` / `127.0.0.1`

⚠️ **The committed `backend/.env` points at the production Atlas cluster
(`mongodb+srv://...`), so an ordinary developer laptop already counts as
production** — the bootstrap endpoint returns 403 locally too until you change
one of the two things below.

```bash
# Option A (recommended) — use a real secret, works in any environment.
# 1. Generate one:
python -c "import secrets; print(secrets.token_urlsafe(32))"
# 2. Put it in backend/.env as:  ADMIN_SECRET=<the generated value>

# Option B — make the machine look like a laptop again, so the default is accepted.
# In backend/.env, point Mongo at a local server and leave DB_BACKEND unset (or 'mongo'):
#   MONGO_URL=mongodb://localhost:27017
#   DB_NAME=tefilah_test
```

Restart the backend after editing `.env` — both values are read once at import.

### 6.2 Create the admin

```bash
curl -X POST "http://localhost:8001/api/admin/create-first-admin" \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: <your ADMIN_SECRET value>" \
  -d "{\"name\": \"Admin\", \"email\": \"admin@tefilah.local\", \"password\": \"admin123\"}"
```

**On Windows PowerShell:**
```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:8001/api/admin/create-first-admin" -Headers @{ "x-admin-secret" = "<your ADMIN_SECRET value>" } -ContentType "application/json" -Body '{"name": "Admin", "email": "admin@tefilah.local", "password": "admin123"}'
```

### 6.3 Responses you may hit

| Status | Meaning |
|--------|---------|
| `200` | Admin created. The response contains an `access_token` valid for 4 hours. |
| `403 Invalid admin secret` | Wrong or missing header, **or** the bootstrap is disabled because `ADMIN_SECRET` is still the repo default on a production-looking environment. The two cases are deliberately indistinguishable to the caller — check the backend startup log, which prints `🚨 ADMIN_SECRET is the built-in default on a production deployment` when the endpoint is disabled. |
| `409 Admin already exists` | One-time endpoint. Use the admin invite flow instead. |
| `429 Too many attempts` | Throttled to **3 attempts per IP per 60-second window**. Wait a minute and retry. |

Then log in through the app's admin login page.

---

## Quick Start (All Services)

Open 3 terminals and run in order:

**Terminal 1 - MongoDB** (skip if running as a service):
```bash
mongod
```

**Terminal 2 - Backend:**
```bash
cd backend
venv\Scripts\activate
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

**Terminal 3 - Frontend:**
```bash
cd frontend
yarn dev
```

**Optional Terminal 4 - Ollama** (only if `LLM_PROVIDER=ollama`, and skip if already running):
```bash
ollama serve
```

---

## Testing the Complete Flow

### User Registration & Verification
1. Open http://localhost:8081 in your browser
2. Click "Get Started" on the landing page
3. Click "Create Account"
4. Fill in name, email, password (step 1 and step 2)
5. After signup, you'll land on the verification screen
6. Read the 6-digit code from the email sent by `SENDER_EMAIL` via Resend. With no
   `RESEND_API_KEY` set, no email is sent and the code is not logged — you will
   have to read `verification_code` off the user document in the database
7. Enter the code on the verification screen
8. You're in! You'll see the home screen

### Submit a Prayer
1. From the home screen, tap "Submit a Prayer"
2. Write your prayer request (minimum 10 characters)
3. Optionally toggle anonymous mode and add location
4. Tap "Submit Prayer Request"
5. Wait for the response (5-30 seconds with Ollama, instant without)
6. You'll see a personalized comfort message and Bible verse

### Partner (Prayer Agent) Flow
1. From the landing page, tap "Prayer Partner" (or "Agent Login")
2. Sign up as a partner with city and country
3. After registration, you'll see the partner dashboard
4. Prayer requests assigned to your cell will appear here

### Admin Dashboard
1. Create an admin user first (see Step 6 above)
2. Navigate to admin login from the landing page
3. Log in with your admin credentials
4. View stats, manage users, partners, and prayer requests

---

## Ports Summary

| Service        | Port  | URL                          | Purpose                    |
|----------------|-------|------------------------------|----------------------------|
| Frontend (dev) | 8081  | http://localhost:8081         | Web app                    |
| Frontend (prod)| any   | -                            | Built static files in `dist/`, served by a static server of your choice |
| Backend API    | 8001  | http://localhost:8001/api/    | REST API                   |
| MongoDB        | 27017 | mongodb://localhost:27017     | Database                   |
| Ollama         | 11434 | http://localhost:11434        | Local LLM API (only when `LLM_PROVIDER=ollama`) |

Email has no local port — it goes out over HTTPS to the Resend API.

---

## Troubleshooting

### "Verification Failed" error
- Make sure the backend is running (`uvicorn server:app ...`)
- Check that MongoDB is running
- Look at the backend terminal for error messages
- The OTP code expires after 24 hours

### Prayer submission is slow or times out
- If Ollama is running, the first request loads the model (~30-60s)
- If Ollama is NOT running, fallback messages are used (instant)
- Backend Ollama timeout is 30 seconds; frontend timeout is 60 seconds

### Emails not arriving
- Check backend `.env` has a valid `RESEND_API_KEY`. If it is empty the backend
  logs `RESEND_API_KEY not set - skipping email to ...` and sends nothing
- Look at the backend terminal for `Verification email sent to ...`
- The sending domain must be verified in Resend, and `SENDER_EMAIL` must be on it
- There is no MailHog/SMTP path any more — the backend only speaks the Resend HTTP API

### MongoDB connection error
- Verify MongoDB is running: `mongosh --eval "db.adminCommand('ping')"`
- Check backend `.env` has `MONGO_URL=mongodb://localhost:27017`

### Frontend can't reach backend (Network Error)
- Verify backend is running on port 8001
- Check frontend `.env` has `EXPO_PUBLIC_BACKEND_URL=http://localhost:8001`
- For web: check browser console for CORS errors (shouldn't happen - CORS is open)

### "Module not found" errors in backend
- Make sure the virtual environment is activated
- Run `pip install -r requirements.txt` again

### Ollama model not found
- Run `ollama pull deepseek-r1:8b` and wait for download to complete
- Verify with `ollama list`
