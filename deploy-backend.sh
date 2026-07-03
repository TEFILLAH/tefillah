#!/usr/bin/env bash
# Deploy the backend (tefillah-api-v4.zip) to Elastic Beanstalk.
# Requires the AWS CLI identity to have Elastic Beanstalk deploy permissions.
# Run from the repo root: bash deploy-backend.sh
#
# IMPORTANT: this script REBUILDS tefillah-api-v4.zip from the CURRENT
# backend/server.py on every run, then hard-verifies the packaged code before
# uploading. A previous version uploaded a prebuilt zip with no repackage step,
# which risked silently shipping stale code (e.g. reintroducing removed Twilio
# endpoints, dropping the v33 hardening). The md5 + Twilio gates below make that
# impossible: the deploy aborts unless the zip's server.py is byte-identical to
# backend/server.py and contains no Twilio references.
set -euo pipefail

REGION="ap-south-1"
APP="tefillah-api"
ENV="tefillah-api-prod-v2"
ZIP="tefillah-api-v4.zip"
STAGE="_eb_build"
LABEL="v33-security-hardening-$(date +%Y%m%d-%H%M%S)"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${REPO_ROOT}"

# --- Stage the CURRENT backend source into the bundle dir --------------------
# _eb_build/ already holds the correct Procfile, requirements.txt,
# firebase-credentials.json and .ebextensions/. We only refresh server.py from
# the live source so the bundle can never carry a stale server.py.
echo "==> Staging backend/server.py -> ${STAGE}/server.py"
cp "backend/server.py" "${STAGE}/server.py"

SRC_MD5="$(python -c "import hashlib;print(hashlib.md5(open('backend/server.py','rb').read()).hexdigest())")"
echo "    source backend/server.py md5=${SRC_MD5}"
if grep -qi "twilio" "${STAGE}/server.py"; then
  echo "FATAL: staged server.py still contains Twilio references — aborting deploy."; exit 1
fi

# --- Build the zip from the staged bundle (portable: no zip binary needed) ----
echo "==> Building ${ZIP} from ${STAGE}/"
python - "${STAGE}" "${ZIP}" <<'PYEOF'
import os, sys, zipfile
stage, out = sys.argv[1], sys.argv[2]
members = [
    "server.py",
    "Procfile",
    "requirements.txt",
    "firebase-credentials.json",
    ".ebextensions/01_health.config",
    ".ebextensions/02_nginx.config",
]
missing = [m for m in members if not os.path.isfile(os.path.join(stage, m))]
if missing:
    print("FATAL: bundle is missing files:", missing); sys.exit(1)
if os.path.exists(out):
    os.remove(out)
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for m in members:
        z.write(os.path.join(stage, m), m)
print("    wrote", out, "with", len(members), "files")
PYEOF

# --- Hard gate: the packaged server.py MUST equal the live source -------------
ZIP_MD5="$(python -c "import zipfile,hashlib;print(hashlib.md5(zipfile.ZipFile('${ZIP}').read('server.py')).hexdigest())")"
if [ "${ZIP_MD5}" != "${SRC_MD5}" ]; then
  echo "FATAL: ${ZIP} server.py md5 ${ZIP_MD5} != source ${SRC_MD5} — refusing to deploy a stale bundle."; exit 1
fi
echo "    ${ZIP} verified: server.py md5=${ZIP_MD5} (matches source, Twilio-free)"

# The EB application-versions S3 bucket for this account/region.
EB_BUCKET="elasticbeanstalk-${REGION}-$(aws sts get-caller-identity --query Account --output text)"
KEY="${APP}/${LABEL}.zip"

echo "==> Uploading bundle to ${EB_BUCKET}/${KEY}"
aws s3 cp "${ZIP}" "s3://${EB_BUCKET}/${KEY}" --region "${REGION}"

echo "==> Creating application version ${LABEL}"
aws elasticbeanstalk create-application-version \
  --region "${REGION}" \
  --application-name "${APP}" \
  --version-label "${LABEL}" \
  --source-bundle "S3Bucket=${EB_BUCKET},S3Key=${KEY}" \
  --process

echo "==> Waiting for the version to be processed"
sleep 8

echo "==> Updating environment ${ENV} to ${LABEL} (+ SENDER_EMAIL=admin@tefillah.in)"
aws elasticbeanstalk update-environment \
  --region "${REGION}" \
  --environment-name "${ENV}" \
  --version-label "${LABEL}" \
  --option-settings "Namespace=aws:elasticbeanstalk:application:environment,OptionName=SENDER_EMAIL,Value=admin@tefillah.in"

echo "==> Polling environment health until Ready"
for i in $(seq 1 40); do
  read -r STATUS HEALTH < <(aws elasticbeanstalk describe-environments \
    --region "${REGION}" --environment-names "${ENV}" \
    --query 'Environments[0].[Status,Health]' --output text)
  echo "    [$i] Status=${STATUS} Health=${HEALTH}"
  if [ "${STATUS}" = "Ready" ]; then break; fi
  sleep 15
done

echo "==> Smoke test"
curl -s --max-time 30 -o /dev/null -w "health: HTTP %{http_code}\n" https://api.tefillah.in/api/health
echo "Done."
