"""
Self-contained checks for Sign in with Apple token REVOCATION.

No framework: plain asserts, run it directly. No network, no database.
    backend/.venv/Scripts/python.exe tests/test_apple_revoke.py

Apple App Store guideline 5.1.1(v) requires that deleting an account also
revokes the user's Apple token. That makes this a *compliance* path, not an
auth path, and it inverts the usual rule:

  verify_apple_token fails CLOSED  — it guards access; a misconfigured deploy
                                     must refuse every Apple sign-in.
  revocation      fails SOFT       — it guards nothing; a misconfigured deploy
                                     must still let users delete their accounts.

So the checks below are mostly about what must NOT happen: no exception may
escape into the delete path, no delete may be skipped, and the one-time Apple
authorization code (a credential) must never reach the logs.
"""
import asyncio
import logging
import os
import sys
import types
import warnings
from datetime import datetime, timezone
from pathlib import Path

warnings.filterwarnings("ignore")

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
os.environ["DB_NAME"] = "tefilah_test"          # never prod, even for imports
os.environ.pop("PRODUCTION", None)

from cryptography.hazmat.primitives import serialization      # noqa: E402
from cryptography.hazmat.primitives.asymmetric import ec      # noqa: E402

BUNDLE = "com.tefilah.app"
SERVICE = "com.tefilah.app.web"
TEAM = "KY52RZ3ZFK"
KEY_ID = "D72A2BMF4H"
CODE = "c-THIS-IS-THE-ONE-TIME-AUTHORIZATION-CODE"   # must never appear in logs
REFRESH = "r-THIS-IS-THE-REFRESH-TOKEN"

# A throwaway P-256 key standing in for the real .p8. Injected with LITERAL \n
# escapes, which is how EB and most env stores have to carry a PEM — server.py
# is expected to normalise it back.
_ec = ec.generate_private_key(ec.SECP256R1())
_PEM = _ec.private_bytes(serialization.Encoding.PEM,
                         serialization.PrivateFormat.PKCS8,
                         serialization.NoEncryption()).decode()
os.environ["APPLE_TEAM_ID"] = TEAM
os.environ["APPLE_KEY_ID"] = KEY_ID
os.environ["APPLE_PRIVATE_KEY"] = _PEM.replace("\n", "\\n")

import jwt                                      # noqa: E402
import server                                   # noqa: E402

server.APPLE_BUNDLE_ID = BUNDLE
server.APPLE_SERVICE_ID = SERVICE


# ---- fake Apple over HTTP (no network) -------------------------------------
CALLS = []                       # [(url, form-data), ...]
ORDER = []                       # "revoke" / "delete", to prove the sequence
NEXT = {"resp": None, "raise": None}


class _Resp:
    def __init__(self, status=200, payload=None):
        self.status_code, self._payload = status, (payload or {})

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            # httpx's own message carries the URL and status only — never the
            # request body. Mirrored here so the "no code in logs" check below
            # is testing our code, not a convenient stub.
            raise RuntimeError(
                f"Client error '{self.status_code}' for url '{APPLE_ANY}'")


APPLE_ANY = "https://appleid.apple.com/auth/..."


class _Client:
    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def post(self, url, data=None):
        CALLS.append((url, dict(data or {})))
        ORDER.append("revoke" if url == server.APPLE_REVOKE_URL else "exchange")
        if NEXT["raise"]:
            raise NEXT["raise"]
        return NEXT["resp"] or _Resp()


server.httpx = types.SimpleNamespace(AsyncClient=_Client)


def apple_returns(resp=None, raises=None):
    CALLS.clear()
    NEXT["resp"], NEXT["raise"] = resp, raises


def id_token(aud=BUNDLE):
    """An Apple identity token shape. Only `aud` matters here: by the time the
    revocation code reads it, verify_apple_token has already checked the
    signature — these helpers never verify anything."""
    return jwt.encode({"iss": server.APPLE_ISSUER, "aud": aud, "sub": "apple-sub-1"},
                      "irrelevant", algorithm="HS256")


# ---- capture everything server.py logs, for the secret-leak check ----------
LOG_LINES = []


class _Capture(logging.Handler):
    def emit(self, record):
        try:
            LOG_LINES.append(record.getMessage())
        except Exception:
            LOG_LINES.append("<unformattable>")


