# Deploying tefillah-web to tefillah.in

This is a Vite + React SPA. Same backend as the mobile app and admin panel
(`api.tefillah.in`). No backend change is required — CORS already lists
`https://tefillah.in` and `https://www.tefillah.in`.

## Production build

```bash
cd tefillah-web
npm install
npm run build
```

Output: `tefillah-web/dist/` (~110 kB gzip JS + 6 kB gzip CSS).

## Pick a host

Both options below ship the SPA with the security headers in place
(`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Strict-Transport-Security`,
a tight `Content-Security-Policy`, and a `Permissions-Policy`).

### Option A — Vercel

1. From the repo root: `npx vercel link` (sign in once).
2. From `tefillah-web/`: `npx vercel --prod`.
3. In the Vercel dashboard, add a custom domain `tefillah.in` (and
   `www.tefillah.in` redirect → `tefillah.in`).
4. Update DNS to point `tefillah.in` to Vercel (`A` 76.76.21.21 or use the
   nameservers Vercel suggests).

The repo includes a `vercel.json` that wires SPA rewrites and the security
headers — no extra config in the dashboard is needed.

### Option B — Cloudflare Pages

1. Connect the GitHub/GitLab repo in the Cloudflare Pages dashboard.
2. Build command: `npm run build`. Output directory: `dist`. Root: `tefillah-web`.
3. Add a custom domain `tefillah.in` in the Pages project settings.

`public/_headers` and `public/_redirects` are committed and Cloudflare picks
them up automatically.

## DNS

Whichever host you pick, point these records at it:

| Host          | Type | Target                          |
| ------------- | ---- | ------------------------------- |
| `tefillah.in` | A    | (host's apex IP)                |
| `www`         | CNAME| `tefillah.in`                   |

Existing records to leave alone:
- `api.tefillah.in` → AWS Elastic Beanstalk (the FastAPI backend).
- `admin.tefillah.in` → wherever the admin panel is deployed.

## Smoke test the live site

```bash
# Headers
curl -sI https://tefillah.in | grep -E "Strict-Transport|Content-Security|X-Frame"

# Health (round-trips to the API)
curl -s https://api.tefillah.in/api/health
```

## Rollback

Both Vercel and Cloudflare Pages keep every deployment immutably. To roll back,
re-promote the previous deployment from the dashboard — no redeploy required.
