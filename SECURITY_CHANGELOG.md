# Tefillah Security Hardening — Changelog

Worked from `CLAUDE.md` (audit-driven brief). Each finding below maps to what
was actually done, with how it was verified. Backend changes are live on
`api.tefillah.in` (EB versions v5/v6 + JWT-secret rotation); web on `tefillah.in`;
app changes land in the next EAS build (`9110deba-…`).

Legend: ✅ done & verified · 🔁 verified already-correct · 🟡 partial/deferred · 📋 needs you (cloud)

---

## P0 — Critical

| VULN | Task | Status | Evidence |
|---|---|---|---|
| VULN-01 | TASK-1 disable docs | ✅ | `/docs` `/redoc` `/openapi.json` → **404** live (gated by `ENABLE_DOCS`, default off) |
| VULN-02 | TASK-2 admin bootstrap | ✅ | `create-first-admin` secret-gated + **409** once an admin exists; `seed-data` → super-admin only |
| VULN-03 | TASK-3 role authz | 🔁 | user token → `/admin/*` = **403**; partner token → `/admin/*` = **403** (role from verified JWT) |
| VULN-04 | TASK-4 JWT | ✅ | alg pinned (alg:none → **401**); now **requires exp/iat/user_id**; **secret rotated** to 86-char random — old/guessed secret → **401**, new → **200** |
| VULN-08 | TASK-5 LLM endpoint | 🟡 | model name removed from banner; rate-limited 10/IP. *Kept public* (your landing page needs it pre-login) — accepted tradeoff |
| VULN-09 | TASK-6 `/api` redirect | ✅ | was `307 → http://…elasticbeanstalk.com`; now **`https://api.tefillah.in/api/`** (host leak + downgrade both fixed) |

## P1 — High

| VULN | Task | Status | Evidence |
|---|---|---|---|
| VULN-05 | TASK-7 IDOR | 🔁 | `prayer/history`, `user/notifications`, `partner/requests` all scoped to `current_user._id` / `partner._id` |
| VULN-06 | TASK-8 mass assignment | 🔁 | register with `is_admin:true, role:admin, permissions:[all]` → created user is `is_admin=False, is_verified=False` (privileged fields not bindable; set server-side) |
| VULN-07 | TASK-9 rate-limit / enum | 🔁 | `/auth/login` IP-rate-limit + per-account lockout + uniform "Invalid email or password"; `/forgot-password` uniform "if an account exists…". *Residual:* register reveals email-taken (standard UX, rate-limited) |

## P2

| VULN | Task | Status | Evidence |
|---|---|---|---|
| VULN-10 | TASK-10 Firebase keys | 📋 | **needs you** — see checklist below (can't touch keys for you) |
| VULN-11 | TASK-11 guest-submit | 🔁 | content capped 10–2000 chars + sanitizer; rate-limit 3/IP; `is_anonymous` forced server-side; admin output auto-escaped (React) |
| VULN-13 | TASK-12 headers / CORS | ✅ | HSTS `preload`, CSP, X-Frame-Options:DENY, nosniff present; CORS is explicit allow-list (not reflected); dropped deprecated `X-XSS-Protection`; stripped `Server` |
| VULN-12 | TASK-13 deep link | 🟡 | reviewed — params don't drive auth in expo-router. *Recommend* keeping it that way; custom scheme retained for OAuth |
| VULN-14 | TASK-14 SYSTEM_ALERT_WINDOW | ✅ | added to `android.blockedPermissions` (stripped from merged manifest) — lands in build `9110deba` |
| VULN-18/24 | TASK-15 web bundle | ✅ | live bundle scanned — **zero secrets**; no `.map` served (only SPA fallback); dotfiles return harmless SPA fallback |

## P3

| VULN | Task | Status | Evidence |
|---|---|---|---|
| VULN-15 | TASK-16 allowBackup | ✅ | `android.allowBackup: false` — lands in build `9110deba` |
| VULN-16 | TASK-17 cert pinning | 🟡 | **deferred on purpose** — pinning a CloudFront-managed cert risks bricking the app on AWS cert rotation. cleartext-block recommended as the safe subset (see notes) |
| VULN-19 | TASK-18 excess perms | ✅ | removed `WRITE_EXTERNAL_STORAGE` — lands in build `9110deba` |
| VULN-20 | TASK-19 v3 signing | 🟡 | EAS + RN 0.81/modern AGP emit v2+v3 by default; verify with `apksigner verify -v` on the new build |
| VULN-22 | TASK-20 anti-tamper | 🟡 | Play Integrity + root/Frida detection is a separate workstream (backend + app) — roadmap item |
| VULN-23 | TASK-21 generic errors | ✅ | generic 500 handler added (no traceback); `debug=False` (FastAPI default) |

---

## 📋 Cloud actions that need you (I can't touch keys / risk live downtime)

### A. Firebase / Google key restriction (VULN-10 / TASK-10)
1. https://console.cloud.google.com/apis/credentials (project **tefillah-2283c**).
2. For **each** key (`AIzaSyBbPEpf…` and `AIzaSyA5rJHT3…`):
   - **Application restrictions** → **Android apps** → add package `com.tefilah.app` + your **release** signing SHA-256 (get it from `eas credentials` → Android → Keystore).
   - **API restrictions** → restrict to only: *Identity Toolkit API*, *Token Service API*, *Firebase Cloud Messaging API*.
3. **Firebase Console → App Check** → register the Android app (Play Integrity provider) → set **Enforce** on Identity Toolkit + FCM.
4. **Firestore/Storage rules** (Firebase Console → Rules): confirm there is **no** `allow read, write: if true`. If you use them, scope by `request.auth.uid`.
5. Confirm backend validates the Google `idToken` (`aud`/`iss`/signature) in `/auth/social/complete` — it already calls `firebase-admin`, which does this.

### B. Lock the raw EB URL (VULN-09 part 2 / TASK-6) — do in a maintenance window
I deliberately did **not** run this live (a wrong security-group edit takes the whole API down). Safe procedure:
1. EC2 → Security Groups → find the one on the `tefillah-api-prod-v2` load balancer / instance.
2. Add an inbound HTTP(80) rule sourced from the managed prefix list **`com.amazonaws.global.cloudfront.origin-facing`**.
3. **Test** `https://api.tefillah.in/api/health` still 200 (via CloudFront).
4. Only then remove the `0.0.0.0/0` inbound rule. Roll back instantly if health drops.

### C. App cleartext block (safe subset of TASK-17)
Add `expo-build-properties` with `android.usesCleartextTraffic: false` — blocks all plain HTTP in release. I held off because it can break a local-HTTP dev backend; tell me if you want it and I'll wire it with a dev/release split.

---

## Verified-good invariants left intact (§6)
Tokens still in `expo-secure-store`; all prod traffic HTTPS; no WebView/eval/weak-crypto introduced; only `MainActivity` exported; admin UI remains server-gated. None weakened.
