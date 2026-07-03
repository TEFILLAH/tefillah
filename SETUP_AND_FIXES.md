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

3. **Dark/Light Toggle Overlapping Logo**
   - Fixed in `login.tsx`, `signup.tsx`, `verify.tsx`
   - Moved ThemeToggle from `position: absolute` floating overlay into the header row as a proper flex child
   - Toggle is now always to the right of the logo, no overlap possible

---

## Prerequisites

- **Python 3.11+**
- **Node.js 18+** + **Yarn**
- **MongoDB** running on port 27017
- **Ollama** running with `deepseek-r1:8b` model
- **MailHog** (optional, for email testing)

---

## Quick Start

### 1. Start MongoDB
```bash
# Using Docker (easiest):
docker run -d -p 27017:27017 --name mongodb mongo:latest

# Or start local mongod:
mongod --dbpath /data/db
```

### 2. Start Ollama
```bash
# If not already installed: https://ollama.com/download
ollama pull deepseek-r1:8b   # first time only
ollama serve                  # starts the LLM server
```

### 3. Start MailHog (for email verification)
```bash
# Using Docker:
docker run -d -p 1025:1025 -p 8025:8025 mailhog/mailhog

# View emails at: http://localhost:8025
```

### 4. Start Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt

# .env is already configured - just run:
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

### 5. Create First Admin Account
```bash
curl -X POST "http://localhost:8001/api/admin/create-first-admin?admin_secret=tefilah-admin-secret-2024" \
  -H "Content-Type: application/json" \
  -d '{"name": "Admin", "email": "admin@tefilah.com", "password": "admin123"}'
```

### 6. Start Frontend
```bash
cd frontend
yarn install
yarn dev          # Opens at http://localhost:8081 (Expo web)

# OR build and serve:
yarn build
yarn start        # Serves built app at http://localhost:3000
```

---

## Testing Login Flow

### Regular User
1. Go to http://localhost:8081
2. Click "Create Account"  
3. Fill in details and register
4. Check MailHog (http://localhost:8025) for verification code
5. Enter the 6-digit code on the verify screen
6. You're logged in!

### Prayer Partner
1. Click "Prayer Partner" on the landing page
2. Register with location details
3. Verify email via MailHog
4. Partner dashboard at `/(partner)/dashboard`

### Admin
1. Go to `/admin-login` route
2. Use credentials from step 5 above

---

## Important Notes

- **Verification codes are also logged in the backend console** (look for `Verification code for email@test.com: 123456`) - useful if MailHog is not running
- The **LLM (Ollama) is optional** - if it's not running, the app uses fallback Bible verses and comfort messages
- For **production deployment**, update `EXPO_PUBLIC_BACKEND_URL` in `frontend/.env` to your backend URL

---

## Troubleshooting

**"Invalid email or password" on login:**
- Make sure you're using the right login screen (user vs partner vs admin have separate screens)
- Check MongoDB is running: `mongosh --eval "db.adminCommand('ping')"`

**Email codes not received:**
- Check MailHog UI at http://localhost:8025
- Or check backend console log - verification codes are printed there

**Ollama timeout:**
- Ollama can be slow on first inference. Wait for it or the app will use fallback messages
- Check: `curl http://localhost:11434/api/generate -d '{"model":"deepseek-r1:8b","prompt":"hi"}'`

**ThemeToggle still overlapping:**
- Hard refresh the browser (Ctrl+Shift+R)
- Clear Expo cache: `yarn dev --clear`
