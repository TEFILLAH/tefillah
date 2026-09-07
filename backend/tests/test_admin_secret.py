"""
Self-contained checks for production detection and the admin-bootstrap guard.

No framework: plain asserts, run it directly.
    backend/.venv/Scripts/python.exe tests/test_admin_secret.py

Why this exists: the ADMIN_SECRET guard used to key off RAILWAY_ENVIRONMENT /
PRODUCTION only. Elastic Beanstalk — where this actually runs — sets NEITHER,
so on the one environment that mattered the guard was dead code and the admin
bootstrap endpoint stayed gated by a secret committed to this repo.

These checks test the DETECTION and the REFUSAL, never a secret value.
"""
import asyncio
import os
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
os.environ["DB_NAME"] = "tefilah_test"          # never prod, even for imports
os.environ.pop("PRODUCTION", None)
os.environ.pop("RAILWAY_ENVIRONMENT", None)

from fastapi import HTTPException                # noqa: E402

import server                                    # noqa: E402

failures = []


def check(label, condition):
    print(f"  {'PASS' if condition else 'FAIL'}  {label}")
    if not condition:
        failures.append(label)


class _Req:
    """Minimal stand-in for starlette Request — the endpoint reads headers only."""
    def __init__(self, secret):
        self.headers = {"x-admin-secret": secret} if secret is not None else {}


class _Admins:
    """Stub repo. `touched` proves whether the secret check let us through."""
    def __init__(self):
        self.touched = False

    async def any_exists(self):
        self.touched = True
        return True          # an admin exists -> endpoint 409s, never writes

    async def insert(self, doc):                  # pragma: no cover - must not run
        raise AssertionError("test attempted a real admin insert")


async def call_bootstrap(secret, disabled):
    """Run the endpoint against stub repos. Returns (status, repo_touched)."""
    admins = _Admins()
    real_repos, real_flag = server.repos, server.ADMIN_BOOTSTRAP_DISABLED
    server.repos = type("R", (), {"admins": admins})()
    server.ADMIN_BOOTSTRAP_DISABLED = disabled
    try:
        body = server.AdminCreate(name="Test Admin", email="test@example.com",
                                  password="Str0ng!Passw0rd")
        await server.create_first_admin(body, _Req(secret))
        return None, admins.touched
    except HTTPException as exc:
        return exc.status_code, admins.touched
    finally:
        server.repos, server.ADMIN_BOOTSTRAP_DISABLED = real_repos, real_flag


def env(**kwargs):
    """Set/clear env vars for one detection check."""
    for key, value in kwargs.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value


async def run():
    looks = server._looks_production
    env(RAILWAY_ENVIRONMENT=None, PRODUCTION=None)

    # ---- detection: developer laptops are NOT production --------------------
    check("localhost mongo is not production",
          looks("mongodb://localhost:27017") is False)
    check("127.0.0.1 mongo is not production",
          looks("mongodb://127.0.0.1:27017/tefilah") is False)
    check("unset MONGO_URL is not production", looks("") is False)

    # ---- detection: the case the old ADMIN_SECRET guard missed --------------
    # Elastic Beanstalk sets no RAILWAY_ENVIRONMENT and no PRODUCTION. The
    # database target is the only signal, and it must be enough on its own.
    check("EB-like (Atlas SRV, no platform env var) IS production",
          looks("mongodb+srv://cluster0.example.mongodb.net/tefilah") is True)
    check("EB-like (plain remote host, no platform env var) IS production",
          looks("mongodb://prod-db.internal:27017/tefilah") is True)

    # ---- detection: the signals that already worked still work --------------
    env(RAILWAY_ENVIRONMENT="production")
    check("RAILWAY_ENVIRONMENT alone IS production",
          looks("mongodb://localhost:27017") is True)
    env(RAILWAY_ENVIRONMENT=None, PRODUCTION="1")
    check("PRODUCTION alone IS production",
          looks("mongodb://localhost:27017") is True)
    env(PRODUCTION=None)

    # ---- the guard is wired to the same detection ---------------------------
    check("ADMIN_BOOTSTRAP_DISABLED == (default secret AND production)",
          server.ADMIN_BOOTSTRAP_DISABLED
          == (server.ADMIN_SECRET == server._admin_default and looks()))

    # ---- the endpoint fails closed -----------------------------------------
    # The default secret is public (it is literally in server.py), so when it is
    # in force on production NO caller may pass, not even one presenting it.
    status, touched = await call_bootstrap(server._admin_default, disabled=True)
    check("default secret on production is REFUSED (403)", status == 403)
    check("refusal happens before any DB access", touched is False)

    status, _ = await call_bootstrap("whatever-an-attacker-guesses", disabled=True)
    check("any other secret while disabled is REFUSED (403)", status == 403)

    status, _ = await call_bootstrap(None, disabled=True)
    check("missing header while disabled is REFUSED (403)", status == 403)

    # ---- and does NOT break a correctly-configured deploy -------------------
    # disabled=False is what a real ADMIN_SECRET produces. 409 == the secret
    # check passed and we reached the "admin already exists" stage.
    status, touched = await call_bootstrap(server.ADMIN_SECRET, disabled=False)
    check("correct secret still passes the gate (409 from existing-admin check)",
          status == 409)
    check("correct secret reaches the existing-admin check", touched is True)

    status, _ = await call_bootstrap("wrong-secret", disabled=False)
    check("wrong secret still refused when enabled (403)", status == 403)

    print()
    if failures:
        print(f"{len(failures)} CHECK(S) FAILED: {failures}")
        return 1
    print("ALL ADMIN SECRET CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(run()))
