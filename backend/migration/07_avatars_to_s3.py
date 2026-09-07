"""
Phase 7 -- move the legacy Mongo `avatars` blobs to S3.

`avatars` is in table_spec.EXCLUDED_COLLECTIONS (400KB item limit, and new
uploads already go straight to S3). This script copies the remaining legacy
blob(s) FORWARD to S3 so DynamoRepos never has to serve them.

READ-ONLY against MongoDB. It only calls find(); it NEVER deletes or updates
the Mongo row -- that row is the only copy of the blob. It also never touches
users.profile_photo_url / partners.profile_photo_url; it only REPORTS them so
the operator knows whether a follow-up URL update is needed.

Source DB defaults to `tefilah_test`; DB_NAME from backend/.env is ignored on
purpose because it points at the live production database.

Run:
    python migration/07_avatars_to_s3.py                      # dry run, tefilah_test
    python migration/07_avatars_to_s3.py --apply              # test prefix, tefilah_test
    python migration/07_avatars_to_s3.py --apply --s3-prefix "" \
        --source-db tefilah --i-know-this-is-production       # the real thing

S3 convention is COPIED FROM server.py (do not invent a new one):
    bucket        S3_AVATAR_BUCKET      server.py:106   'tefillah-web-prod'
    key           _save_avatar()        server.py:4336  f"avatars/{owner_id}-{ts}.{ext}"
    ext map       _AVATAR_EXT           server.py:109
    cache-control _save_avatar()        server.py:4344
    public URL    _save_avatar()        server.py:4359  f"{AVATAR_PUBLIC_BASE}/{key}"

Idempotent: `ts` is the row's own `updated_at` (not now()), so re-running
computes the SAME key and the PutObject overwrites in place -- no duplicates.

Every upload is verified: the object is re-fetched from S3 and its sha256 is
compared with the Mongo blob's. A mismatch fails the run.
"""
import argparse
import hashlib
import sys
from datetime import datetime, timezone
from pathlib import Path

import boto3
from pymongo import MongoClient

BACKEND_DIR = Path(__file__).resolve().parent.parent

DEFAULT_SOURCE_DB = "tefilah_test"
PRODUCTION_DB = "tefilah"

# --- mirrored from server.py, see module docstring for line numbers ---
BUCKET = "tefillah-web-prod"
PUBLIC_BASE = "https://tefillah.in"
REGION = "ap-south-1"
AVATAR_EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}
CACHE_CONTROL = "public, max-age=31536000, immutable"

# Anything not read from production goes under here so a test blob can never
# land on (or overwrite) a real avatar key. Production omits it: --s3-prefix ""
TEST_PREFIX = "migration-test/"

EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


def load_env(path: Path) -> dict:
    env = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def connect_mongo(db_name: str):
    url = load_env(BACKEND_DIR / ".env").get("MONGO_URL")
    if not url:
        raise SystemExit("ERROR: MONGO_URL not found in backend/.env")
    client = MongoClient(url, serverSelectionTimeoutMS=20000)
    client.admin.command("ping")
    return client[db_name]


def avatar_key(owner_id: str, content_type: str, updated_at) -> str:
    """server.py's `avatars/{owner_id}-{ts}.{ext}`, with ts pinned to the row's
    own updated_at so the key is stable across re-runs (idempotency)."""
    ext = AVATAR_EXT.get((content_type or "").lower().split(";")[0].strip(), "jpg")
    if isinstance(updated_at, datetime):
        if updated_at.tzinfo is None:
            updated_at = updated_at.replace(tzinfo=timezone.utc)
        ts = int((updated_at - EPOCH).total_seconds())
    else:
        ts = 0  # no updated_at -> still deterministic
    return f"avatars/{owner_id}-{ts}.{ext}"


def blob_bytes(data) -> bytes:
    """Mongo hands back bytes/Binary; a legacy base64 str is handled the same
    way get_avatar() (server.py:4377) handles it."""
    if isinstance(data, str):
        import base64
        return base64.b64decode(data)
    return bytes(data)


def current_photo_url(db, owner_id: str):
    """What users/partners currently point at for this owner. Report only."""
    for coll in ("users", "partners"):
        doc = db[coll].find_one({"_id": owner_id}, {"profile_photo_url": 1})
        if doc:
            return coll, doc.get("profile_photo_url")
    return None, None


