# TEFILLAH - Production Deployment Guide

## Table of Contents
1. [Local Setup](#local-setup)
2. [Environment Configuration](#environment-configuration)
3. [Backend Deployment](#backend-deployment)
4. [Frontend Web Deployment](#frontend-web-deployment)
5. [Android APK/AAB Build](#android-build)
6. [Security Checklist](#security-checklist)
7. [Final Production Checklist](#final-production-checklist)

---

## 1. Local Setup <a name="local-setup"></a>

### Prerequisites
- Node.js 18+ & npm/yarn
- Python 3.10+
- MongoDB 6+ (running locally or Atlas)
- Git

### Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env       # Edit .env with your values
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

### Frontend Setup
```bash
cd frontend
yarn install               # or npm install
cp .env.example .env       # Edit .env with your values
yarn dev                   # Starts Expo web dev server
```

### First Admin Setup
```bash
# After backend is running, create the first super admin:
curl -X POST "http://localhost:8001/api/admin/create-first-admin?admin_secret=YOUR_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"name": "Super Admin", "email": "admin@tefillah.in", "password": "your-strong-password"}'
```

---

## 2. Environment Configuration <a name="environment-configuration"></a>

### Backend (.env)
```env
# MongoDB - Use MongoDB Atlas for production
MONGO_URL=mongodb+srv://user:password@cluster.mongodb.net/tefilah
DB_NAME=tefilah

# JWT - Generate a strong random secret (64+ chars)
JWT_SECRET=generate-with: openssl rand -hex 64

# Admin Secret - Strong random string for first admin creation
ADMIN_SECRET=generate-with: openssl rand -hex 32

# LLM Provider
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=your-openrouter-key
OPENROUTER_MODEL=deepseek/deepseek-chat-v3-0324

# Email (Resend)
RESEND_API_KEY=your-resend-api-key
SENDER_EMAIL=admin@tefillah.in

# Firebase
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_WEB_API_KEY=your-firebase-web-api-key

# CORS - Your production domains
ALLOWED_ORIGINS=https://tefillah.in,https://www.tefillah.in,https://app.tefillah.in

# Rate Limiting
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=60
```

### Frontend (.env)
```env
EXPO_PUBLIC_BACKEND_URL=https://api.tefillah.in
EXPO_PUBLIC_FIREBASE_API_KEY=your-firebase-api-key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
EXPO_PUBLIC_FIREBASE_APP_ID=your-app-id
```

### Critical Security Notes
- NEVER commit .env files to git (already in .gitignore)
- Rotate all API keys before production launch
- Use MongoDB Atlas with IP whitelisting
- Use HTTPS everywhere in production
- Generate JWT_SECRET with: `openssl rand -hex 64`

---

## 3. Backend Deployment <a name="backend-deployment"></a>

### Option A: VPS/Cloud VM (Recommended)
```bash
# Install on Ubuntu/Debian
sudo apt update && sudo apt install python3-pip python3-venv nginx certbot

# Clone and setup
git clone <your-repo> /opt/tefilah
cd /opt/tefilah/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Create systemd service
sudo tee /etc/systemd/system/tefilah-api.service << 'EOF'
[Unit]
Description=Tefillah API
After=network.target

[Service]
User=www-data
WorkingDirectory=/opt/tefilah/backend
Environment="PATH=/opt/tefilah/backend/venv/bin"
ExecStart=/opt/tefilah/backend/venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001 --workers 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable tefilah-api
sudo systemctl start tefilah-api

# Nginx reverse proxy
sudo tee /etc/nginx/sites-available/tefilah-api << 'EOF'
server {
    server_name api.tefillah.in;

    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/tefilah-api /etc/nginx/sites-enabled/
sudo certbot --nginx -d api.tefillah.in
sudo systemctl restart nginx
```

### Option B: Docker
```dockerfile
# backend/Dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py .
EXPOSE 8001
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2"]
```

---

## 4. Frontend Web Deployment <a name="frontend-web-deployment"></a>

### Build for Web
```bash
cd frontend
yarn build    # Creates dist/ folder with static files
```

### Deploy Static Files
Host the `dist/` folder on any static hosting:
- **Vercel**: `vercel deploy --prod`
- **Netlify**: Drag & drop `dist/` folder
- **Nginx**: Copy `dist/` to `/var/www/tefillah/` and configure

### Nginx Config for Frontend
```nginx
server {
    server_name tefillah.in www.tefillah.in;
    root /var/www/tefillah/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 5. Android APK/AAB Build <a name="android-build"></a>

### Prerequisites
- EAS CLI: `npm install -g eas-cli`
- Expo account: `eas login`

### Step 1: Configure
```bash
cd frontend
# Ensure app.json has correct package name, version, permissions
# Ensure eas.json is configured (already done)
```

### Step 2: Build Preview APK (for testing)
```bash
eas build --platform android --profile preview
# This produces a .apk file for direct installation
```

### Step 3: Build Production AAB (for Play Store)
```bash
eas build --platform android --profile production
# This produces a .aab file for Google Play upload
```

### Step 4: App Signing
EAS Build handles app signing automatically:
- First build creates a new keystore (managed by Expo)
- Subsequent builds use the same keystore
- To use your own keystore: `eas credentials`

### Step 5: Test Before Upload
1. Download the APK from EAS build dashboard
2. Install on physical device: `adb install app.apk`
3. Test all flows: registration, login, prayer submission, etc.
4. Test on multiple Android versions (API 24+)

### Step 6: Play Store Upload
1. Go to Google Play Console
2. Create new app listing
3. Upload the .aab file to Internal Testing track first
4. Complete store listing (screenshots, description, privacy policy URL)
5. Privacy Policy URL: https://tefillah.in/privacy-policy
6. Promote to Production after testing

---

## 6. Security Checklist <a name="security-checklist"></a>

### Before Production Launch
- [ ] Generate new JWT_SECRET (64+ char random string)
- [ ] Generate new ADMIN_SECRET
- [ ] Rotate all API keys (OpenRouter, Resend, Firebase)
- [ ] Remove .env from git history: `git filter-branch`
- [ ] Set CORS to only allow production domains
- [ ] Enable HTTPS on all endpoints
- [ ] Set up MongoDB authentication & IP whitelist
- [ ] Verify rate limiting is working
- [ ] Test password reset flow end-to-end
- [ ] Verify admin hierarchy (super admin / regular admin)
- [ ] Check that export endpoints require super admin
- [ ] Review all error messages (no sensitive data leaked)
- [ ] Set up log rotation to prevent disk fill
- [ ] Configure backup for MongoDB database

### Ongoing Security
- Rotate API keys quarterly
- Monitor activity logs for suspicious behavior
- Keep dependencies updated
- Review admin access periodically

---

## 7. Final Production Checklist <a name="final-production-checklist"></a>

### Application Stability
- [ ] No crashes or runtime errors on any screen
- [ ] All pages load correctly with proper loading states
- [ ] Error boundary catches and displays unexpected errors
- [ ] Network errors show user-friendly messages

### Authentication
- [ ] User registration + email verification works
- [ ] User login/logout works
- [ ] Partner registration + login works
- [ ] Admin login works
- [ ] Google Sign-In works (web & Android)
- [ ] Forgot password flow works end-to-end
- [ ] Change password works for logged-in users
- [ ] Session persists across app restarts

### Admin System
- [ ] Super Admin can create/remove other admins
- [ ] Regular admins cannot create other admins
- [ ] All admin dashboard sections work (stats, users, partners, prayers)
- [ ] Prayer assignment to partners works correctly
- [ ] Partner capacity limits are enforced
- [ ] Data export requires super admin access

### Prayer System
- [ ] Prayer submission works (authenticated users)
- [ ] Guest prayer submission works
- [ ] LLM generates comfort messages and categories
- [ ] Prayer history shows correctly
- [ ] Partners can view and mark prayers as prayed
- [ ] Admin can assign/unassign prayers

### UI & UX
- [ ] Dark and light themes work correctly
- [ ] All 3 languages display properly (EN, HI, TE)
- [ ] All forms validate inputs correctly
- [ ] All buttons have loading states
- [ ] Legal pages (Terms, Privacy, Guidelines) accessible from menu

### Android Build
- [ ] APK builds successfully
- [ ] App installs and runs on physical device
- [ ] All permissions requested appropriately
- [ ] App works offline-tolerant (shows proper error messages)

### Deployment
- [ ] Backend deployed with HTTPS
- [ ] Frontend deployed with HTTPS
- [ ] MongoDB configured with auth and backups
- [ ] CORS configured for production domains only
- [ ] Environment variables set correctly
- [ ] Monitoring and logging configured
