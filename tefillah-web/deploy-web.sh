#!/usr/bin/env bash
# Deploy the Tefillah web app (public site + /admin) to S3 + CloudFront.
# Run from tefillah-web/:  bash deploy-web.sh
#
# WHY THIS SCRIPT EXISTS (do not go back to a bare `aws s3 sync dist/ --delete`):
#  1. A bare sync with NO --cache-control strips the immutable header off the
#     content-hashed /assets/* files, so every visitor re-validates the ~600 KB
#     bundle on every visit. This script sets the right header per file class.
#  2. `--delete` removes the PREVIOUS build's hashed chunks the instant the new
#     build lands. Anyone who loaded the site before the deploy and then hits a
#     lazy route (e.g. /admin -> AdminApp-<hash>.js) requests a chunk that no
#     longer exists -> the SPA rewrite serves index.html as JS -> white screen.
#     So we upload assets ADDITIVELY (no --delete) and only prune old chunks in a
#     separate, time-delayed cleanup step. S3 Object Versioning is on for rollback.
#  3. Deploying a stale local dist/ silently rolls production back. We always
#     rebuild fresh from source first.
#
# NOTE (this machine): if `npm run build` dies with "EPERM ... lstat 'D:\'",
# map the project to a drive with:  cmd //c "subst B: D:\tefilah-fixed\tefilah-fixed"
# then run this script from /b/tefillah-web instead of D:.
set -euo pipefail

BUCKET="tefillah-web-prod"
DIST_ID="E20DJ1IDF5M5MD"
REGION="ap-south-1"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${REPO_ROOT}"

if [ "${1:-}" = "--repair-cache" ]; then
  # One-time repair of objects ALREADY in the bucket that lost their Cache-Control.
  echo "==> Repairing Cache-Control on existing /assets/* objects"
  aws s3 cp "s3://${BUCKET}/assets/" "s3://${BUCKET}/assets/" --recursive \
    --metadata-directive REPLACE \
    --cache-control 'public, max-age=31536000, immutable' --region "${REGION}"
  aws cloudfront create-invalidation --distribution-id "${DIST_ID}" --paths '/assets/*'
  echo "Done. Re-run without --repair-cache to deploy a new build."
  exit 0
fi

# --- 1. Fresh build (never ship a stale dist/) ------------------------------
echo "==> Clean build"
rm -rf dist
npm run build

if [ ! -f dist/index.html ]; then
  echo "FATAL: dist/index.html missing after build — aborting."; exit 1
fi

# --- 2. Upload hashed assets FIRST, additively (no --delete), cache 1 year --
echo "==> Uploading /assets (immutable, additive)"
aws s3 sync dist/assets "s3://${BUCKET}/assets" \
  --cache-control 'public, max-age=31536000, immutable' --region "${REGION}"

# --- 3. Upload the rest of dist (excluding assets + the must-revalidate files)
echo "==> Uploading remaining static files"
aws s3 sync dist "s3://${BUCKET}" \
  --exclude 'assets/*' --exclude 'index.html' --exclude 'firebase-messaging-sw.js' \
  --exclude '_headers' --exclude '_redirects' \
  --cache-control 'public, max-age=3600' --region "${REGION}"

# --- 4. HTML + service worker: must always revalidate ------------------------
echo "==> Uploading index.html + service worker (no-cache)"
aws s3 cp dist/index.html "s3://${BUCKET}/index.html" \
  --cache-control 'no-cache, no-store, must-revalidate' \
  --content-type 'text/html' --region "${REGION}"
if [ -f dist/firebase-messaging-sw.js ]; then
  aws s3 cp dist/firebase-messaging-sw.js "s3://${BUCKET}/firebase-messaging-sw.js" \
    --cache-control 'no-cache, no-store, must-revalidate' \
    --content-type 'application/javascript' --region "${REGION}"
fi

# --- 5. Invalidate ONLY the always-revalidate paths (old hashed chunks stay
#         valid at the edge for users mid-session) ----------------------------
echo "==> CloudFront invalidation"
aws cloudfront create-invalidation --distribution-id "${DIST_ID}" \
  --paths '/' '/index.html' '/firebase-messaging-sw.js'

echo "==> Smoke test"
for p in "" "signup" "admin/login"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://tefillah.in/${p}")
  echo "    https://tefillah.in/${p} -> ${code}"
done
echo "Done. (To garbage-collect asset chunks older than ~30 days, use an S3"
echo " lifecycle rule on noncurrent versions — never --delete at deploy time.)"
