"""
Self-contained checks for Sign in with Apple token verification.

No framework: plain asserts, run it directly.
    backend/.venv/Scripts/python.exe tests/test_apple_auth.py

This is auth code, so the NEGATIVE cases are the point. A verifier that accepts
a valid token is worth little; one that rejects a token signed by the wrong key,
minted for another app, or already expired is what actually protects accounts.
Every rejection case below corresponds to a real attack:

  wrong signature  -> attacker mints their own token
  wrong audience   -> token stolen from a DIFFERENT app that also uses Apple
  wrong issuer     -> token from any other OIDC provider
  expired          -> replay of an old capture
  alg != RS256     -> algorithm-confusion / alg:none
  no audience set  -> misconfigured deploy must FAIL CLOSED, not accept all
"""
import asyncio
import json
import os
import sys
import warnings
from datetime import datetime, timedelta, timezone
from pathlib import Path

warnings.filterwarnings("ignore")

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
os.environ["DB_NAME"] = "tefilah_test"          # never prod, even for imports
os.environ.pop("PRODUCTION", None)

import jwt                                       # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402
from jwt.algorithms import RSAAlgorithm          # noqa: E402

import server                                    # noqa: E402

BUNDLE = "com.tefilah.app"
SERVICE = "com.tefilah.app.web"
KID = "test-key-1"

_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_other = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _jwk():
    data = json.loads(RSAAlgorithm.to_jwk(_key.public_key()))
    data.update({"kid": KID, "alg": "RS256", "use": "sig"})
    return data


def mint(*, aud=BUNDLE, iss=server.APPLE_ISSUER, sub="apple-sub-123",
         email="user@privaterelay.appleid.com", exp_delta=timedelta(minutes=10),
         key=None, kid=KID, alg="RS256", extra=None):
    now = datetime.now(timezone.utc)
    claims = {"iss": iss, "aud": aud, "sub": sub, "iat": now, "exp": now + exp_delta,
              "email": email, "email_verified": "true", "is_private_email": "true"}
    if extra:
        claims.update(extra)
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, key or _key, algorithm=alg, headers={"kid": kid})


