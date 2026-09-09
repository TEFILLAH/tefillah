"""
Account-takeover guards on POST /auth/social.

No framework: plain asserts, run it directly.
    backend/.venv/Scripts/python.exe tests/test_social_takeover.py

WHY THIS EXISTS
---------------
/auth/social joins the caller to an existing account on the token's EMAIL
ALONE. Every validator already computed `email_verified`, and nothing read it —
so a token bearing a victim's address was enough to enter their account, even
one created with email+password that had no social identity at all.

That was reachable in production, not theoretical: Firebase Email/Password is
enabled on the project and the web API key is public in
tefillah-web/src/lib/firebase.ts, so `accounts:signUp` would mint an ID token
for ANY address with emailVerified=false.

The rejections below ARE the security property. A test that only checks the
happy path would have passed against the vulnerable code.
"""
import asyncio
import os
import sys
import warnings
from types import SimpleNamespace

from pathlib import Path

warnings.filterwarnings("ignore")

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
os.environ["DB_NAME"] = "tefilah_test"          # never prod, even for imports
os.environ.pop("PRODUCTION", None)

from fastapi import HTTPException                # noqa: E402

import server                                    # noqa: E402

failures = []


def check(label, condition):
    print(f"  {'PASS' if condition else 'FAIL'}  {label}")
    if not condition:
        failures.append(label)


class _Req:
    """Stand-in for starlette Request. Unique IP per call so the endpoint's own
    rate limit can't be mistaken for the guard we are actually testing."""
    _n = 0

    def __init__(self):
        self.headers = {}
        _Req._n += 1
        self.client = SimpleNamespace(host=f"198.51.100.{_Req._n % 250}")


class _Accounts:
    """Stub repo standing in for a VICTIM's existing account."""

    def __init__(self, email):
        self.email = email
        self.looked_up = []

    async def get_by_email(self, email):
        self.looked_up.append(email)
        if email == self.email:
            return {"_id": "victim-id", "email": self.email, "name": "Victim",
                    "is_active": True, "status": "active", "is_verified": True}
        return None

    async def update(self, *a, **k):
        raise AssertionError("takeover: endpoint reached the victim's account")

    async def insert(self, *a, **k):
        raise AssertionError("takeover: endpoint created an account")


async def call_social(identity, *, is_agent=False, victim_email="victim@example.com"):
    """Run /auth/social with verify_firebase_token stubbed to return `identity`.

    Returns (status_code or None, emails_the_endpoint_looked_up).
    """
    accounts = _Accounts(victim_email)
    real_verify, real_repos = server.verify_firebase_token, server.repos

    async def fake_verify(_token):
        return identity

    server.verify_firebase_token = fake_verify
    server.repos = SimpleNamespace(users=accounts, partners=accounts)
    try:
        body = server.SocialAuthRequest(firebase_token="stub", is_agent=is_agent)
        await server.social_auth(body, _Req(), None)
        return None, accounts.looked_up
    except HTTPException as exc:
        return exc.status_code, accounts.looked_up
    finally:
        server.verify_firebase_token, server.repos = real_verify, real_repos


def identity(email="victim@example.com", verified=True, provider="password"):
    return {"uid": "attacker-uid", "email": email, "name": "",
            "email_verified": verified, "provider": provider}


async def run():
    # ---- THE ATTACK ---------------------------------------------------------
    # An unverified token bearing the victim's address. This is the exact shape
    # Firebase accounts:signUp hands out for a free-typed email address.
    status, looked_up = await call_social(identity(verified=False))
    check("UNVERIFIED email is REFUSED (401)", status == 401)
    check("refusal happens BEFORE any account lookup", looked_up == [])

    # Same, aimed at the partner table.
    status, looked_up = await call_social(identity(verified=False), is_agent=True)
    check("UNVERIFIED email is REFUSED on the partner branch too", status == 401)
    check("partner branch also refuses before lookup", looked_up == [])

    # Firebase reports emailVerified as a real bool; Google/Apple may hand back
    # the STRING "false". Neither may be treated as verified.
    #
    # 1 and "1" are in here deliberately: `1 == True` in Python, so a careless
    # equality check would accept them. The guard uses `is True` plus an
    # explicit string compare, so an int never qualifies.
    for bad in (False, None, "", "false", 0, 1, "1", "yes", "verified", [], {}):
        status, _ = await call_social(identity(verified=bad))
        check(f"email_verified={bad!r} is REFUSED", status == 401)

    # The ACCEPTED side of the allow-list, pinned so nobody widens it by accident.
    # Only real True and case/whitespace variants of the exact string "true".
    # Nothing here is attacker-controlled: all three validators normalise this
    # to a bool from a signed provider claim before the guard ever sees it.
    for good in (True, "true", "TRUE", "  true  ", "True"):
        reached = False
        try:
            await call_social(identity(verified=good))
        except AssertionError as exc:
            reached = "takeover" in str(exc)
        check(f"email_verified={good!r} is ACCEPTED", reached)

    # ---- EMPTY EMAIL --------------------------------------------------------
    # Every emailless caller would otherwise collapse into ONE shared account:
    # get_by_email("") misses once, a row is created, and every later emailless
    # sign-in matches it.
    for empty in ("", "   ", None):
        status, looked_up = await call_social(identity(email=empty))
        check(f"empty email {empty!r} is REFUSED", status == 401)
        check(f"empty email {empty!r} never reaches a lookup", looked_up == [])

    # ---- THE GUARD MUST NOT BREAK LEGITIMATE SIGN-IN ------------------------
    # A verified identity must still get through to the account lookup. The stub
    # repo raises on update(), so reaching the victim's row proves we got past
    # both guards — that raise is the assertion.
    reached = False
    try:
        await call_social(identity(verified=True, provider="google.com"))
    except AssertionError as exc:
        reached = "takeover" in str(exc)
    check("VERIFIED identity still reaches the account (guard is not a blanket deny)",
          reached)

    # Apple sets email_verified true even for private-relay forwarding
    # addresses, so those must keep working.
    reached = False
    try:
        await call_social(
            identity(email="x7k2m9qp4t@privaterelay.appleid.com", verified=True,
                     provider="apple.com"),
            victim_email="x7k2m9qp4t@privaterelay.appleid.com")
    except AssertionError as exc:
        reached = "takeover" in str(exc)
    check("Apple private-relay address is accepted when verified", reached)

    # ---- the field the guard depends on is still produced -------------------
    # If a validator ever stops emitting email_verified, the guard silently
    # denies everyone. Pin that all three still set it.
    src = (BACKEND / "server.py").read_text(encoding="utf-8")
    check("all 3 validators still emit email_verified",
          src.count('"email_verified"') >= 3)

    print()
    if failures:
        print(f"{len(failures)} CHECK(S) FAILED: {failures}")
        return 1
    print("ALL SOCIAL TAKEOVER CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(run()))
