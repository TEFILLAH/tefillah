# Deploying tefillah-web to tefillah.in

Vite + React SPA (public site + `/admin` panel). Same FastAPI backend as the
mobile app.

## ⚠️ The ONLY correct way to deploy

```bash
cd tefillah-web
bash deploy-web.sh
```

That script does everything safely: fresh build, uploads content-hashed
`/assets/*` with a 1-year immutable `Cache-Control`, uploads `index.html` +
`firebase-messaging-sw.js` with `no-cache`, invalidates only the revalidate
paths, and — crucially — **never runs `s3 sync --delete`** (see "Pitfalls").

> If `npm run build` fails with `EPERM ... lstat 'D:\'` on this machine, run
> `cmd //c "subst B: D:\tefilah-fixed\tefilah-fixed"` and deploy from
> `/b/tefillah-web`.

## The real production stack (do NOT change these)

| Piece | Value |
|---|---|
| Origin | S3 bucket **`tefillah-web-prod`** (region `ap-south-1`) |
| CDN | CloudFront distribution **`E20DJ1IDF5M5MD`** → `tefillah.in` |
| DNS | Route 53 A/AAAA **ALIAS** records → the CloudFront distribution |
| SPA routing | CloudFront custom error responses map 403/404 → `/index.html` (200) — verified live for `/signup`, `/admin/login`, unknown paths |
| Rollback | S3 **Object Versioning** is enabled — restore a previous object version |

**There is no Vercel and no Cloudflare Pages deployment.** Never run
`npx vercel --prod`, and never repoint the `tefillah.in` apex A record away from
CloudFront — doing so instantly takes the live site, admin panel, and web push
offline. `vercel.json`, `public/_headers`, and `public/_redirects` are dead
artifacts from an old plan (the deploy script excludes them from upload); they
have no effect on S3/CloudFront (response headers come from the CloudFront
response-headers policy).

**DNS records that must NEVER be touched:** the Resend `send.tefillah.in`
records and the Google Workspace MX records.

## One-time cache repair (if assets ever lost their header)

If a bare `s3 sync` was run in the past, the hashed assets may be missing their
`Cache-Control`. Repair the objects already in the bucket without redeploying:

```bash
bash deploy-web.sh --repair-cache
```

## Pitfalls this pipeline avoids

- **`--delete` at deploy time** removes the previous build's hashed chunks the
  moment the new build lands. A user who loaded the site earlier and then opens
  a lazy route (`/admin` → `AdminApp-<hash>.js`) requests a now-deleted chunk →
  the SPA rewrite serves `index.html` as JS → white-screen crash. We upload
  assets additively and prune old chunks later via an S3 lifecycle rule on
  noncurrent versions.
- **No `Cache-Control` on hashed assets** makes every visitor re-validate the
  ~600 KB bundle on every visit. The script sets `immutable`, safe because the
  filenames are content-hashed.
- **Deploying a stale local `dist/`** silently rolls production back. The script
  always rebuilds from source first.

## Backend deploy

The backend is separate: from the repo root run `bash deploy-backend.sh` (it
rebuilds, md5-verifies the bundle, uploads, and health-polls the
`tefillah-api-prod-v2` Elastic Beanstalk environment automatically). Do not
hand-zip or `eb deploy` manually — that bypasses the safety gates.
