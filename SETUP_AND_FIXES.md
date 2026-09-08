# Tefilah - Fixed App Setup Guide

## What Was Fixed

### 🔧 Bug Fixes

1. **Login/Logout Not Working**
   - Fixed `resendVerification` backend endpoint - now accepts email in POST body (was only query param)
   - Fixed `agentAPI` client - was calling non-existent `/agent/` endpoints; now correctly calls `/partner/` endpoints
   - Fixed splash screen (`index.tsx`) - was checking `userType === 'agent'` but store uses `'partner'`

2. **Email / MailHog**
   - Fixed `SENDER_EMAIL` env var - backend now reads both `SENDER_EMAIL` and `SMTP_FROM_EMAIL`
   - Created proper `.env` files for both backend and frontend
   - *Superseded:* email has since moved to the Resend HTTP API. There is no SMTP
     code left, and `SMTP_FROM_EMAIL` / `SMTP_HOST` / `SMTP_PORT` are no longer read.

3. **Dark/Light Toggle Overlapping Logo**
   - Fixed in `login.tsx`, `signup.tsx`, `verify.tsx`
   - Moved ThemeToggle from `position: absolute` floating overlay into the header row as a proper flex child
   - Toggle is now always to the right of the logo, no overlap possible

---

## Prerequisites

- **Python 3.11+**
- **Node.js 18+** + **Yarn**
- **MongoDB** running on port 27017
- **A Gemini API key** (`LLM_PROVIDER` defaults to `gemini`) — or set `LLM_PROVIDER=ollama` and run Ollama with `deepseek-r1:8b`
- **A Resend API key** (optional; without it no email is sent)

---

## Quick Start

### 1. Start MongoDB
```bash
# Using Docker (easiest):
docker run -d -p 27017:27017 --name mongodb mongo:latest

# Or start local mongod:
mongod --dbpath /data/db
```

### 2. Start Ollama (only if `LLM_PROVIDER=ollama`)
```bash
# If not already installed: https://ollama.com/download
ollama pull deepseek-r1:8b   # first time only
ollama serve                  # starts the LLM server
```
The default provider is Gemini (`LLM_PROVIDER=gemini`, `GEMINI_API_KEY`). Skip this
step unless you switched to Ollama.

### 3. Email (no local service needed)
Email goes out through the **Resend HTTP API** — MailHog/SMTP was removed and the
backend no longer speaks SMTP. Set `RESEND_API_KEY` and `SENDER_EMAIL` in
`backend/.env` to receive real mail; leave `RESEND_API_KEY` empty and sending is
skipped with a `RESEND_API_KEY not set` warning.

### 4. Start Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt

uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```
⚠️ The committed `.env` points at the **production** Atlas cluster — override
`MONGO_URL`/`DB_NAME` before doing local work.

### 5. Create First Admin Account

The secret is sent as the **`x-admin-secret` header** (not a query parameter), and
the built-in default (`tefilah-admin-secret-2024`) is **refused** on anything that
looks like production — the endpoint 403s every caller in that case, even one
sending the correct default. Because the committed `backend/.env` points at the
production Atlas cluster (`mongodb+srv://...`), a local laptop counts as production
too, so do one of these first:

- **Set a real secret:** generate one with
  `python -c "import secrets; print(secrets.token_urlsafe(32))"` and put it in
  `backend/.env` as `ADMIN_SECRET=<value>`; or
- **Make the machine look local:** set `MONGO_URL=mongodb://localhost:27017` (and
  leave `DB_BACKEND` unset or `mongo`) in `backend/.env`.

Restart the backend afterwards, then:

```bash
curl -X POST "http://localhost:8001/api/admin/create-first-admin" \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: <your ADMIN_SECRET value>" \
  -d '{"name": "Admin", "email": "admin@tefilah.com", "password": "admin123"}'
```

Responses: `403` = wrong secret **or** bootstrap disabled (check the backend log for
`🚨 ADMIN_SECRET is the built-in default`), `409` = an admin already exists (one-time
endpoint), `429` = rate limited to 3 attempts per IP per 60 seconds.

### 6. Start Frontend
```bash
cd frontend
yarn install
yarn dev          # Opens at http://localhost:8081 (Expo web)

# OR build a static bundle (yarn start runs `expo start`, it does NOT serve dist/):
yarn build                                  # -> dist/
python -m http.server 3000 --directory dist # preview it on http://localhost:3000
```

---

## Testing Login Flow

### Regular User
1. Go to http://localhost:8081
2. Click "Create Account"  
3. Fill in details and register
4. Get the verification code from the Resend email (or read `verification_code` off
   the user document if `RESEND_API_KEY` is unset)
5. Enter the 6-digit code on the verify screen
6. You're logged in!

### Prayer Partner
1. Click "Prayer Partner" on the landing page
2. Register with location details
3. Verify email the same way as above
4. Partner dashboard at `/(partner)/dashboard`

### Admin
1. Go to `/admin-login` route
2. Use credentials from step 5 above

---

## Important Notes

- **Verification codes are NOT logged to the backend console.** The backend only logs
  `Verification email sent to <address>` — the code itself never reaches the log. With
  no `RESEND_API_KEY` set, the only place to read it is the `verification_code` field
  on the user document
- The **LLM is optional** - if the configured provider is unreachable, the app uses fallback Bible verses and comfort messages
- For **production deployment**, update `EXPO_PUBLIC_BACKEND_URL` in `frontend/.env` to your backend URL. If it is unset, the client falls back to the live API at `https://api.tefillah.in`

---

## Troubleshooting

**"Invalid email or password" on login:**
- Make sure you're using the right login screen (user vs partner vs admin have separate screens)
- Check MongoDB is running: `mongosh --eval "db.adminCommand('ping')"`

**Email codes not received:**
- Check `RESEND_API_KEY` is set in `backend/.env`; when empty the backend logs
  `RESEND_API_KEY not set - skipping email to ...` and sends nothing
- Check the sending domain is verified in Resend and `SENDER_EMAIL` belongs to it
- The code is not printed to the console — read `verification_code` from the user
  document if you cannot receive mail

**Ollama timeout:**
- Ollama can be slow on first inference. Wait for it or the app will use fallback messages
- Check: `curl http://localhost:11434/api/generate -d '{"model":"deepseek-r1:8b","prompt":"hi"}'`

**ThemeToggle still overlapping:**
- Hard refresh the browser (Ctrl+Shift+R)
- Clear Expo cache: `yarn dev --clear`