server.logger.addHandler(_Capture())


# ---- fake data layer (no database) -----------------------------------------
DELETED = {"users": [], "partners": [], "anonymized": [], "detached": []}


def _fake_repos():
    async def _delete_user(uid):
        DELETED["users"].append(uid)
        ORDER.append("delete")
        return 1

    async def _get_user(uid):
        return dict(USER_ROW) if uid == USER_ROW["_id"] else None

    async def _anonymize(uid):
        DELETED["anonymized"].append(uid)

    async def _detach(uid):
        DELETED["detached"].append(uid)

    return types.SimpleNamespace(
        users=types.SimpleNamespace(get=_get_user, delete=_delete_user),
        prayer_requests=types.SimpleNamespace(anonymize_user=_anonymize),
        notifications=types.SimpleNamespace(detach_recipient=_detach),
    )


USER_ROW = {"_id": "user-1", "email": "a@b.c", "name": "Ann",
            "apple_refresh_token": REFRESH, "apple_client_id": BUNDLE}


async def run():
    failures = []

    def check(label, condition):
        print(f"  {'PASS' if condition else 'FAIL'}  {label}")
        if not condition:
            failures.append(label)

    # ---- the .p8 survives env-store escaping --------------------------------
    check("literal \\n in APPLE_PRIVATE_KEY normalised back to a real PEM",
          server.APPLE_PRIVATE_KEY == _PEM)

    # ---- client_secret is a well-formed Apple client secret -----------------
    secret = server._apple_client_secret(BUNDLE)
    check("client_secret is produced when key material is set", bool(secret))

    header = jwt.get_unverified_header(secret)
    check("client_secret alg is ES256 (Apple accepts nothing else)",
          header.get("alg") == "ES256")
    check("client_secret header kid is the Apple Key ID",
          header.get("kid") == KEY_ID)

    claims = jwt.decode(secret, _ec.public_key(), algorithms=["ES256"],
                        audience=server.APPLE_ISSUER)
    check("client_secret iss is the Team ID", claims.get("iss") == TEAM)
    check("client_secret aud is https://appleid.apple.com",
          claims.get("aud") == server.APPLE_ISSUER)
    check("client_secret sub is the client_id", claims.get("sub") == BUNDLE)
    check("client_secret sub follows the client_id (Service ID for web)",
          jwt.decode(server._apple_client_secret(SERVICE), _ec.public_key(),
                     algorithms=["ES256"],
                     audience=server.APPLE_ISSUER).get("sub") == SERVICE)

    life = claims["exp"] - claims["iat"]
    check(f"client_secret lifetime is positive and short ({life}s)", 0 < life <= 900)
    check("client_secret exp is inside Apple's 6-month ceiling",
          life <= 15777000)
    check("client_secret is already valid (iat not in the future)",
          claims["iat"] <= datetime.now(timezone.utc).timestamp() + 5)

    # ---- unconfigured -> no secret, and NOTHING is attempted ----------------
    for field in ("APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY"):
        saved = getattr(server, field)
        setattr(server, field, "")
        check(f"no client_secret when {field} is unset",
              server._apple_client_secret(BUNDLE) is None)
        setattr(server, field, saved)
    check("no client_secret without a client_id",
          server._apple_client_secret("") is None)

    # ---- client_id comes from the token's own audience ----------------------
    check("client_id of a native token is the bundle id",
          server._apple_client_id(id_token(BUNDLE)) == BUNDLE)
    check("client_id of a web token is the Service ID",
          server._apple_client_id(id_token(SERVICE)) == SERVICE)
    check("REFUSES a client_id that is not one of ours",
          server._apple_client_id(id_token("com.someone.else")) is None)
    check("REFUSES garbage that is not a JWT",
          server._apple_client_id("not.a.jwt") is None)

    # ---- code exchange ------------------------------------------------------
    apple_returns(_Resp(200, {"refresh_token": REFRESH}))
    got = await server.exchange_apple_code(CODE, BUNDLE)
    check("exchange returns Apple's refresh_token", got == REFRESH)
    url, form = CALLS[0]
    check("exchange posts to Apple's /auth/token", url == server.APPLE_TOKEN_URL)
    check("exchange sends grant_type=authorization_code",
          form.get("grant_type") == "authorization_code")
    check("exchange sends the code and client_id",
          form.get("code") == CODE and form.get("client_id") == BUNDLE)
    check("exchange sends a signed client_secret, not the raw key",
          form.get("client_secret") not in (None, "", server.APPLE_PRIVATE_KEY))

    apple_returns(_Resp(200, {"refresh_token": REFRESH}))
    saved = server.APPLE_PRIVATE_KEY
    server.APPLE_PRIVATE_KEY = ""
    check("exchange short-circuits to None when the key is unset",
          await server.exchange_apple_code(CODE, BUNDLE) is None)
    check("...and makes NO call to Apple", not CALLS)
    server.APPLE_PRIVATE_KEY = saved

    # ---- link fields (what /auth/social stores) -----------------------------
    apple_returns(_Resp(200, {"refresh_token": REFRESH}))
    fields = await server._apple_link_fields(CODE, id_token(), "apple.com")
    check("Apple login with a code stores the refresh token + client_id",
          fields == {"apple_refresh_token": REFRESH, "apple_client_id": BUNDLE})

    apple_returns(_Resp(200, {"refresh_token": REFRESH}))
    check("no code -> nothing stored, no call",
          await server._apple_link_fields(None, id_token(), "apple.com") == {}
          and not CALLS)
    check("Google login -> nothing stored, no call",
          await server._apple_link_fields(CODE, id_token(), "google.com") == {}
          and not CALLS)

    apple_returns(raises=RuntimeError("apple is down"))
    check("Apple failing during sign-in stores nothing and does NOT raise",
          await server._apple_link_fields(CODE, id_token(), "apple.com") == {})

    apple_returns(_Resp(400))
    check("Apple 400 during sign-in stores nothing and does NOT raise",
          await server._apple_link_fields(CODE, id_token(), "apple.com") == {})

    # ---- revocation ---------------------------------------------------------
    apple_returns(_Resp(200))          # Apple: 200 with an EMPTY body
    check("revoke reports success on Apple's empty 200",
          await server.revoke_apple_token(REFRESH, BUNDLE) is True)
    url, form = CALLS[0]
    check("revoke posts to Apple's /auth/revoke", url == server.APPLE_REVOKE_URL)
    check("revoke sends token + token_type_hint=refresh_token",
          form.get("token") == REFRESH
          and form.get("token_type_hint") == "refresh_token")
    check("revoke sends the client_id the token belongs to",
          form.get("client_id") == BUNDLE)

    # ---- revocation is SKIPPED CLEANLY when unconfigured --------------------
    saved = server.APPLE_PRIVATE_KEY
    server.APPLE_PRIVATE_KEY = ""
    apple_returns(_Resp(200))
    check("revoke returns False (not an exception) with no key material",
          await server.revoke_apple_token(REFRESH, BUNDLE) is False)
    check("...and never calls Apple", not CALLS)

    mark = len(LOG_LINES)
    await server._revoke_apple_for_account(dict(USER_ROW))
    check("unconfigured revocation logs a clear SKIPPED warning",
          any("SKIP" in ln.upper() for ln in LOG_LINES[mark:]))
    server.APPLE_PRIVATE_KEY = saved

    # ---- _revoke_apple_for_account NEVER raises -----------------------------
    # Every one of these is a real production state, and every one of them must
    # end with the account still being deletable.
    async def survives(label, account, **apple):
        apple_returns(**apple) if apple else apple_returns(_Resp(200))
        try:
            await server._revoke_apple_for_account(account)
            check(f"no exception escapes: {label}", True)
        except BaseException as e:                     # noqa: BLE001 - the point
            check(f"no exception escapes: {label} ({type(e).__name__})", False)

    await survives("account is None", None)
    await survives("account has no Apple token", {"_id": "u", "email": "a@b.c"})
    await survives("Apple returns 400 (token already revoked)",
                   dict(USER_ROW), resp=_Resp(400))
    await survives("Apple returns 500", dict(USER_ROW), resp=_Resp(500))
    await survives("connection to Apple fails",
                   dict(USER_ROW), raises=OSError("connection refused"))
    await survives("Apple times out",
                   dict(USER_ROW), raises=TimeoutError("read timeout"))
    await survives("stored token is empty", {"_id": "u", "apple_refresh_token": ""})
    await survives("client_id was never stored (legacy row)",
                   {"_id": "u", "apple_refresh_token": REFRESH})

    apple_returns(_Resp(200))
    await server._revoke_apple_for_account({"_id": "u", "email": "a@b.c"})
    check("a non-Apple account never calls Apple at all", not CALLS)

    # ---- DELETION IS NEVER BLOCKED BY REVOCATION ---------------------------
    # The whole point of the feature: a user's right to delete outranks the
    # revoke call. These run the REAL deletion functions with a fake data layer.
    real_repos, real_avatar = server.repos, server._delete_avatar
    real_log, real_notice = server.log_activity, server.send_account_notice

    async def _noop(*a, **k):
        return None

    server.repos = _fake_repos()
    server._delete_avatar = _noop
    server.log_activity = _noop
    server.send_account_notice = _noop
    try:
        # Admin-initiated delete, with Apple exploding.
        DELETED["users"].clear()
        apple_returns(raises=RuntimeError("apple exploded"))
        deleted = await server._cascade_delete_user("user-1")
        check("_cascade_delete_user still deletes when revocation raises",
              deleted == 1 and DELETED["users"] == ["user-1"])
        check("_cascade_delete_user still runs its side effects",
              DELETED["anonymized"] == ["user-1"] and DELETED["detached"] == ["user-1"])

        # Self-serve delete (DELETE /me), with Apple exploding.
        DELETED["users"].clear()
        apple_returns(raises=RuntimeError("apple exploded"))
        me = dict(USER_ROW, _user_type="user")
        result = await server.delete_my_account(me)
        check("DELETE /me still deletes when revocation raises",
              DELETED["users"] == ["user-1"])
        check("DELETE /me response is unchanged",
              result == {"message": "Your account and associated data have been "
                                    "permanently deleted."})

        # Same, with the key material absent (an unconfigured deploy).
        DELETED["users"].clear()
        saved = server.APPLE_PRIVATE_KEY
        server.APPLE_PRIVATE_KEY = ""
        apple_returns(_Resp(200))
        await server.delete_my_account(dict(USER_ROW, _user_type="user"))
        check("DELETE /me deletes normally on an UNCONFIGURED deploy",
              DELETED["users"] == ["user-1"] and not CALLS)
        server.APPLE_PRIVATE_KEY = saved

        # And the happy path: an Apple account IS revoked before it is deleted.
        DELETED["users"].clear()
        apple_returns(_Resp(200))
        ORDER.clear()
        await server.delete_my_account(dict(USER_ROW, _user_type="user"))
        check("an Apple account IS revoked on deletion",
              [c[0] for c in CALLS] == [server.APPLE_REVOKE_URL])
        # Apple must be told while the row still exists — once it is gone we no
        # longer hold the refresh token, so a later revoke is impossible.
        check("revocation happens BEFORE the row is deleted",
              ORDER == ["revoke", "delete"])

        DELETED["users"].clear()
        apple_returns(_Resp(200))
        ORDER.clear()
        await server._cascade_delete_user("user-1")
        check("_cascade_delete_user also revokes before deleting",
              ORDER == ["revoke", "delete"])
    finally:
        server.repos, server._delete_avatar = real_repos, real_avatar
        server.log_activity, server.send_account_notice = real_log, real_notice

    # ---- NOTHING SECRET IS EVER LOGGED -------------------------------------
    # Covers every line emitted by every case above, success and failure alike.
    blob = "\n".join(LOG_LINES)
    check("the one-time authorization code is never logged", CODE not in blob)
    check("the refresh token is never logged", REFRESH not in blob)
    check("the .p8 private key is never logged",
          "PRIVATE KEY" not in blob
          and _PEM.splitlines()[1] not in blob)
    check("no signed client_secret is ever logged",
          not any("eyJ" in ln for ln in LOG_LINES))

    print()
    if failures:
        print(f"{len(failures)} CHECK(S) FAILED: {failures}")
        return 1
    print("ALL APPLE REVOCATION CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(run()))
