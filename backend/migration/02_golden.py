"""
Phase 1 safety net — golden-snapshot characterization tests.

The backend has ZERO tests, so before refactoring ~230 inline queries into a
repository layer we capture the CURRENT behaviour of every read endpoint, then
re-run afterwards and diff. If the diff is empty, the refactor changed nothing.

Self-calibrating: it captures TWICE and treats any JSON path that differs
between two identical runs as volatile (clocks, "time remaining", ordering of
equal keys) and excludes it from comparison. No hand-maintained ignore list.

Only GET endpoints are exercised — they are idempotent, and all the risky logic
(aggregations, counts, search, pagination) lives there anyway.

Runs against tefilah_test ONLY. Refuses to run against the prod database.

Usage:
  python migration/02_golden.py capture --out golden_before.json
  python migration/02_golden.py compare --baseline golden_before.json
"""
import argparse
import asyncio
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
TEST_DB = "tefilah_test"
PROD_DB_NAMES = {"tefilah", "tefillah"}

# GET endpoints that are NOT idempotent, so they can't be snapshotted:
# /api/verse/generate calls the live LLM (slow, costs quota, non-deterministic)
# AND writes an llm_logs row, which mutates what /api/admin/llm-logs returns.
SKIP_PATHS = {"/api/verse/generate"}

# Must be set BEFORE importing server (it reads env at import time).
os.environ["DB_NAME"] = TEST_DB
os.environ.pop("PRODUCTION", None)          # any non-empty value trips a fatal guard
os.environ.pop("RAILWAY_ENVIRONMENT", None)

sys.path.insert(0, str(BACKEND_DIR))


def load_env(path: Path) -> dict:
    env = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def mint(secret: str, alg: str, user_id: str, user_type: str, is_admin: bool = False) -> str:
    import jwt
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"user_id": user_id, "user_type": user_type, "is_admin": is_admin,
         "exp": now + timedelta(hours=12), "iat": now},
        secret, algorithm=alg,
    )


def normalise(obj):
    """Sort lists of dicts by a stable key so incidental ordering isn't a diff."""
    if isinstance(obj, dict):
        return {k: normalise(v) for k, v in sorted(obj.items())}
    if isinstance(obj, list):
        items = [normalise(v) for v in obj]
        try:
            return sorted(items, key=lambda x: json.dumps(x, sort_keys=True, default=str))
        except Exception:
            return items
    return obj


def flatten(obj, prefix=""):
    """JSON -> {path: value} so we can diff precisely."""
    out = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            out.update(flatten(v, f"{prefix}.{k}" if prefix else str(k)))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            out.update(flatten(v, f"{prefix}[{i}]"))
    else:
        out[prefix] = obj
    return out


