"""
Phase 6 -- DIFFERENTIAL test: drive MongoRepos and DynamoRepos through the SAME
read calls and prove they answer the same thing. This is the cutover gate.

05_parity.py checks that the DATA landed. This checks that the CODE reading it
behaves identically -- which is the thing server.py actually depends on.

    python migration/06_differential.py                 # all repos
    python migration/06_differential.py --repo users -v
    python migration/06_differential.py --self-check    # prove the detector works
    python migration/06_differential.py --wait 300      # poll for in-flight repos

STRICTLY READ-ONLY on both sides, and enforced rather than promised: the Motor
database and every boto3 Table are wrapped in proxies that raise on any write
method, so a typo in the skip-list cannot mutate anything. The source database
DEFAULTS to `tefilah_test` and the name `tefilah` is REFUSED outright -- that
is the live production database and .env points at it.

--------------------------------------------------------------------------
WHAT IS NORMALISED (and what deliberately is NOT)
--------------------------------------------------------------------------
int / float / Decimal   compared numerically. Decimal("1") == 1 == 1.0.
bool                    NEVER numeric. True vs 1 / Decimal(1) is a VALUE
                        failure, because plain Python would call them equal
                        and a boolean silently becoming a number is exactly
                        the corruption this gate exists to catch.
datetime                compared as UTC instants; naive is assumed UTC.
datetime vs ISO string  the INSTANT is compared, but a surviving type
                        difference is reported as TYPE, not swallowed:
                        server.py calls .isoformat() and does arithmetic on
                        these, so a str where a datetime belongs is a crash
                        waiting at runtime.
dict key order          irrelevant (compared key by key).
list order              ORDER-SENSITIVE BY DEFAULT. Only the handful of
                        methods whose Mongo query has no sort at all are
                        marked unordered=True (see the case table). Anything
                        sorted by submitted_at / created_at / timestamp is
                        compared in order, and a permutation is a real
                        failure.
ties                    ...except a permutation that is explained purely by
                        equal sort keys, which Mongo does not promise either.
                        That is reported as TIE_ORDER: printed, not fatal.
absent vs None          reported. NULL_DROPPED when Mongo held an explicit
                        None, MISSING when a real value vanished. MISSING is
                        fatal; NULL_DROPPED is ADVISORY by default (pass
                        --strict-nulls to make it fatal) because 04_backfill
                        drops top-level nulls BY DESIGN -- it has to, DynamoDB
                        rejects NULL on a key attribute -- and every caller in
                        server.py reads those fields with .get(). It is still
                        counted and listed field by field, because doc[f]
                        would KeyError on DynamoDB and not on Mongo.
advisory cases          two exports have no sort in Mongo AND are truncated by
                        a limit, so "the first N" is undefined on either side.
                        Those cases are marked advisory: reported, never fatal.
"""
import argparse
import asyncio
import importlib
import json
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from bson.codec_options import CodecOptions          # noqa: E402
from dotenv import dotenv_values                     # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient   # noqa: E402

# The source database is NEVER taken from .env: DB_NAME there is production.
DEFAULT_SOURCE_DB = "tefilah_test"
PRODUCTION_DB = "tefilah"

MISSING_ID = "00000000-0000-0000-0000-000000000000"
MISSING_EMAIL = "nobody-not-a-real-account@example.invalid"
NO_MATCH = "zzz-no-such-substring-zzz"

REPO_NAMES = ("avatars", "activity_logs", "llm_logs", "admins", "users",
              "partners", "prayer_cells", "notifications", "prayer_requests")


# ==========================================================================
# read-only enforcement
# ==========================================================================
_MONGO_WRITES = {
    "insert_one", "insert_many", "update_one", "update_many", "replace_one",
    "delete_one", "delete_many", "drop", "bulk_write", "rename",
    "find_one_and_update", "find_one_and_delete", "find_one_and_replace",
    "create_index", "create_indexes", "drop_index", "drop_indexes",
    "create_search_index", "drop_search_index", "update_search_index",
}
_DYNAMO_WRITES = {
    "put_item", "update_item", "delete_item", "batch_writer", "batch_write_item",
    "transact_write_items", "update", "delete", "update_table", "delete_table",
    "update_time_to_live", "tag_resource", "untag_resource",
}


class _ReadOnly:
    """Attribute proxy that refuses a named set of methods."""

    def __init__(self, inner, banned, label):
        object.__setattr__(self, "_inner", inner)
        object.__setattr__(self, "_banned", banned)
        object.__setattr__(self, "_label", label)

    def __getattr__(self, name):
        if name in object.__getattribute__(self, "_banned"):
            raise RuntimeError(
                f"READ-ONLY GUARD: 06_differential refused "
                f"{object.__getattribute__(self, '_label')}.{name}()")
        return getattr(object.__getattribute__(self, "_inner"), name)

    def __setattr__(self, name, value):
        raise RuntimeError("READ-ONLY GUARD: refusing attribute assignment")


class _RODatabase:
    """Motor database handle that only ever hands out read-only collections."""

    def __init__(self, db):
        self._db = db

    def __getitem__(self, name):
        return _ReadOnly(self._db[name], _MONGO_WRITES, f"mongo.{name}")

    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)
        return self[name]


def guard_dynamo(repos):
    """Wrap every boto3 Table on a DynamoRepos so writes raise."""
    for name in REPO_NAMES:
        r = getattr(repos, name, None)
        table = getattr(r, "_t", None)
        if table is not None and not isinstance(table, _ReadOnly):
            object.__setattr__(r, "_t",
                               _ReadOnly(table, _DYNAMO_WRITES, f"dynamo.{name}"))
    return repos


# ==========================================================================
# normalisation + comparison
# ==========================================================================
NUMS = (int, float, Decimal)


@dataclass
class Diff:
    kind: str
    path: str
    mongo: Any
    dynamo: Any


# Reported but not gating. TIE_ORDER is a documented non-guarantee on BOTH
# sides; NULL_DROPPED is 04_backfill's deliberate top-level-null drop (promote
# it with --strict-nulls). Everything else fails the gate.
NON_FATAL = {"TIE_ORDER", "NULL_DROPPED", "HEARTBEAT", "FANOUT_DROPPED"}

# Fields rewritten by ordinary authenticated READS, so the two stores diverge
# simply by being exercised -- including by this tool and by the golden harness
# (get_current_partner writes last_active on any request >30s after the last).
# Comparing them across two independently-exercised backends is meaningless.
# Matches HEARTBEAT_FIELDS in 05_parity.py; the two gates must agree.
HEARTBEAT_FIELDS = {"last_active", "last_login"}

# target_ids cannot survive the notification fan-out: DynamoDB stores one row
# PER RECIPIENT, so the original recipient list is not reconstructible from a
# single row. Reconstructing it as [recipient_id] would be worse than omitting
# it -- it would assert a single-recipient list that was never true. Verified by
# grep that no caller reads target_ids off a returned doc (server.py only reads
# _id/title/message/type/read_by/prayer_id/created_at); read_by IS rebuilt.
FANOUT_DROPPED_FIELDS = {"target_ids"}