async def run():
    # Point the verifier at OUR key material instead of Apple's live JWKS.
    server.APPLE_BUNDLE_ID = BUNDLE
    server.APPLE_SERVICE_ID = SERVICE

    real_get_keys = server._get_apple_keys      # kept for the throttle test

    async def fake_keys(force_refresh=False):
        return [_jwk()]
    server._get_apple_keys = fake_keys

    verify = server.verify_apple_token
    failures = []

    def check(label, condition):
        print(f"  {'PASS' if condition else 'FAIL'}  {label}")
        if not condition:
            failures.append(label)

    # ---- accepts a genuine token -------------------------------------------
    ok = await verify(mint())
    check("valid native token accepted", ok is not None)
    if ok:
        check("uid is Apple's stable sub", ok["uid"] == "apple-sub-123")
        check("provider is apple.com", ok["provider"] == "apple.com")
        check("email lowercased", ok["email"] == "user@privaterelay.appleid.com")
        check("email_verified parsed from string 'true'", ok["email_verified"] is True)
        check("private relay flagged", ok["is_private_email"] is True)
        check("name is empty (Apple never sends it)", ok["name"] == "")

    check("web Service ID audience accepted",
          await verify(mint(aud=SERVICE)) is not None)

    # ---- rejections ---------------------------------------------------------
    check("REJECTS token signed by another key",
          await verify(mint(key=_other)) is None)
    check("REJECTS audience of a different app",
          await verify(mint(aud="com.someone.else")) is None)
    check("REJECTS non-Apple issuer",
          await verify(mint(iss="https://accounts.google.com")) is None)
    check("REJECTS expired token",
          await verify(mint(exp_delta=timedelta(minutes=-5))) is None)
    check("REJECTS unknown kid",
          await verify(mint(kid="not-a-real-kid")) is None)
    check("REJECTS token with no email",
          await verify(mint(email=None)) is None)
    check("REJECTS garbage that is not a JWT", await verify("not.a.jwt") is None)

    # Algorithm confusion. PyJWT refuses to sign with an asymmetric key as an
    # HMAC secret, so the classic "HS256 signed with the public key" token
    # cannot even be built here -- PyJWT blocks it at encode time. What IS
    # testable, and what our code actually guards, is that a non-RS256 token is
    # rejected outright before any key lookup happens.
    now = datetime.now(timezone.utc)
    hs = jwt.encode({"iss": server.APPLE_ISSUER, "aud": BUNDLE, "sub": "x",
                     "iat": now, "exp": now + timedelta(minutes=10),
                     "email": "a@b.c"}, "shared-secret", algorithm="HS256",
                    headers={"kid": KID})
    check("REJECTS a non-RS256 (HS256) token",
          await verify(hs) is None)

    # ---- fail closed when unconfigured -------------------------------------
    server.APPLE_BUNDLE_ID = ""
    server.APPLE_SERVICE_ID = ""
    check("FAILS CLOSED when no audience is configured",
          await verify(mint()) is None)
    server.APPLE_BUNDLE_ID, server.APPLE_SERVICE_ID = BUNDLE, SERVICE

    # ---- routing: verify_firebase_token sends Apple tokens to the Apple path -
    routed = await server.verify_firebase_token(mint())
    check("verify_firebase_token routes Apple issuer to the Apple verifier",
          routed is not None and routed.get("provider") == "apple.com")

    # ---- REGRESSION: a non-Apple token must NOT take the Apple path ---------
    # This is the whole risk surface of adding the router: if a Firebase or
    # Google token were mis-routed, every existing login would break.
    called = {"apple": False}
    real_apple = server.verify_apple_token
    async def spy(token):
        called["apple"] = True
        return await real_apple(token)
    server.verify_apple_token = spy
    try:
        firebase_like = mint(iss="https://securetoken.google.com/tefillah-2283c")
        await server.verify_firebase_token(firebase_like)
        check("non-Apple issuer does NOT reach the Apple verifier", not called["apple"])
        called["apple"] = False
        await server.verify_firebase_token("not-a-jwt-at-all")
        check("non-JWT garbage does NOT reach the Apple verifier", not called["apple"])
    finally:
        server.verify_apple_token = real_apple

    # ---- JWKS refetch is BOUNDED --------------------------------------------
    # The kid lookup happens before signature verification, so forged tokens
    # with random kids would otherwise each force a live fetch to Apple and get
    # our egress IP throttled -- which breaks real sign-ins.
    #
    # This patches the NETWORK layer and runs the REAL _get_apple_keys, because
    # the throttle lives inside that function: stubbing it out would measure
    # nothing (an earlier version of this test did exactly that and "failed"
    # against correct code).
    fetches = {"n": 0}

    class _Resp:
        def raise_for_status(self): pass
        def json(self): return {"keys": [_jwk()]}

    class _Client:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def get(self, url):
            fetches["n"] += 1
            return _Resp()

    class _Httpx:
        AsyncClient = _Client

    real_httpx = server.httpx
    server._get_apple_keys = real_get_keys
    server.httpx = _Httpx
    try:
        # warm cache, as production would be after the first real sign-in
        server._apple_jwks["keys"] = [_jwk()]
        server._apple_jwks["fetched_at"] = datetime.now(timezone.utc).timestamp()
        before = fetches["n"]
        for _ in range(10):
            await verify(mint(kid="forged-kid"))
        spent = fetches["n"] - before
        check(f"10 forged kids cause 0 extra live JWKS fetches (got {spent})", spent == 0)
    finally:
        server.httpx = real_httpx
        server._get_apple_keys = fake_keys

    print()
    if failures:
        print(f"{len(failures)} CHECK(S) FAILED: {failures}")
        return 1
    print("ALL APPLE AUTH CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(run()))
