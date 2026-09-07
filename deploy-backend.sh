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
LABEL="v34-dynamodb-repo-layer-$(date +%Y%m%d-%H%M%S)"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${REPO_ROOT}"

# --- Stage the CURRENT backend source into the bundle dir --------------------
# _eb_build/ already holds the correct Procfile, requirements.txt,
# firebase-credentials.json and .ebextensions/. We only refresh server.py from
# the live source so the bundle can never carry a stale server.py.
echo "==> Staging backend/server.py -> ${STAGE}/server.py"
cp "backend/server.py" "${STAGE}/server.py"

# server.py now does `from repo import make_repos` AT IMPORT TIME, so the repo/
# package must ship with it. Without this the app dies on startup with
# ImportError and the environment goes red -- there is no partial-failure mode.
# requirements.txt is tracked in backend/; _eb_build/ is gitignored, so the
# bundle copy is NOT a source of truth and must be refreshed from the repo.
echo "==> Staging backend/requirements.txt -> ${STAGE}/requirements.txt"
cp "backend/requirements.txt" "${STAGE}/requirements.txt"

echo "==> Staging backend/repo/ -> ${STAGE}/repo/"
rm -rf "${STAGE}/repo"
mkdir -p "${STAGE}/repo"
cp backend/repo/*.py "${STAGE}/repo/"
ls -1 "${STAGE}/repo/"

# repo/dynamo.py does `from migration import table_spec` at import time: table
# names, keys and GSI names are defined there and nowhere else, so it is a
# RUNTIME dependency of the adapter, not migration-only tooling. Omitting it
# means the app boots fine on mongo and dies the instant DB_BACKEND=dynamo --
# which is exactly how it took an instance down on 2026-09-07.
echo "==> Staging backend/migration/table_spec.py -> ${STAGE}/migration/"
rm -rf "${STAGE}/migration"
mkdir -p "${STAGE}/migration"
cp backend/migration/table_spec.py "${STAGE}/migration/"

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
    # The repository layer. server.py imports this at module scope, so omitting
    # it ships an app that cannot start.
    "repo/__init__.py",
    "repo/mongo.py",
    "repo/dynamo.py",
    # runtime dependency of repo/dynamo.py -- see the staging comment above
    "migration/table_spec.py",
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

# --- Hard gate: the repo/ package must be present AND match source -----------
# Same reasoning as the server.py gate above. A bundle missing repo/ starts,
# fails on `from repo import make_repos`, and takes the environment down.
python - "${ZIP}" <<'PYEOF'
import hashlib, sys, zipfile
from pathlib import Path
zf = zipfile.ZipFile(sys.argv[1])
packaged = set(zf.namelist())
bad = []
for src in sorted(Path("backend/repo").glob("*.py")):
    member = f"repo/{src.name}"
    if member not in packaged:
        bad.append(f"{member} MISSING from bundle")
        continue
    a = hashlib.md5(src.read_bytes()).hexdigest()
    b = hashlib.md5(zf.read(member)).hexdigest()
    if a != b:
        bad.append(f"{member} md5 {b} != source {a}")
    else:
        print(f"    {member} verified md5={a}")
if bad:
    print("FATAL: repo/ package gate failed:")
    for line in bad:
        print("   ", line)
    sys.exit(1)
PYEOF

# --- Hard gate: the bundle must IMPORT under BOTH backends -------------------
# The mongo path never imports repo/dynamo.py, so a bundle can boot perfectly on
# mongo and die the instant DB_BACKEND=dynamo. That is not hypothetical: it took
# an instance down on 2026-09-07 (ModuleNotFoundError: 'migration'), because a
# mongo-only smoke test had passed. Both paths are checked here, from the
# EXTRACTED BUNDLE, which is the only layout that proves what EB will run.
echo "==> Gate: importing the bundle under DB_BACKEND=mongo and =dynamo"
python - "${ZIP}" <<'PYEOF'
import os, subprocess, sys, tempfile, textwrap, zipfile
from pathlib import Path

zip_path = Path(sys.argv[1]).resolve()
env_file = Path("backend/.env").resolve()
tmp = Path(tempfile.mkdtemp(prefix="ebgate_"))
zipfile.ZipFile(zip_path).extractall(tmp)

probe = textwrap.dedent("""
    import os, sys, warnings
    from pathlib import Path
    warnings.filterwarnings("ignore")
    for line in Path(sys.argv[1]).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    os.environ["DB_NAME"] = "tefilah_test"      # never prod for an import probe
    os.environ.pop("PRODUCTION", None)
    os.environ["DB_BACKEND"] = sys.argv[2]
    os.environ.setdefault("AWS_DEFAULT_REGION", "ap-south-1")
    sys.path.insert(0, os.getcwd())
    import server
    assert server.repos.backend == sys.argv[2], server.repos.backend
    print("   ", sys.argv[2], "OK -", len([n for n in vars(server.repos)
                                           if not n.startswith("_")]), "repos")
""")
(tmp / "_probe.py").write_text(probe, encoding="utf-8")

failed = False
for backend in ("mongo", "dynamo"):
    # MUST be the verified venv: the system python has an incompatible
    # Starlette and cannot import the app, which would fail this gate for
    # entirely the wrong reason.
    venv_py = Path("backend/.venv/Scripts/python.exe").resolve()
    if not venv_py.exists():
        venv_py = Path("backend/.venv/bin/python").resolve()
    r = subprocess.run([str(venv_py), "_probe.py", str(env_file), backend],
                       cwd=tmp, capture_output=True, text=True, timeout=180)
    if r.returncode != 0:
        failed = True
        print(f"    {backend} FAILED:")
        print("      " + (r.stderr or r.stdout).strip().splitlines()[-1])
    else:
        print(r.stdout.strip())
if failed:
    print("FATAL: bundle does not import under both backends — refusing to deploy.")
    sys.exit(1)
PYEOF

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