def _leaf(path):
    return path.rsplit(".", 1)[-1]


def _utc(dt):
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def as_instant(v):
    """datetime -> UTC datetime; ISO-8601 string -> UTC datetime; else None."""
    if isinstance(v, datetime):
        return _utc(v)
    if isinstance(v, str) and 19 <= len(v) <= 32 and v[4] == "-" and "T" in v:
        try:
            return _utc(datetime.fromisoformat(v.replace("Z", "+00:00")))
        except ValueError:
            return None
    return None


def scalar_kind(m, d):
    """None if equivalent, else the Diff kind."""
    # bool FIRST: True == 1 == Decimal(1) in plain Python.
    if isinstance(m, bool) or isinstance(d, bool):
        return None if (isinstance(m, bool) and isinstance(d, bool) and m == d) else "VALUE"
    if isinstance(m, NUMS) and isinstance(d, NUMS):
        return None if Decimal(str(m)) == Decimal(str(d)) else "VALUE"
    if isinstance(m, datetime) or isinstance(d, datetime):
        im, idd = as_instant(m), as_instant(d)
        if im is None or idd is None or im != idd:
            return "VALUE"
        return None if type(m) is type(d) else "TYPE"
    return None if m == d else "VALUE"


def diff(m, d, path=""):
    """Recursive comparison of two decoded documents/values."""
    out = []
    if isinstance(m, dict) and isinstance(d, dict):
        for k in sorted(set(m) | set(d)):
            p = f"{path}.{k}" if path else k
            if k not in d:
                if k in HEARTBEAT_FIELDS:
                    kind = "HEARTBEAT"
                elif k in FANOUT_DROPPED_FIELDS:
                    kind = "FANOUT_DROPPED"
                else:
                    kind = "NULL_DROPPED" if m[k] is None else "MISSING"
                out.append(Diff(kind, p, m[k], "<absent in dynamo>"))
            elif k not in m:
                out.append(Diff("EXTRA", p, "<absent in mongo>", d[k]))
            elif k in HEARTBEAT_FIELDS:
                for sub in diff(m[k], d[k], p):
                    out.append(Diff("HEARTBEAT", sub.path, sub.mongo, sub.dynamo))
            else:
                out += diff(m[k], d[k], p)
        return out
    if isinstance(m, (list, tuple)) and isinstance(d, (list, tuple)):
        if len(m) != len(d):
            return [Diff("LEN", path, f"list[{len(m)}]", f"list[{len(d)}]")]
        for i, (a, b) in enumerate(zip(m, d)):
            out += diff(a, b, f"{path}[{i}]")
        return out
    k = scalar_kind(m, d)
    return [Diff(k, path, m, d)] if k else out


