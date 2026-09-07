"""
Phase 0 (part 2) — restore a backup taken by 00_backup_mongo.py.

Two jobs:
  1. Proves the backup is actually restorable (an untested backup is not a backup).
  2. Creates a scratch copy of prod to develop + test against, so the Phase 1
     refactor never touches the live database.

SAFETY: refuses to write to the production database name unless --allow-prod is
passed explicitly. Restoring over prod is destructive (it drops collections first).

Run:  python migration/01_restore_mongo.py <backup_dir> --target tefilah_test
"""
import argparse
import json
import os
import sys
from pathlib import Path

from bson import json_util
from pymongo import MongoClient

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROD_DB_NAMES = {"tefilah", "tefillah"}


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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("backup_dir")
    ap.add_argument("--target", required=True, help="target database name")
    ap.add_argument("--allow-prod", action="store_true",
                    help="required to restore onto the production database")
    args = ap.parse_args()

    if args.target in PROD_DB_NAMES and not args.allow_prod:
        print(f"REFUSING: '{args.target}' is the production database.")
        print("This drops collections before restoring. Re-run with --allow-prod if you truly mean it.")
        return 3

    backup = Path(args.backup_dir)
    manifest = json.loads((backup / "manifest.json").read_text(encoding="utf-8"))

    env = load_env(BACKEND_DIR / ".env")
    url = os.environ.get("MONGO_URL") or env.get("MONGO_URL")
    client = MongoClient(url, serverSelectionTimeoutMS=20000)
    client.admin.command("ping")
    db = client[args.target]

    print(f"Restoring {manifest['total_documents']} docs from {backup.name} -> '{args.target}'\n")
    for coll, meta in manifest["collections"].items():
        docs = []
        for line in (backup / f"{coll}.jsonl").read_text(encoding="utf-8").splitlines():
            if line:
                docs.append(json_util.loads(line))
        db[coll].drop()
        if docs:
            db[coll].insert_many(docs, ordered=False)
        print(f"  {coll:<20} {len(docs):>6} docs restored")

    # ---- VERIFY: every document must match the backup exactly, by _id ----
    print("\nVerifying restore (full document comparison)...")
    ok = True
    for coll, meta in manifest["collections"].items():
        original = {}
        for line in (backup / f"{coll}.jsonl").read_text(encoding="utf-8").splitlines():
            if line:
                d = json_util.loads(line)
                original[d["_id"]] = d
        restored = {d["_id"]: d for d in db[coll].find({})}

        if set(original) != set(restored):
            missing = len(set(original) - set(restored))
            extra = len(set(restored) - set(original))
            print(f"  ID MISMATCH {coll}: {missing} missing, {extra} unexpected")
            ok = False
            continue
        diffs = [k for k in original if original[k] != restored[k]]
        if diffs:
            print(f"  FIELD MISMATCH {coll}: {len(diffs)} docs differ (e.g. {diffs[:3]})")
            ok = False
        else:
            print(f"  OK  {coll:<20} {len(original):>6} docs identical")

    print(f"\n{'RESTORE VERIFIED' if ok else 'RESTORE FAILED'} -> '{args.target}'")
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())