async def run_suite():
    import server
    if server.db.name != TEST_DB:
        raise SystemExit(f"REFUSING: connected to '{server.db.name}', expected '{TEST_DB}'")
    if server.db.name in PROD_DB_NAMES:
        raise SystemExit("REFUSING: that is production")

    # A 'dynamo' run that silently fell back to mongo would be a FALSE PASS --
    # worse than no gate at all, because it looks like proof. Assert the backend
    # actually in use matches what was asked for.
    want = os.environ.get("DB_BACKEND", "mongo")
    got = getattr(server.repos, "backend", "unknown")
    if got != want:
        raise SystemExit(
            f"REFUSING: asked for DB_BACKEND={want!r} but server.repos.backend is {got!r}. "
            "The run would have tested the wrong backend."
        )

    from pymongo import MongoClient
    env = load_env(BACKEND_DIR / ".env")
    mc = MongoClient(env["MONGO_URL"], serverSelectionTimeoutMS=20000)
    tdb = mc[TEST_DB]

    user = tdb.users.find_one({}) or {}
    partner = tdb.partners.find_one({}) or {}
    admin = tdb.admins.find_one({}) or {}
    prayer = tdb.prayer_requests.find_one({}) or {}

    secret, alg = server.JWT_SECRET, server.JWT_ALGORITHM
    tok = {
        "user": mint(secret, alg, user.get("_id", "none"), "user"),
        "partner": mint(secret, alg, partner.get("_id", "none"), "partner"),
        "admin": mint(secret, alg, admin.get("_id", "none"), "admin", True),
    }
    subs = {
        "user_id": user.get("_id", ""), "partner_id": partner.get("_id", ""),
        "prayer_id": prayer.get("_id", ""), "request_id": prayer.get("_id", ""),
        "owner_id": user.get("_id", ""), "notification_id": "",
        "agent_id": partner.get("_id", ""), "cell_id": "",
    }

    # Auto-discover GET routes; fill path params from real data; skip unfillable.
    targets = []
    for r in server.app.routes:
        methods = getattr(r, "methods", set()) or set()
        path = getattr(r, "path", "")
        if "GET" not in methods or not path.startswith("/api") or path in SKIP_PATHS:
            continue
        url, ok = path, True
        for part in path.split("/"):
            if part.startswith("{") and part.endswith("}"):
                name = part[1:-1].split(":")[0]
                val = subs.get(name)
                if not val:
                    ok = False
                    break
                url = url.replace(part, str(val))
        if ok:
            targets.append((path, url))
    targets.sort()

    import httpx
    results = {}
    transport = httpx.ASGITransport(app=server.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test", timeout=60) as c:
        for tmpl, url in targets:
            for who, t in list(tok.items()) + [("anon", None)]:
                headers = {"Authorization": f"Bearer {t}"} if t else {}
                key = f"{who} GET {tmpl}"
                try:
                    resp = await c.get(url, headers=headers)
                    try:
                        body = normalise(resp.json())
                    except Exception:
                        body = {"_raw": resp.text[:400]}
                    results[key] = {"status": resp.status_code, "body": body}
                except Exception as e:
                    results[key] = {"status": "EXC", "body": {"error": f"{type(e).__name__}: {e}"}}
    return results


def capture_twice():
    # Both passes MUST share one event loop: Motor binds its client to the
    # running loop, so a second asyncio.run() would hit "Event loop is closed"
    # and make every field look volatile.
    async def _both():
        first = await run_suite()
        second = await run_suite()
        return first, second

    a, b = asyncio.run(_both())
    fa, fb = {}, {}
    for k in a:
        fa.update({f"{k}|{p}": v for p, v in flatten(a[k]).items()})
    for k in b:
        fb.update({f"{k}|{p}": v for p, v in flatten(b[k]).items()})
    volatile = sorted({k for k in set(fa) | set(fb) if fa.get(k) != fb.get(k)})
    return b, volatile


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["capture", "compare"])
    ap.add_argument("--out", default="migration/golden_before.json")
    ap.add_argument("--baseline", default="migration/golden_before.json")
    ap.add_argument("--backend", choices=["mongo", "dynamo"], default="mongo",
                    help="Which repository backend serves the API during the run. "
                         "'dynamo' is THE cutover gate: it replays the same 92 "
                         "requests against DynamoDB and diffs them against the "
                         "SAME Mongo-captured baseline, so any behavioural drift "
                         "in the adapter shows up as a response difference.")
    args = ap.parse_args()

    # Must be set before server is imported (repo/__init__.py reads it at import).
    os.environ["DB_BACKEND"] = args.backend
    print(f"backend: {args.backend}")

    if args.mode == "capture":
        results, volatile = capture_twice()
        Path(args.out).write_text(json.dumps(
            {"results": results, "volatile": volatile}, indent=2, default=str), encoding="utf-8")
        print(f"captured {len(results)} endpoint/role responses -> {args.out}")
        print(f"auto-detected {len(volatile)} volatile field(s), excluded from comparison")
        codes = {}
        for v in results.values():
            codes[v["status"]] = codes.get(v["status"], 0) + 1
        print("status codes:", dict(sorted(codes.items(), key=lambda x: str(x[0]))))
        return 0

    base = json.loads(Path(args.baseline).read_text(encoding="utf-8"))
    now, _ = capture_twice()
    volatile = set(base.get("volatile", []))

    old, new = {}, {}
    for k, v in base["results"].items():
        old.update({f"{k}|{p}": val for p, val in flatten(v).items()})
    for k, v in now.items():
        new.update({f"{k}|{p}": val for p, val in flatten(v).items()})

    diffs = []
    for k in sorted(set(old) | set(new)):
        if k in volatile:
            continue
        if old.get(k, "<missing>") != new.get(k, "<missing>"):
            diffs.append((k, old.get(k, "<missing>"), new.get(k, "<missing>")))

    if not diffs:
        print(f"IDENTICAL — {len(now)} responses match the baseline. Refactor is behaviour-preserving.")
        return 0
    print(f"{len(diffs)} DIFFERENCE(S) FOUND:\n")
    for k, o, n in diffs[:60]:
        print(f"  {k}\n    before: {o!r}\n    after:  {n!r}")
    if len(diffs) > 60:
        print(f"  ... and {len(diffs)-60} more")
    return 1


if __name__ == "__main__":
    sys.exit(main())
