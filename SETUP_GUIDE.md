# TEFILAH - Complete Setup & Run Guide

A full-stack sacred prayer request platform with AI-powered comfort messages.

## Architecture Overview

```
Frontend (Expo/React Native)  -->  Backend (FastAPI/Python)  -->  MongoDB
                                        |
                                        +--> Ollama (Local LLM) - comfort messages & Bible verses
                                        +--> MailHog (Local SMTP) - email verification
```

| Component      | Technology                          | Default Port |
|----------------|-------------------------------------|--------------|
| Frontend       | Expo SDK 54, React Native, TypeScript | 8081         |
| Backend API    | FastAPI, Python 3.11+, Motor (async MongoDB) | 8001  |
| Database       | MongoDB                             | 27017        |
| Email (local)  | MailHog                             | SMTP: 1025, Web UI: 8025 |
| LLM (local)    | Ollama (deepseek-r1:8b)            | 11434        |

## Prerequisites

Install these before proceeding:

- **Python 3.11+** - https://www.python.org/downloads/
- **Node.js 18+** - https://nodejs.org/
- **Yarn** - `npm install -g yarn` (after Node.js is installed)
- **MongoDB Community Server** - https://www.mongodb.com/try/download/community
- **MailHog** - https://github.com/mailhog/MailHog/releases
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

## Step 2: Install & Start MailHog

MailHog is a local email testing tool. The backend sends verification emails to it.

### Windows
1. Download `MailHog_windows_amd64.exe` from https://github.com/mailhog/MailHog/releases
2. Place it somewhere convenient (e.g., `C:\Tools\MailHog_windows_amd64.exe`)
3. Run it:
   ```bash
   C:\Tools\MailHog_windows_amd64.exe
   ```
4. Keep this terminal window open

**MailHog provides:**
- SMTP server on `localhost:1025` (backend sends emails here)
- Web UI on http://localhost:8025 (open this in your browser to read emails)

### Verify
Open http://localhost:8025 in your browser. You should see the MailHog web interface (empty inbox).

---

## Step 3: Install & Start Ollama (Optional but Recommended)

Ollama runs a local AI model that generates personalized comfort messages and Bible verses for each prayer request. **The app works without Ollama** - it will use hardcoded fallback messages instead.

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
The `.env` file is already set up for local development. Verify it exists:
```bash
cat .env
```

If missing, copy from example:
```bash
cp .env.example .env
```

**Default `.env` values (no changes needed for local dev):**
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=tefilah
JWT_SECRET=tefilah-super-secret-key-change-in-production-2024
ADMIN_SECRET=tefilah-admin-secret-2024
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=deepseek-r1:8b
SMTP_HOST=localhost
SMTP_PORT=1025
SENDER_EMAIL=noreply@tefilah.local
```

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
  "message": "TEFILAH API - Sacred Prayer Platform",
  "status": "active",
  "version": "2.0",
  "llm": "Ollama (deepseek-r1:8b)"
}
```

---

## Step 5: Set Up the Frontend

### 5.1 Install Dependencies
```bash
cd frontend
yarn install
```

### 5.2 Configure Environment
The `.env` file should already exist. Verify:
```bash
cat .env
```

It should contain:
```
EXPO_PUBLIC_BACKEND_URL=http://localhost:8001
```

If missing: `cp .env.example .env`

### 5.3 Start the Frontend (Web)
```bash
yarn dev
```

This starts Expo development server. Press `w` if it doesn't auto-open the web browser, or open http://localhost:8081 manually.

### 5.4 Alternative: Build & Serve Static Files
```bash
yarn build          # Builds static web files into dist/
yarn start          # Serves the built files on http://localhost:3000
```

### 5.5 Alternative: Run on Mobile
```bash
yarn ios            # iOS Simulator (macOS only)
yarn android        # Android Emulator
```

For Android emulator, the backend URL auto-switches to `http://10.0.2.2:8001`.

---

## Step 6: Create an Admin User (Optional)

There is no admin registration UI. Create the first admin via API:

```bash
curl -X POST "http://localhost:8001/api/admin/create-first-admin?admin_secret=tefilah-admin-secret-2024" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"Admin\", \"email\": \"admin@tefilah.local\", \"password\": \"admin123\"}"
```

**On Windows PowerShell:**
```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:8001/api/admin/create-first-admin?admin_secret=tefilah-admin-secret-2024" -ContentType "application/json" -Body '{"name": "Admin", "email": "admin@tefilah.local", "password": "admin123"}'
```

Then log in through the app's admin login page.

---

## Quick Start (All Services)

Open 4 terminals and run in order:

**Terminal 1 - MongoDB** (skip if running as a service):
```bash
mongod
```

**Terminal 2 - MailHog:**
```bash
C:\Tools\MailHog_windows_amd64.exe
```

**Terminal 3 - Backend:**
```bash
cd backend
venv\Scripts\activate
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

**Terminal 4 - Frontend:**
```bash
cd frontend
yarn dev
```

**Optional Terminal 5 - Ollama** (skip if already running):
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
6. Open http://localhost:8025 (MailHog) in another tab
7. Find the email from `noreply@tefilah.local` - copy the 6-digit code
8. Enter the code on the verification screen
9. You're in! You'll see the home screen

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
| Frontend (prod)| 3000  | http://localhost:3000         | Built static files         |
| Backend API    | 8001  | http://localhost:8001/api/    | REST API                   |
| MongoDB        | 27017 | mongodb://localhost:27017     | Database                   |
| MailHog SMTP   | 1025  | -                            | Backend sends emails here  |
| MailHog Web UI | 8025  | http://localhost:8025         | View received emails       |
| Ollama         | 11434 | http://localhost:11434        | Local LLM API              |

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

### MailHog not receiving emails
- Verify MailHog is running (check http://localhost:8025)
- Check backend `.env` has `SMTP_HOST=localhost` and `SMTP_PORT=1025`
- Look at backend terminal for "Email sent to ..." log messages

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