def parse_args(argv=None):
    p = argparse.ArgumentParser(description="Copy legacy Mongo avatar blobs to S3.")
    p.add_argument("--source-db", default=DEFAULT_SOURCE_DB,
                   help=f"Mongo database to READ (default: {DEFAULT_SOURCE_DB}). "
                        "DB_NAME from .env is ignored on purpose.")
    p.add_argument("--i-know-this-is-production", action="store_true",
                   help=f"Required to read the live {PRODUCTION_DB!r} database.")
    p.add_argument("--apply", action="store_true",
                   help="Actually upload. Without it the script is a dry run.")
    p.add_argument("--dry-run", action="store_true",
                   help="No-op; dry run is already the default.")
    p.add_argument("--s3-prefix", default=TEST_PREFIX,
                   help=f"Key prefix (default {TEST_PREFIX!r}). Production passes --s3-prefix \"\".")
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    prod = args.source_db == PRODUCTION_DB

    if prod and not args.i_know_this_is_production:
        print(f"REFUSING to read {PRODUCTION_DB!r}: that is the LIVE production database.\n"
              "Pass --i-know-this-is-production if you really mean it.")
        return 2
    if not prod and args.s3_prefix == "":
        print(f"REFUSING: --s3-prefix \"\" writes real avatar keys, but the source is "
              f"{args.source_db!r}, not {PRODUCTION_DB!r}. Keep the test prefix.")
        return 2
    if prod:
        print(f"!! Reading LIVE PRODUCTION database {PRODUCTION_DB!r} (read-only) !!\n")

    apply = args.apply and not args.dry_run
    db = connect_mongo(args.source_db)
    rows = list(db.avatars.find({}))

    print(f"source db      : {args.source_db}")
    print(f"mode           : {'APPLY (uploading)' if apply else 'DRY RUN (no S3 writes)'}")
    print(f"bucket / region: {BUCKET} / {REGION}")
    print(f"key prefix     : {args.s3_prefix!r}")
    print(f"avatar rows    : {len(rows)}\n")

    s3 = boto3.client("s3", region_name=REGION) if apply else None
    failures = []

    for doc in rows:
        owner_id = str(doc["_id"])
        content_type = doc.get("content_type") or "image/jpeg"
        data = blob_bytes(doc.get("data") or b"")
        key = args.s3_prefix + avatar_key(owner_id, content_type, doc.get("updated_at"))
        url = f"{PUBLIC_BASE}/{key}"
        src_sha = hashlib.sha256(data).hexdigest()
        coll, photo_url = current_photo_url(db, owner_id)

        print(f"owner_id            : {owner_id}")
        print(f"  bytes / type      : {len(data)} / {content_type}")
        print(f"  updated_at        : {doc.get('updated_at')}")
        print(f"  s3 key            : {key}")
        print(f"  url               : {url}")
        print(f"  mongo sha256      : {src_sha}")
        print(f"  owner record      : {coll or 'NOT FOUND in users/partners'}")
        print(f"  profile_photo_url : {photo_url!r}")

        if not data:
            print("  RESULT            : FAIL - empty blob, nothing to upload")
            failures.append(f"{owner_id}: empty blob")
            print()
            continue
        if not apply:
            print("  RESULT            : dry run, not uploaded")
            print()
            continue

        try:
            # Carry the row's ORIGINAL updated_at across as object metadata.
            # S3's LastModified is the migration time, which is a different
            # fact; without this the repo would report the wrong timestamp.
            meta = {}
            _orig = doc.get("updated_at")
            if isinstance(_orig, datetime):
                meta["updated-at"] = _orig.isoformat()
            s3.put_object(Bucket=BUCKET, Key=key, Body=data,
                          ContentType=content_type, CacheControl=CACHE_CONTROL,
                          Metadata=meta)
            got = s3.get_object(Bucket=BUCKET, Key=key)
            body = got["Body"].read()
        except Exception as e:
            print(f"  RESULT            : FAIL - S3 error: {type(e).__name__}: {e}")
            failures.append(f"{owner_id}: {type(e).__name__}: {e}")
            print()
            continue

        dst_sha = hashlib.sha256(body).hexdigest()
        print(f"  s3 sha256         : {dst_sha}")
        print(f"  s3 content-type   : {got.get('ContentType')}")
        if dst_sha != src_sha or len(body) != len(data):
            print("  RESULT            : FAIL - sha256 MISMATCH, S3 copy differs from Mongo")
            failures.append(f"{owner_id}: sha256 mismatch")
        else:
            print("  RESULT            : OK - uploaded and verified byte-for-byte")
        print()

    print("-" * 68)
    if not rows:
        print("SUMMARY: no avatar rows found - nothing to migrate.")
        return 0
    if failures:
        print(f"SUMMARY: FAILED - {len(failures)} of {len(rows)} row(s):")
        for f in failures:
            print(f"  {f}")
        return 1
    if not apply:
        print(f"SUMMARY: dry run OK - {len(rows)} row(s) would be uploaded. Re-run with --apply.")
        return 0
    print(f"SUMMARY: OK - {len(rows)} row(s) uploaded and sha256-verified.")
    print("Mongo rows left untouched (copy-forward only).")
    print("Follow-up (operator's call): set profile_photo_url to the url above for any "
          "owner still pointing at the legacy /api/avatar/<id> endpoint.")
    return 0


def _selfcheck():
    """The only real logic here is the key. Fails loudly if it drifts."""
    dt = datetime(2025, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
    assert avatar_key("abc", "image/png", dt) == "avatars/abc-1735787045.png"
    assert avatar_key("abc", "image/png", dt) == avatar_key("abc", "image/png", dt)  # idempotent
    assert avatar_key("abc", "image/tiff", None) == "avatars/abc-0.jpg"  # unknown type -> jpg


if __name__ == "__main__":
    _selfcheck()
    sys.exit(main())
