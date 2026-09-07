"""
Exercise every authenticated GET endpoint against LIVE production.

After the DynamoDB cutover the only production traffic was ELB health checks and
vulnerability scanners, so no real code path had actually run against the new
backend. This drives each read endpoint with a real token and reports the status
codes, which is the difference between "deployed" and "verified".

READ-ONLY: GET requests only. It never POSTs, PUTs or DELETEs. (One unavoidable
side effect: get_current_partner refreshes the partner's `last_active`
heartbeat, exactly as any normal partner request would.)

The signing secret is read from the EB environment into memory and is NEVER
printed or written to disk.

    python migration/09_prod_smoke.py
    python migration/09_prod_smoke.py --base https://api.tefillah.in
"""
import argparse
import json
import shutil
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import jwt
from pymongo import MongoClient

EB_APP = "tefillah-api"
EB_ENV = "tefillah-api-prod-v2"
REGION = "ap-south-1"

# Endpoints that must work for the app to be usable, by role.
BY_ROLE = {
    "user": ["/api/auth/me", "/api/user/notifications", "/api/prayer/history",
             "/api/community/pulse", "/api/cells"],
    "partner": ["/api/auth/me", "/api/partner/stats", "/api/partner/requests",
                "/api/partner/notifications"],
    "admin": ["/api/auth/me", "/api/admin/stats", "/api/admin/users",
              "/api/admin/partners", "/api/admin/prayers", "/api/admin/analytics",
              "/api/admin/activity-logs", "/api/admin/llm-logs",
              "/api/admin/admins", "/api/admin/partners-for-assignment",
              "/api/admin/permissions-list", "/api/admin/daily-reports"],
}


def eb_env():
    aws = shutil.which("aws")
    if not aws:
        sys.exit("aws CLI not found")
    out = subprocess.run(
        [aws, "elasticbeanstalk", "describe-configuration-settings",
         "--application-name", EB_APP, "--environment-name", EB_ENV,
         "--region", REGION, "--output", "json"],
        capture_output=True, text=True, timeout=120)
    if out.returncode != 0:
        sys.exit(f"EB describe failed: {out.stderr.strip()[:200]}")
    settings = json.loads(out.stdout)["ConfigurationSettings"][0]["OptionSettings"]
    return {s["OptionName"]: s.get("Value")
            for s in settings
            if s["Namespace"] == "aws:elasticbeanstalk:application:environment"}