def _norm(v):
    """Canonical form for multiset comparison (types collapsed, values kept)."""
    if isinstance(v, bool):
        return f"bool:{v}"
    if isinstance(v, NUMS):
        return f"num:{Decimal(str(v)).normalize()}"
    inst = as_instant(v)
    if inst is not None:
        return f"dt:{inst.isoformat()}"
    if isinstance(v, dict):
        return {k: _norm(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_norm(x) for x in v]
    return v


def canon(v):
    return json.dumps(_norm(v), sort_keys=True, default=str)


def _all_keyed(rows):
    return bool(rows) and all(isinstance(r, dict) and "_id" in r for r in rows)


def list_diff(m, d, path, unordered, sort_field):
    out = []
    if _all_keyed(m) and _all_keyed(d):
        mi = {r["_id"]: r for r in m}
        di = {r["_id"]: r for r in d}
        if len(mi) == len(m) and len(di) == len(d):      # no duplicate ids
            for k in [r["_id"] for r in m if r["_id"] not in di]:
                out.append(Diff("MISSING", f"{path}[_id={k}]",
                                canon(mi[k])[:200], "<absent in dynamo>"))
            for k in [r["_id"] for r in d if r["_id"] not in mi]:
                out.append(Diff("EXTRA", f"{path}[_id={k}]",
                                "<absent in mongo>", canon(di[k])[:200]))
            for k in [r["_id"] for r in m if r["_id"] in di]:
                out += diff(mi[k], di[k], f"{path}[_id={k}]")
            if not unordered:
                sm, sd = [r["_id"] for r in m], [r["_id"] for r in d]
                if sm != sd and set(sm) == set(sd):
                    tie = (sort_field is not None
                           and [canon(r.get(sort_field)) for r in m]
                           == [canon(r.get(sort_field)) for r in d])
                    out.append(Diff("TIE_ORDER" if tie else "ORDER", path,
                                    sm[:12], sd[:12]))
            return out

    if unordered:
        cm, cd = sorted(canon(x) for x in m), sorted(canon(x) for x in d)
        if cm != cd:
            only_m = [x for x in cm if x not in cd][:5]
            only_d = [x for x in cd if x not in cm][:5]
            out.append(Diff("VALUE", path,
                            f"{len(cm)} items, e.g. only-in-mongo {only_m}",
                            f"{len(cd)} items, e.g. only-in-dynamo {only_d}"))
        return out
    return diff(m, d, path)


def compare(m, d, path="", *, unordered=False, sort_field=None):
    """Top-level result comparison; list policy applies to top-level lists only."""
    if isinstance(m, tuple) and isinstance(d, tuple):
        if len(m) != len(d):
            return [Diff("LEN", path, f"tuple[{len(m)}]", f"tuple[{len(d)}]")]
        out = []
        for i, (a, b) in enumerate(zip(m, d)):
            out += compare(a, b, f"{path}[{i}]", unordered=unordered,
                           sort_field=sort_field)
        return out
    if isinstance(m, list) and isinstance(d, list):
        return list_diff(m, d, path, unordered, sort_field)
    return diff(m, d, path)


# ==========================================================================
# cases
# ==========================================================================
@dataclass
class Case:
    repo: str
    method: str
    args: tuple = ()
    kwargs: dict = field(default_factory=dict)
    unordered: bool = False
    sort_field: str = None
    note: str = ""
    advisory: str = ""      # non-empty = differences here can never gate

    @property
    def label(self):
        bits = [repr(a) for a in self.args]
        bits += [f"{k}={v!r}" for k, v in self.kwargs.items()]
        call = ", ".join(bits)
        if len(call) > 160:
            call = call[:157] + "..."
        return f"{self.repo}.{self.method}({call})"


def is_write(name: str) -> bool:
    return (name.startswith(("insert", "update", "delete", "mark_", "assign",
                             "release_", "anonymize_", "adjust_"))
            or name in {"ensure_indexes", "set_message", "detach_recipient",
                        "unassign", "bulk_unassign"})


async def build_fixtures(db):
    """Real ids/emails/dates pulled out of the source data, plus deliberate
    misses (unknown id, empty window, no-match search, page past the end)."""
    users = await db.users.find({}).to_list(None)
    partners = await db.partners.find({}).to_list(None)
    admins = await db.admins.find({}).to_list(None)
    prayers = await db.prayer_requests.find({}).to_list(None)
    notifs = await db.notifications.find({}).to_list(None)
    avatars = await db.avatars.find({}, {"_id": 1}).to_list(None)

    assigned = [p for p in prayers if p.get("assigned_partner_id")]
    prayed = [p for p in prayers if p.get("status") == "prayed" and p.get("prayed_at")]
    with_user = [p for p in prayers if p.get("user_id")]

    busy_partner = assigned[0]["assigned_partner_id"] if assigned else MISSING_ID
    busy_ids = {p.get("assigned_partner_id") for p in prayers}
    idle_partner = next((p["_id"] for p in partners if p["_id"] not in busy_ids),
                        MISSING_ID)

    reset = await db.users.find_one({"password_reset_code": {"$exists": True}})
    tokened = await db.users.find_one({"fcm_token": {"$exists": True, "$ne": None}})

    # a recipient who HAS notifications, and one who has read at least one
    recipients = [t for n in notifs for t in (n.get("target_ids") or [])]
    read_recipient = next((r for n in notifs for r in (n.get("read_by") or [])),
                          recipients[0] if recipients else MISSING_ID)

    now = datetime.now(timezone.utc)
    dates = [d for d in (u.get("created_at") for u in users) if isinstance(d, datetime)]
    dates += [d for d in (p.get("submitted_at") for p in prayers) if isinstance(d, datetime)]
    dates = [_utc(d) for d in dates]
    oldest = (min(dates) - timedelta(days=1)) if dates else now - timedelta(days=3650)
    midpoint = sorted(dates)[len(dates) // 2] if dates else now

    name = next((u.get("name") for u in users if u.get("name") and len(u["name"]) > 3), "a")

    return {
        "user_ids": [u["_id"] for u in users[:3]] or [MISSING_ID],
        "user_emails": [u["email"] for u in users[:2] if u.get("email")],
        "partner_ids": [p["_id"] for p in partners[:2]] or [MISSING_ID],
        "partner_emails": [p["email"] for p in partners[:2] if p.get("email")],
        "admin_ids": [a["_id"] for a in admins],
        "admin_emails": [a["email"] for a in admins if a.get("email")],
        "busy_partner": busy_partner,
        "idle_partner": idle_partner,
        "assigned_prayer": (assigned[0]["_id"], busy_partner) if assigned else (MISSING_ID, MISSING_ID),
        "prayed_prayer": (prayed[0]["_id"], prayed[0].get("assigned_partner_id"))
                         if prayed else (MISSING_ID, MISSING_ID),
        "user_prayer": (with_user[0]["_id"], with_user[0]["user_id"])
                       if with_user else (MISSING_ID, MISSING_ID),
        "prayed_user": next((p["user_id"] for p in prayed if p.get("user_id")), MISSING_ID),
        "reset_email": reset["email"] if reset else None,
        "token_ids": [tokened["_id"]] if tokened else [],
        "recipient": recipients[0] if recipients else MISSING_ID,
        "read_recipient": read_recipient,
        "avatar_id": avatars[0]["_id"] if avatars else MISSING_ID,
        "oldest": oldest,
        "midpoint": midpoint,
        "future": now + timedelta(days=365),
        "now": now,
        "search": name[:4],
        "n_prayers": len(prayers),
    }


def build_cases(f):
    C = Case
    ids3 = f["user_ids"]
    cases = []

    # ---- avatars ----------------------------------------------------------
    cases += [
        C("avatars", "get", (f["avatar_id"],), note="the one legacy blob"),
        C("avatars", "get", (MISSING_ID,), note="unknown id"),
    ]

    # ---- activity_logs ----------------------------------------------------
    cases += [
        C("activity_logs", "list", sort_field="timestamp"),
        C("activity_logs", "list", kwargs={"limit": 5}, sort_field="timestamp"),
        C("activity_logs", "list", kwargs={"skip": 10, "limit": 5}, sort_field="timestamp"),
        C("activity_logs", "list", kwargs={"skip": 100000, "limit": 5},
          sort_field="timestamp", note="page past the end -> empty"),
        C("activity_logs", "list", kwargs={"action": "admin_login", "limit": 50},
          sort_field="timestamp"),
        C("activity_logs", "list", kwargs={"actor_type": "partner", "limit": 50},
          sort_field="timestamp"),
        C("activity_logs", "list", kwargs={"action": NO_MATCH}, sort_field="timestamp",
          note="filter that matches nothing"),
        C("activity_logs", "list", kwargs={"action": "admin_login",
                                           "actor_type": "admin", "limit": 50},
          sort_field="timestamp"),
        C("activity_logs", "export", sort_field="timestamp"),
        C("activity_logs", "export", kwargs={"limit": 7}, sort_field="timestamp"),
    ]

    # ---- llm_logs ---------------------------------------------------------
    cases += [
        C("llm_logs", "count_all"),
        C("llm_logs", "total_tokens"),
        C("llm_logs", "daily_usage", (f["oldest"], "%Y-%m-%d"), sort_field="_id"),
        C("llm_logs", "daily_usage", (f["oldest"], "%Y-%m"), sort_field="_id"),
        C("llm_logs", "daily_usage", (f["midpoint"], "%Y-%m-%d"), sort_field="_id"),
        C("llm_logs", "daily_usage", (f["future"], "%Y-%m-%d"), sort_field="_id",
          note="window in the future -> empty"),
        C("llm_logs", "list", sort_field="timestamp"),
        C("llm_logs", "list", kwargs={"status": "success", "limit": 25}, sort_field="timestamp"),
        C("llm_logs", "list", kwargs={"status": "error", "limit": 25}, sort_field="timestamp"),
        C("llm_logs", "list", kwargs={"status": NO_MATCH}, sort_field="timestamp"),
        C("llm_logs", "list", kwargs={"skip": 590, "limit": 25}, sort_field="timestamp",
          note="last page"),
        C("llm_logs", "list", kwargs={"skip": 100000, "limit": 25}, sort_field="timestamp"),
        # mongo.py marks this query as intentionally unsorted, so order is not a contract
        C("llm_logs", "export", unordered=True),
        C("llm_logs", "export", kwargs={"limit": 3}, unordered=True,
          advisory="unsorted query + limit: 'the first 3' is undefined on "
                   "both backends, so the subsets legitimately differ"),
    ]

    # ---- shared account surface (admins / users / partners) ---------------
    for repo, ids, emails in (("admins", f["admin_ids"], f["admin_emails"]),
                              ("users", f["user_ids"], f["user_emails"]),
                              ("partners", f["partner_ids"], f["partner_emails"])):
        for i in ids[:2]:
            cases.append(C(repo, "get", (i,)))
        cases.append(C(repo, "get", (MISSING_ID,), note="unknown id"))
        for e in emails[:2]:
            cases.append(C(repo, "get_by_email", (e,)))
        cases += [
            C(repo, "get_by_email", (MISSING_EMAIL,), note="unknown email"),
            C(repo, "get_by_email_with_reset_code", (emails[0] if emails else MISSING_EMAIL,)),
            C(repo, "get_by_email_with_reset_code", (MISSING_EMAIL,)),
            C(repo, "email_taken_by_other",
              (emails[0] if emails else MISSING_EMAIL, MISSING_ID)),
            C(repo, "email_taken_by_other",
              (emails[0] if emails else MISSING_EMAIL, ids[0] if ids else MISSING_ID),
              note="excluded id IS the owner -> False"),
            C(repo, "email_taken_by_other", (MISSING_EMAIL, MISSING_ID)),
            C(repo, "fcm_tokens_for_ids", (ids[:2],), unordered=True),
            C(repo, "fcm_tokens_for_ids", ([MISSING_ID],), unordered=True),
            C(repo, "fcm_tokens_for_ids", ([],), unordered=True, note="empty id set"),
            C(repo, "email_name_for_ids", (ids[:2],), unordered=True),
            C(repo, "email_name_for_ids", ([MISSING_ID],), unordered=True),
        ]

    if f["reset_email"]:
        cases.append(C("users", "get_by_email_with_reset_code", (f["reset_email"],),
                       note="account that really holds a reset code"))
    if f["token_ids"]:
        cases.append(C("users", "fcm_tokens_for_ids", (f["token_ids"],), unordered=True,
                       note="id that really has an fcm_token"))

    # ---- admins -----------------------------------------------------------
    cases += [
        C("admins", "any_exists"),
        C("admins", "list_without_secrets", unordered=True, note="mongo find() has no sort"),
        C("admins", "daily_counts", ("created_at", f["oldest"]), sort_field="_id"),
    ]

    # ---- users ------------------------------------------------------------
    cases += [
        C("users", "exists", (ids3[0],)),
        C("users", "exists", (MISSING_ID,)),
        C("users", "count"),
        C("users", "count", kwargs={"status": "active"}),
        C("users", "count", kwargs={"status": "blocked"}, note="status with no rows"),
        C("users", "count", kwargs={"status_ne": "blocked"}),
        C("users", "count", kwargs={"last_login_since": f["oldest"]}),
        C("users", "count", kwargs={"last_login_since": f["future"]}),
        C("users", "count", kwargs={"created_since": f["oldest"]}),
        C("users", "count", kwargs={"created_since": f["midpoint"]}),
        C("users", "count", kwargs={"created_since": f["future"]}, note="empty window"),
        C("users", "count", kwargs={"status": "active", "created_since": f["oldest"]}),
        C("users", "list", sort_field="created_at"),
        C("users", "list", kwargs={"limit": 5}, sort_field="created_at"),
        C("users", "list", kwargs={"skip": 70, "limit": 20}, sort_field="created_at",
          note="last partial page"),
        C("users", "list", kwargs={"skip": 100000, "limit": 20}, sort_field="created_at",
          note="past the end"),
        C("users", "list", kwargs={"search": f["search"], "limit": 50}, sort_field="created_at"),
        C("users", "list", kwargs={"search": f["search"].upper(), "limit": 50},
          sort_field="created_at", note="case-insensitive search"),
        C("users", "list", kwargs={"search": NO_MATCH}, sort_field="created_at"),
        C("users", "list", kwargs={"status": "active", "limit": 50}, sort_field="created_at"),
        C("users", "list", kwargs={"status": "blocked"}, sort_field="created_at"),
        C("users", "export_without_secrets", unordered=True, note="mongo find() has no sort"),
        C("users", "export_without_secrets", kwargs={"limit": 5}, unordered=True,
          advisory="unsorted query + limit: the truncated subset is undefined"),
        C("users", "fcm_tokens", unordered=True),
        C("users", "all_email_name", unordered=True),
        C("users", "daily_counts", ("created_at", f["oldest"]), sort_field="_id"),
        C("users", "daily_counts", ("created_at", f["oldest"], f["now"], "%Y-%m-%d"),
          sort_field="_id"),
        C("users", "daily_counts", ("created_at", f["oldest"], f["now"], "%Y-%m"),
          sort_field="_id"),
        C("users", "daily_counts", ("last_login", f["oldest"]), sort_field="_id",
          note="sparse date field"),
        C("users", "daily_counts", ("created_at", f["future"]), sort_field="_id",
          note="empty window"),
    ]

    # ---- partners ---------------------------------------------------------
    cases += [
        C("partners", "count"),
        C("partners", "count", kwargs={"status": "active"}),
        C("partners", "count", kwargs={"status": "pending_approval"}),
        C("partners", "count", kwargs={"is_active": True}),
        C("partners", "count", kwargs={"is_active": False}),
        C("partners", "count", kwargs={"last_active_since": f["oldest"]}),
        C("partners", "count", kwargs={"last_active_since": f["future"]}),
        C("partners", "count", kwargs={"created_since": f["midpoint"]}),
        C("partners", "list", sort_field="created_at"),
        C("partners", "list", kwargs={"limit": 5}, sort_field="created_at"),
        C("partners", "list", kwargs={"skip": 40, "limit": 20}, sort_field="created_at"),
        C("partners", "list", kwargs={"skip": 100000, "limit": 20}, sort_field="created_at"),
        C("partners", "list", kwargs={"search": f["search"], "limit": 50}, sort_field="created_at"),
        C("partners", "list", kwargs={"search": NO_MATCH}, sort_field="created_at"),
        C("partners", "list", kwargs={"status": "pending_approval", "limit": 50},
          sort_field="created_at"),
        C("partners", "list", kwargs={"partner_type": "prayer_warrior", "limit": 50},
          sort_field="created_at"),
        C("partners", "list", kwargs={"partner_type": NO_MATCH}, sort_field="created_at"),
        C("partners", "for_assignment", sort_field="name"),
        C("partners", "export_without_secrets", unordered=True),
        C("partners", "fcm_tokens", unordered=True),
        C("partners", "all_email_name", unordered=True),
        C("partners", "daily_counts", ("created_at", f["oldest"]), sort_field="_id"),
        C("partners", "daily_counts", ("last_active", f["oldest"]), sort_field="_id"),
        C("partners", "daily_counts", ("created_at", f["future"]), sort_field="_id"),
    ]

    # ---- prayer_cells (collection is empty: everything must be empty/None) --
    cases += [
        C("prayer_cells", "list_active"),
        C("prayer_cells", "get_by_name", ("Jerusalem Cell",)),
        C("prayer_cells", "find_for_location", ("Chennai", "India")),
        C("prayer_cells", "find_for_location", ("", "")),
    ]

    # ---- notifications ----------------------------------------------------
    for aud in ("users", "partners"):
        for rid, tag in ((f["recipient"], "real recipient"),
                         (f["read_recipient"], "recipient with a read row"),
                         (MISSING_ID, "recipient with nothing")):
            cases += [
                C("notifications", "list_for", (rid, aud), sort_field="created_at", note=tag),
                C("notifications", "list_for", (rid, aud),
                  kwargs={"unread_only": True}, sort_field="created_at", note=tag),
                C("notifications", "count_for", (rid, aud), note=tag),
                C("notifications", "count_for", (rid, aud),
                  kwargs={"unread_only": True}, note=tag),
            ]
    cases += [
        C("notifications", "list_for", (f["recipient"], "users"),
          kwargs={"skip": 100000, "limit": 50}, sort_field="created_at",
          note="page past the end"),
        C("notifications", "list_for", (f["recipient"], "users"),
          kwargs={"skip": 0, "limit": 1}, sort_field="created_at"),
    ]

    # ---- prayer_requests --------------------------------------------------
    ap, app_ = f["assigned_prayer"]
    pp, ppp = f["prayed_prayer"]
    up, upu = f["user_prayer"]
    fields = {"_id": 1, "content": 1, "location_city": 1, "location_country": 1,
              "category": 1, "status": 1, "submitted_at": 1, "assigned_at": 1,
              "seen_by_partner": 1, "seen_at": 1, "user_id": 1}
    day_ago = f["now"] - timedelta(hours=24)
    cases += [
        C("prayer_requests", "get", (ap,)),
        C("prayer_requests", "get", (MISSING_ID,)),
        C("prayer_requests", "get_for_partner", (ap, app_)),
        C("prayer_requests", "get_for_partner", (ap, MISSING_ID),
          note="right prayer, wrong partner -> None"),
        C("prayer_requests", "get_for_partner", (pp, ppp),
          kwargs={"exclude_prayed": True}, note="already prayed -> None"),
        C("prayer_requests", "get_for_partner", (ap, app_),
          kwargs={"fields": {"seen_by_partner": 1}}, note="inclusion projection"),
        C("prayer_requests", "get_for_user", (up, upu)),
        C("prayer_requests", "get_for_user", (up, MISSING_ID)),
        C("prayer_requests", "last_answered_for_user", (f["prayed_user"],)),
        C("prayer_requests", "last_answered_for_user", (MISSING_ID,)),
        C("prayer_requests", "count"),
        C("prayer_requests", "count", kwargs={"user_id": upu}),
        C("prayer_requests", "count", kwargs={"user_id": MISSING_ID}),
        C("prayer_requests", "count", kwargs={"assigned_partner_id": f["busy_partner"]}),
        C("prayer_requests", "count", kwargs={"assigned_partner_id": f["idle_partner"]},
          note="partner with zero prayers"),
        C("prayer_requests", "count", kwargs={"status": "pending"}),
        C("prayer_requests", "count", kwargs={"status": "prayed"}),
        C("prayer_requests", "count", kwargs={"status": "flagged"}, note="no rows"),
        C("prayer_requests", "count", kwargs={"status_in": ["assigned", "prayed"]}),
        C("prayer_requests", "count", kwargs={"status_in": []}, note="empty $in"),
        C("prayer_requests", "count", kwargs={"seen": True}),
        C("prayer_requests", "count", kwargs={"seen": False},
          note="unset seen_by_partner must count as unseen"),
        C("prayer_requests", "count", kwargs={"seen_after": f["oldest"]}),
        C("prayer_requests", "count", kwargs={"seen_before": f["now"]}),
        C("prayer_requests", "count", kwargs={"seen_before": day_ago}),
        C("prayer_requests", "count", kwargs={"submitted_since": f["oldest"]}),
        C("prayer_requests", "count", kwargs={"submitted_since": f["future"]}),
        C("prayer_requests", "count", kwargs={"assigned_partner_id": f["busy_partner"],
                                              "status": "assigned", "seen": False}),
        C("prayer_requests", "avg_response_ms", (f["busy_partner"],)),
        C("prayer_requests", "avg_response_ms", (f["idle_partner"],), note="no data -> 0"),
        C("prayer_requests", "avg_response_ms", (MISSING_ID,)),
        C("prayer_requests", "daily_prayed_for_partner", (f["busy_partner"], f["oldest"]),
          sort_field="_id"),
        C("prayer_requests", "daily_prayed_for_partner", (f["idle_partner"], f["oldest"]),
          sort_field="_id"),
        C("prayer_requests", "daily_prayed_for_partner", (f["busy_partner"], f["future"]),
          sort_field="_id"),
        C("prayer_requests", "daily_completed", (f["oldest"],), sort_field="_id"),
        C("prayer_requests", "daily_completed", (f["oldest"], f["now"], "%Y-%m"),
          sort_field="_id"),
        C("prayer_requests", "daily_completed", (f["future"],), sort_field="_id"),
        C("prayer_requests", "daily_assigned", (f["oldest"],), sort_field="_id"),
        C("prayer_requests", "daily_assigned", (f["oldest"], f["now"], "%Y-%m"),
          sort_field="_id"),
        C("prayer_requests", "daily_assigned", (f["future"],), sort_field="_id"),
        C("prayer_requests", "completion_trend", (f["oldest"], "%Y-%m-%d"), sort_field="_id"),
        C("prayer_requests", "completion_trend", (f["oldest"], "%Y-%m"), sort_field="_id"),
        C("prayer_requests", "completion_trend", (f["future"], "%Y-%m-%d"), sort_field="_id"),
        C("prayer_requests", "category_counts", sort_field="count"),
        C("prayer_requests", "category_counts", (3,), sort_field="count"),
        C("prayer_requests", "daily_counts", ("submitted_at", f["oldest"]), sort_field="_id"),
        C("prayer_requests", "daily_counts", ("submitted_at", f["oldest"], f["now"], "%Y-%m-%d"),
          sort_field="_id"),
        C("prayer_requests", "daily_counts", ("prayed_at", f["oldest"]), sort_field="_id"),
        C("prayer_requests", "daily_counts", ("submitted_at", f["future"]), sort_field="_id"),
        C("prayer_requests", "list_for_user", (upu,), sort_field="submitted_at"),
        C("prayer_requests", "list_for_user", (upu,), kwargs={"skip": 0, "limit": 1},
          sort_field="submitted_at"),
        C("prayer_requests", "list_for_user", (upu,), kwargs={"skip": 10000, "limit": 20},
          sort_field="submitted_at", note="past the end"),
        C("prayer_requests", "list_for_user", (MISSING_ID,), sort_field="submitted_at"),
        C("prayer_requests", "list_admin", sort_field="submitted_at"),
        C("prayer_requests", "list_admin", kwargs={"limit": 5}, sort_field="submitted_at"),
        C("prayer_requests", "list_admin", kwargs={"skip": 30, "limit": 20},
          sort_field="submitted_at"),
        C("prayer_requests", "list_admin", kwargs={"skip": 10000, "limit": 20},
          sort_field="submitted_at"),
        C("prayer_requests", "list_admin", kwargs={"status": "pending", "limit": 50},
          sort_field="submitted_at"),
        C("prayer_requests", "list_admin", kwargs={"status": "flagged"},
          sort_field="submitted_at"),
        C("prayer_requests", "list_admin", kwargs={"category": "health", "limit": 50},
          sort_field="submitted_at"),
        C("prayer_requests", "list_admin", kwargs={"search": "pray", "limit": 50},
          sort_field="submitted_at"),
        C("prayer_requests", "list_admin", kwargs={"search": NO_MATCH},
          sort_field="submitted_at"),
        C("prayer_requests", "export", unordered=True, note="mongo find() has no sort"),
        C("prayer_requests", "export", kwargs={"limit": 4}, unordered=True,
          advisory="unsorted query + limit: the truncated subset is undefined"),
    ]
    # the partner dashboard buckets, exactly as server.py builds them
    for tag, extra in (
        ("all", {}),
        ("new", {"status": "assigned", "seen_by_partner": {"$ne": True}}),
        ("assigned", {"status": "assigned", "seen_by_partner": True,
                      "seen_at": {"$gte": day_ago}}),
        ("pending", {"status": "assigned", "seen_by_partner": True,
                     "seen_at": {"$lt": day_ago}}),
        ("prayed", {"status": "prayed"}),
    ):
        for pid, who in ((f["busy_partner"], "busy"), (f["idle_partner"], "idle")):
            cases.append(C("prayer_requests", "list_for_partner",
                           ({"assigned_partner_id": pid, **extra},),
                           kwargs={"fields": fields, "skip": 0, "limit": 20},
                           sort_field="submitted_at",
                           note=f"dashboard bucket={tag} partner={who}"))
    cases.append(C("prayer_requests", "list_for_partner",
                   ({"assigned_partner_id": f["busy_partner"]},),
                   kwargs={"fields": fields, "skip": 10000, "limit": 20},
                   sort_field="submitted_at", note="page past the end"))
    return cases


# ==========================================================================
# runner
# ==========================================================================
@dataclass
class Result:
    case: Case
    status: str            # OK | DIFF | ADVISORY | SKIP | ERROR
    diffs: list = field(default_factory=list)
    detail: str = ""

    @property
    def fatal(self):
        if self.case.advisory:
            return []
        return [d for d in self.diffs if d.kind not in NON_FATAL]

    def keys(self):
        return {(self.case.label, d.kind, d.path) for d in self.diffs}


async def call(repos, case):
    repo = getattr(repos, case.repo, None)
    if repo is None:
        return None, f"repo {case.repo!r} not implemented"
    fn = getattr(repo, case.method, None)
    if fn is None:
        return None, f"{case.repo}.{case.method}() not implemented"
    return await fn(*case.args, **case.kwargs), None


async def run_case(mrepos, drepos, case, verbose):
    try:
        got_m, miss_m = await call(mrepos, case)
    except Exception as e:                                   # noqa: BLE001
        return Result(case, "ERROR", detail=f"mongo raised {type(e).__name__}: {e}")
    if miss_m:
        return Result(case, "SKIP", detail=f"mongo: {miss_m}")

    try:
        got_d, miss_d = await call(drepos, case)
    except Exception as e:                                   # noqa: BLE001
        return Result(case, "ERROR",
                      detail=f"dynamo raised {type(e).__name__}: {e}")
    if miss_d:
        return Result(case, "SKIP", detail=miss_d)

    r = Result(case, "OK", compare(got_m, got_d, unordered=case.unordered,
                                   sort_field=case.sort_field))
    if r.fatal:
        r.status = "DIFF"
    elif r.diffs:
        r.status = "ADVISORY"
    return r


def short(v, n=180):
    s = repr(v)
    return s if len(s) <= n else s[:n - 3] + "..."


async def run(mrepos, drepos, cases, verbose=False, max_diffs=6, quiet=False):
    results = []
    for case in cases:
        r = await run_case(mrepos, drepos, case, verbose)
        results.append(r)
        if quiet:
            continue
        if r.status in ("OK", "ADVISORY"):
            if verbose:
                kinds = sorted({d.kind for d in r.diffs})
                print(f"  {'ok' if r.status == 'OK' else 'adv':<7} {case.label}"
                      + (f"  [{'+'.join(kinds)}]" if kinds else ""))
        elif r.status == "SKIP":
            print(f"  SKIP    {case.label}  -- {r.detail}")
        elif r.status == "ERROR":
            print(f"  ERROR   {case.label}\n            {r.detail}")
        else:
            print(f"  DIFF    {case.label}"
                  + (f"   [{case.note}]" if case.note else ""))
            shown = r.fatal
            for d in shown[:max_diffs]:
                print(f"            {d.kind:<12} {d.path or '<result>'}")
                print(f"              mongo : {short(d.mongo)}")
                print(f"              dynamo: {short(d.dynamo)}")
            if len(shown) > max_diffs:
                print(f"            ... and {len(shown) - max_diffs} more "
                      f"difference(s) in this call")
    return results


# ==========================================================================
# reporting
# ==========================================================================
def coverage_gaps(mrepos, cases):
    """Read methods on the Mongo side that no case exercises."""
    covered = {(c.repo, c.method) for c in cases}
    gaps = []
    for name in REPO_NAMES:
        repo = getattr(mrepos, name, None)
        if repo is None:
            continue
        for attr in dir(repo):
            if attr.startswith("_") or is_write(attr):
                continue
            if not callable(getattr(repo, attr, None)):
                continue
            if (name, attr) not in covered:
                gaps.append(f"{name}.{attr}")
    return sorted(gaps)


ADVISORY_WHY = {
    "HEARTBEAT": ("Field is written by ordinary authenticated reads (partner "
                  "heartbeat), so the two stores diverge just by being used."),
    "FANOUT_DROPPED": ("Not reconstructible from a per-recipient row; omitted "
                       "rather than fabricated. No caller reads it."),
    "NULL_DROPPED": ("Mongo returned an explicit None; DynamoDB has no attribute "
                     "at all.\n    04_backfill drops top-level nulls by design "
                     "(DynamoDB rejects NULL on a key attribute).\n    doc.get(f) "
                     "is unaffected -- doc[f] would KeyError on DynamoDB only."),
    "TIE_ORDER": ("Rows are ordered differently, but only among EQUAL sort keys, "
                  "which\n    neither MongoDB nor this DynamoDB implementation "
                  "promises."),
}


def advisory_report(results):
    """Per-kind, per-repo, per-field roll-up of the non-gating differences."""
    seen = {}
    for r in results:
        for d in r.diffs:
            if not (r.case.advisory or d.kind in NON_FATAL):
                continue
            leaf = d.path.rsplit(".", 1)[-1] or "<result>"
            k = seen.setdefault(d.kind, {})
            k.setdefault(r.case.repo, {})
            k[r.case.repo][leaf] = k[r.case.repo].get(leaf, 0) + 1
    if not seen:
        return
    print("\nADVISORY -- reported, NOT gating:")
    for kind, repos in sorted(seen.items()):
        total = sum(sum(f.values()) for f in repos.values())
        print(f"\n  {kind} ({total})")
        why = ADVISORY_WHY.get(kind)
        if why:
            print(f"    {why}")
        for repo in REPO_NAMES:
            fields = repos.get(repo)
            if fields:
                print(f"      {repo:<17}" + ", ".join(
                    f"{f}({n})" for f, n in sorted(fields.items())))
    adv = [r for r in results if r.case.advisory and r.diffs]
    for r in adv:
        print(f"\n  {r.case.label}\n    not comparable: {r.case.advisory}")


def summarise(results, gaps):
    by_repo = {}
    for r in results:
        s = by_repo.setdefault(r.case.repo, dict.fromkeys(
            ("OK", "DIFF", "ADVISORY", "SKIP", "ERROR"), 0))
        s[r.status] += 1

    print("\n" + "=" * 78)
    print(f"{'repo':<18}{'cases':>8}{'ok':>8}{'DIFF':>8}{'ERROR':>8}"
          f"{'SKIP':>8}{'advisory':>10}")
    print("-" * 78)
    for name in REPO_NAMES:
        s = by_repo.get(name)
        if not s:
            continue
        print(f"{name:<18}{sum(s.values()):>8}{s['OK']:>8}{s['DIFF']:>8}"
              f"{s['ERROR']:>8}{s['SKIP']:>8}{s['ADVISORY']:>10}")
    print("-" * 78)

    kinds = {}
    for r in results:
        for d in r.diffs:
            kinds[d.kind] = kinds.get(d.kind, 0) + 1
    if kinds:
        print("differences by kind: "
              + ", ".join(f"{k}={v}" for k, v in sorted(kinds.items())))
    if gaps:
        print(f"\nUNCOVERED read methods ({len(gaps)}): {', '.join(gaps)}")

    advisory_report(results)
    bad = [r for r in results if r.status in ("DIFF", "ERROR")]
    skipped = [r for r in results if r.status == "SKIP"]
    return bad, skipped


# ==========================================================================
# wiring
# ==========================================================================
def connect_mongo(db_name):
    if db_name == PRODUCTION_DB:
        raise SystemExit(
            f"REFUSING to touch {PRODUCTION_DB!r}: that is the LIVE PRODUCTION "
            f"database. This tool only ever runs against a copy "
            f"(default {DEFAULT_SOURCE_DB!r}).")
    env = dotenv_values(BACKEND_DIR / ".env")
    url = env.get("MONGO_URL")
    if not url:
        raise SystemExit("ERROR: MONGO_URL not found in backend/.env")
    client = AsyncIOMotorClient(url, serverSelectionTimeoutMS=20000)
    return _RODatabase(client.get_database(
        db_name, codec_options=CodecOptions(tz_aware=True, tzinfo=timezone.utc)))


class _Unavailable:
    """Stand-in for a DynamoRepos that could not even be imported.

    repo/dynamo.py is under active development, so a run can land on a
    half-saved file. Every attribute reads as None, which makes every case
    report SKIP instead of blowing up with a traceback.
    """

    def __init__(self, reason):
        self.reason = reason

    def __getattr__(self, name):
        return None


def make_dynamo():
    """Fresh import every time: repo/dynamo.py is under active development, so
    re-importing is how a repo that landed since the last poll shows up."""
    try:
        import repo.dynamo as dynamo
        importlib.reload(dynamo)
        return guard_dynamo(dynamo.DynamoRepos())
    except Exception as e:                                   # noqa: BLE001
        return _Unavailable(f"repo/dynamo.py is not importable right now "
                            f"({type(e).__name__}: {e})")


def missing_repos(drepos):
    return [n for n in REPO_NAMES if getattr(drepos, n, None) is None]


def wait_for_repos(seconds):
    drepos = make_dynamo()
    deadline = time.time() + seconds
    while seconds and missing_repos(drepos) and time.time() < deadline:
        print(f"  waiting for {', '.join(missing_repos(drepos))} "
              f"({int(deadline - time.time())}s left)")
        time.sleep(10)
        drepos = make_dynamo()
    return drepos


async def main(argv=None) -> int:
    p = argparse.ArgumentParser(
        description="Differential test: MongoRepos vs DynamoRepos, same reads.")
    p.add_argument("--source-db", default=DEFAULT_SOURCE_DB,
                   help=f"Mongo database to READ (default {DEFAULT_SOURCE_DB}; "
                        f"{PRODUCTION_DB!r} is refused).")
    p.add_argument("--repo", action="append", choices=REPO_NAMES,
                   help="Only test this repo (repeatable).")
    p.add_argument("-v", "--verbose", action="store_true",
                   help="Print every case, not just the failures.")
    p.add_argument("--max-diffs", type=int, default=6,
                   help="Differences printed per failing call (default 6).")
    p.add_argument("--strict-nulls", action="store_true",
                   help="Promote NULL_DROPPED from advisory to a gating failure.")
    p.add_argument("--wait", type=int, default=0, metavar="SECS",
                   help="Poll for not-yet-implemented Dynamo repos to appear.")
    p.add_argument("--self-check", action="store_true",
                   help="Prove the detector fails when it should, then exit.")
    args = p.parse_args(argv)
    if args.strict_nulls:
        NON_FATAL.discard("NULL_DROPPED")

    db = connect_mongo(args.source_db)
    from repo.mongo import MongoRepos
    mrepos = MongoRepos(db)
    drepos = wait_for_repos(args.wait)

    print(f"source mongo db : {args.source_db}  (READ-ONLY, guarded)")
    print(f"dynamo region   : ap-south-1        (READ-ONLY, guarded)")
    if isinstance(drepos, _Unavailable):
        print(f"!! {drepos.reason}\n"
              f"   Every case will report SKIP. Re-run, or use --wait.")
    elif missing_repos(drepos):
        print(f"not implemented : {', '.join(missing_repos(drepos))}")

    fixtures = await build_fixtures(db)
    all_cases = build_cases(fixtures)
    cases = [c for c in all_cases if c.repo in args.repo] if args.repo else all_cases

    if args.self_check:
        return await self_check(mrepos, drepos, fixtures)

    print(f"cases           : {len(cases)}\n")
    results = await run(mrepos, drepos, cases, args.verbose, args.max_diffs)
    # coverage is measured against the FULL case table, not the --repo subset
    bad, skipped = summarise(results, coverage_gaps(mrepos, all_cases))

    print()
    if bad:
        n = sum(len(r.fatal) for r in bad)
        print(f"VERDICT: FAIL -- {len(bad)} of {len(results)} calls disagree "
              f"({n} gating differences). DO NOT CUT OVER.")
        return 1
    if skipped:
        print(f"VERDICT: INCOMPLETE -- every implemented call matches, but "
              f"{len(skipped)} call(s) are NOT IMPLEMENTED on DynamoDB. "
              f"Not a pass.")
        return 2
    print(f"VERDICT: PASS -- all {len(results)} calls returned equivalent "
          f"results on both backends.")
    return 0


# ==========================================================================
# self-check: prove this thing can actually fail
# ==========================================================================
def _unit_checks():
    assert diff({"a": 1}, {"a": Decimal("1")}) == [], "int vs Decimal must match"
    assert diff({"a": 1.5}, {"a": Decimal("1.5")}) == []
    assert diff({"a": True}, {"a": Decimal("1")})[0].kind == "VALUE", "bool->number"
    assert diff({"a": True}, {"a": 1})[0].kind == "VALUE"
    assert diff({"a": False}, {"a": 0})[0].kind == "VALUE"
    assert diff({"a": True}, {"a": True}) == []
    dt = datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
    assert diff({"a": dt}, {"a": dt.replace(tzinfo=None)}) == [], "naive == aware UTC"
    assert diff({"a": dt}, {"a": "2026-01-02T03:04:05"})[0].kind == "TYPE"
    assert diff({"a": dt}, {"a": "2026-01-02T09:99:99"})[0].kind == "VALUE"
    assert diff({"a": None}, {})[0].kind == "NULL_DROPPED"
    assert diff({"a": 1}, {})[0].kind == "MISSING"
    assert diff({}, {"a": 1})[0].kind == "EXTRA"
    assert diff({"d": {"x": 1}}, {"d": {"x": 2}})[0].path == "d.x"
    # top-level list policy
    rows_m = [{"_id": "a", "n": 1}, {"_id": "b", "n": 2}]
    rows_d = [{"_id": "b", "n": 2}, {"_id": "a", "n": 1}]
    assert compare(rows_m, rows_d)[0].kind == "ORDER", "reordering must be caught"
    assert compare(rows_m, rows_d, unordered=True) == []
    tie_m = [{"_id": "a", "s": 1}, {"_id": "b", "s": 1}]
    tie_d = [{"_id": "b", "s": 1}, {"_id": "a", "s": 1}]
    assert compare(tie_m, tie_d, sort_field="s")[0].kind == "TIE_ORDER"
    assert compare((5, rows_m), (6, rows_m))[0].kind == "VALUE"
    assert compare(["x", "y"], ["y", "x"])[0].kind == "VALUE"
    assert compare(["x", "y"], ["y", "x"], unordered=True) == []
    # the read-only guard is a safety rule, so it gets an assertion too
    guarded = _ReadOnly(object(), {"put_item"}, "t")
    try:
        guarded.put_item
        raise AssertionError("read-only guard did not fire")
    except RuntimeError:
        pass
    print("  unit checks OK (15 assertions: comparison engine + read-only guard)")


class _Patch:
    """Temporarily replace one bound method on a repo."""

    def __init__(self, repos, repo, method, wrapper):
        self.obj = getattr(repos, repo)
        self.method, self.wrapper = method, wrapper
        self.original = getattr(self.obj, method, None)

    async def __aenter__(self):
        orig = self.original

        async def patched(*a, **kw):
            return self.wrapper(await orig(*a, **kw))
        setattr(self.obj, self.method, patched)
        return self

    async def __aexit__(self, *exc):
        if self.method in self.obj.__dict__:
            delattr(self.obj, self.method)


async def _prove(mrepos, drepos, cases, repo, method, wrapper, want_kind, label):
    """Baseline -> patch -> assert a NEW failure of the expected kind appears."""
    subset = [c for c in cases if c.repo == repo and c.method == method]
    if not subset:
        print(f"  SKIP proof '{label}': no case for {repo}.{method}")
        return None
    if getattr(getattr(drepos, repo, None), method, None) is None:
        print(f"  SKIP proof '{label}': {repo}.{method} not implemented on dynamo")
        return None

    base = await run(mrepos, drepos, subset, quiet=True)
    base_keys = set().union(*(r.keys() for r in base)) if base else set()

    async with _Patch(drepos, repo, method, wrapper):
        patched = await run(mrepos, drepos, subset, quiet=True)

    new = (set().union(*(r.keys() for r in patched)) if patched else set()) - base_keys
    hit = [k for k in new if k[1] == want_kind]
    exits = any(r.status == "DIFF" for r in patched)
    ok = bool(hit) and exits
    print(f"  {'PROVED ' if ok else 'FAILED '} {label}")
    print(f"            injected into {repo}.{method}; new {want_kind} "
          f"difference(s): {len(hit)}"
          + (f"; e.g. {sorted(hit)[0][2] or '<result>'}" if hit else ""))
    if not ok:
        print(f"            !! detector did NOT catch it -- new keys: {sorted(new)[:5]}")
    return ok


def _flip_bools(doc):
    """bool -> Decimal, the corruption plain `==` would wave through."""
    if not isinstance(doc, dict):
        return doc
    return {k: (Decimal(1) if v is True else Decimal(0) if v is False else v)
            for k, v in doc.items()}


async def self_check(mrepos, drepos, fixtures):
    print("\n[self-check] the comparison engine")
    _unit_checks()

    # repo/dynamo.py grows method by method; an absent repo or method must
    # report SKIP, never crash the run.
    absent_repo = await run_case(mrepos, type("Stub", (), {})(),
                                 Case("users", "count"), False)
    absent_method = await run_case(mrepos, type("Stub", (), {"users": object()})(),
                                   Case("users", "count"), False)
    unimportable = await run_case(mrepos, _Unavailable("boom"),
                                  Case("users", "count"), False)
    assert absent_repo.status == "SKIP" and "repo" in absent_repo.detail
    assert absent_method.status == "SKIP" and "count()" in absent_method.detail
    assert unimportable.status == "SKIP"
    print("  graceful-skip OK (absent repo, absent method and an unimportable "
          "repo/dynamo.py all report SKIP)")

    print("\n[self-check] live fault injection -- three distinct shapes")
    cases = build_cases(fixtures)
    proofs = [
        await _prove(mrepos, drepos, cases, "llm_logs", "total_tokens",
                     lambda v: (v or 0) + 1, "VALUE",
                     "wrong scalar    (total_tokens off by one)"),
        await _prove(mrepos, drepos, cases, "activity_logs", "export",
                     lambda rows: list(reversed(rows)), "ORDER",
                     "wrong ordering  (activity_logs.export reversed)"),
        await _prove(mrepos, drepos, cases, "users", "get",
                     _flip_bools, "VALUE",
                     "bool -> number  (users.get is_verified/is_admin as Decimal)"),
    ]
    ran = [p for p in proofs if p is not None]
    print()
    if not ran:
        print("SELF-CHECK INCONCLUSIVE: none of the target methods exist yet.")
        return 2
    if all(ran):
        print(f"SELF-CHECK PASSED: {len(ran)}/3 injected faults were all detected "
              f"and would have failed the gate.")
        return 0
    print(f"SELF-CHECK FAILED: {ran.count(False)} injected fault(s) went "
          f"undetected. This tool cannot be trusted.")
    return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
