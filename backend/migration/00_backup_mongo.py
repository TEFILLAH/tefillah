"""
Phase 0 — full-fidelity backup of the live MongoDB before any migration work.

Uses bson.json_util (Extended JSON) so ObjectId / datetime / Binary round-trip
EXACTLY -- no hand-rolled encoder, no type loss. Restorable with 00_restore_mongo.py.

Output goes OUTSIDE the git repo (BACKUP_ROOT) because the dump contains real PII:
user emails, names, password hashes and prayer content. Never commit it.

Run:  python migration/00_backup_mongo.py
"""
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from bson import json_util
from pymongo import MongoClient

# Backups live outside the repo so they can never be committed.
BACKUP_ROOT = Path(os.environ.get("TEFILLAH_BACKUP_ROOT", "D:/tefilah-backups"))
BACKEND_DIR = Path(__file__).resolve().parent.parent


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
    env = load_env(BACKEND_DIR / ".env")
    url = os.environ.get("MONGO_URL") or env.get("MONGO_URL")
    dbname = os.environ.get("DB_NAME") or env.get("DB_NAME")
    if not url or not dbname:
        print("ERROR: MONGO_URL / DB_NAME not found in env or backend/.env")
        return 1

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    outdir = BACKUP_ROOT / f"mongo-{dbname}-{stamp}"
    outdir.mkdir(parents=True, exist_ok=True)

    client = MongoClient(url, serverSelectionTimeoutMS=20000)
    client.admin.command("ping")
    db = client[dbname]

    manifest = {
        "database": dbname,
        "taken_at": stamp,
        "tool": "00_backup_mongo.py",
        "format": "mongodb-extended-json (bson.json_util), one doc per line",
        "collections": {},
    }

    print(f"Backing up '{dbname}' -> {outdir}\n")
    grand_total = 0
    for coll in sorted(db.list_collection_names()):
        docs = list(db[coll].find({}))
        path = outdir / f"{coll}.jsonl"
        sha = hashlib.sha256()
        # newline="\n" so Windows does NOT translate to CRLF: the checksum below
        # hashes LF-terminated lines, and without this the manifest sha256 can
        # only be verified by this script (external `sha256sum` would disagree).
        with path.open("w", encoding="utf-8", newline="\n") as fh:
            for doc in docs:
                line = json_util.dumps(doc)
                fh.write(line + "\n")
                sha.update(line.encode("utf-8"))

        # indexes matter for parity checks later
        indexes = [
            {"name": n, "key": [list(k) for k in i["key"]], "unique": bool(i.get("unique"))}
            for n, i in db[coll].index_information().items()
        ]
        manifest["collections"][coll] = {
            "count": len(docs),
            "sha256": sha.hexdigest(),
            "bytes": path.stat().st_size,
            "indexes": indexes,
        }
        grand_total += len(docs)
        print(f"  {coll:<20} {len(docs):>6} docs  -> {path.name}")

    manifest["total_documents"] = grand_total
    (outdir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    # ---- VERIFY: re-read every file, confirm parse + counts + checksums ----
    print("\nVerifying backup integrity...")
    ok = True
    for coll, meta in manifest["collections"].items():
        path = outdir / f"{coll}.jsonl"
        sha = hashlib.sha256()
        n = 0
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line:
                continue
            json_util.loads(line)  # raises if a doc can't round-trip
            sha.update(line.encode("utf-8"))
            n += 1
        if n != meta["count"] or sha.hexdigest() != meta["sha256"]:
            print(f"  MISMATCH {coll}: {n} vs {meta['count']}")
            ok = False
        else:
            print(f"  OK  {coll:<20} {n:>6} docs, checksum matches, all docs parse")

    print(f"\n{'VERIFIED' if ok else 'FAILED'}: {grand_total} documents -> {outdir}")
    if ok:
        print("Contains real PII - keep it off git and off shared drives.")
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())