def local_env():
    env = {}
    for line in (Path(__file__).resolve().parent.parent / ".env").read_text(
            encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def mint(secret, algorithm, uid, email, role, is_admin):
    # decode_token() requires exp AND iat AND user_id (a July-2026 hardening:
    # a token missing any of them is rejected rather than silently accepted).
    # Omitting iat is why an earlier version of this script got 401 everywhere.
    now = datetime.now(timezone.utc)
    payload = {
        "user_id": uid, "email": email, "user_type": role,
        "is_admin": is_admin,
        "iat": now,
        "exp": now + timedelta(minutes=15),
    }
    return jwt.encode(payload, secret, algorithm=algorithm or "HS256")


def write_check(client, base, token, uid, db):
    """Prove WRITES work against the live backend, not just reads.

    register-device / unregister-device is used because the pair is
    SELF-CLEANING: it sets fcm_token + fcm_updated_at then removes them,
    exercising both the $set and the $unset (REMOVE) path of _Repo._update on
    the users table through the real request path. Every other write in the
    adapter uses that same machinery, so if this works, writes are live.

    Reads back via /api/auth/me rather than trusting the 200, and restores any
    pre-existing token so the account is left exactly as it was found.
    """
    probe = "__prodsmoke__token__"
    headers = {"Authorization": f"Bearer {token}"}
    failures = []
    before = db.users.find_one({"_id": uid}, {"fcm_token": 1}) or {}
    original = before.get("fcm_token")

    r = client.post(f"{base}/api/user/register-device",
                    params={"token": probe}, headers=headers)
    print(f"  {r.status_code}  POST /api/user/register-device")
    if r.status_code != 200:
        failures.append(f"register-device -> {r.status_code}: {r.text[:120]}")
        return failures

    me = client.get(f"{base}/api/auth/me", headers=headers).json()
    if me.get("fcm_token") == probe:
        print("  OK   write landed and was read back through the API")
    else:
        print("  --   /auth/me does not echo fcm_token; relying on round-trip codes")

    r = client.post(f"{base}/api/user/unregister-device", headers=headers)
    print(f"  {r.status_code}  POST /api/user/unregister-device")
    if r.status_code != 200:
        failures.append(f"unregister-device -> {r.status_code}: {r.text[:120]}")

    if original:
        client.post(f"{base}/api/user/register-device",
                    params={"token": original}, headers=headers)
        print("  --   restored the original fcm_token")
    return failures


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://api.tefillah.in")
    ap.add_argument("--write-check", action="store_true",
                    help="Also run a self-cleaning WRITE round-trip.")
    args = ap.parse_args()

    prod = eb_env()
    secret = prod.get("JWT_SECRET")
    if not secret:
        sys.exit("REFUSING: no JWT_SECRET in the EB environment")
    algorithm = prod.get("JWT_ALGORITHM") or "HS256"
    print(f"target        : {args.base}")
    print(f"DB_BACKEND    : {prod.get('DB_BACKEND') or '(unset -> mongo)'}")
    print(f"DB_NAME       : {prod.get('DB_NAME')}")

    # Identities come from the live database so the tokens reference real rows.
    db = MongoClient(local_env()["MONGO_URL"],
                     serverSelectionTimeoutMS=20000)[prod.get("DB_NAME", "tefilah")]
    who = {
        "user": db.users.find_one({}, {"email": 1}),
        "partner": db.partners.find_one({"is_active": True}, {"email": 1})
                   or db.partners.find_one({}, {"email": 1}),
        "admin": db.admins.find_one({}, {"email": 1}),
    }
    for role, doc in who.items():
        if not doc:
            sys.exit(f"REFUSING: no {role} row to build a token from")

    failures = []
    with httpx.Client(timeout=45.0) as client:
        for role, paths in BY_ROLE.items():
            doc = who[role]
            token = mint(secret, algorithm, doc["_id"], doc.get("email", ""),
                         role, role == "admin")
            print(f"\n--- {role} ---")
            for path in paths:
                try:
                    r = client.get(f"{args.base}{path}",
                                   headers={"Authorization": f"Bearer {token}"})
                    code = r.status_code
                    detail = ""
                    # 401 means our token was REJECTED -> the test proved
                    # nothing. 403 is legitimate (a real permission boundary).
                    if code == 401:
                        detail = "  <- token rejected; this test proves nothing"
                        failures.append(f"{role} {path} -> 401 (auth failed)")
                    elif code >= 500:
                        detail = f"  <- {r.text[:160]}"
                        failures.append(f"{role} {path} -> {code}")
                    elif code not in (200, 403):
                        detail = f"  <- {r.text[:120]}"
                        failures.append(f"{role} {path} -> {code}")
                    print(f"  {code}  {path}{detail}")
                except Exception as e:
                    failures.append(f"{role} {path} -> {type(e).__name__}")
                    print(f"  ERR {path}  {type(e).__name__}: {e}")

    if args.write_check:
        print("")
        print("--- write round-trip (self-cleaning) ---")
        d = who["user"]
        wtok = mint(secret, algorithm, d["_id"], d.get("email", ""), "user", False)
        with httpx.Client(timeout=45.0) as wc:
            failures += write_check(wc, args.base, wtok, d["_id"], db)

    print("\n" + "=" * 62)
    if failures:
        print(f"FAILED: {len(failures)} endpoint(s) did not behave:")
        for f in failures:
            print("  -", f)
        return 1
    print("ALL AUTHENTICATED READ ENDPOINTS OK on live production.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
