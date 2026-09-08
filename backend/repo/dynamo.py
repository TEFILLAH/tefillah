"""
DynamoDB implementation of the repository layer.

Mirrors repo/mongo.py attribute-for-attribute and method-for-method, so the
cutover is nothing more than DB_BACKEND=dynamo -- server.py does not change.
The class layout deliberately follows mongo.py's (_AccountRepo shared by
users / partners / admins), so the two files drift together or not at all.

Read repo/mongo.py first: that file is the contract. Anything here that returns
a different shape than its Mongo twin is a bug.

Conventions enforced throughout:
  * Table names / keys / index names come ONLY from migration/table_spec.py.
  * Mongo's `_id` is stored as the spec's partition key and mapped back to
    `_id` on read, because callers do doc["_id"] everywhere.
  * datetimes are stored as UTC ISO-8601 strings (which also gives the GSI sort
    keys correct lexicographic ordering) and parsed back into tz-aware UTC
    datetimes, matching Motor's tz_aware=True codec options in server.py.
  * DynamoDB numbers are Decimal; they are converted back to int/float so
    callers see exactly what Mongo gave them.

KNOWN GAPS (see the migration report):
  * DynamoDB has no unique index. Mongo's unique email index turned a racing
    duplicate signup into a clean 400; here the second write wins silently.
    ensure_indexes() is a no-op for the same reason.
  * avatars is deliberately NOT backed by DynamoDB (400KB item limit).
  * NULL vs ABSENT: a top-level None is dropped on write (see _drop_nulls),
    because a NULL on an index key attribute is rejected outright. Reads are
    unaffected -- every caller uses doc.get() -- but a JSON export omits the
    key where Mongo emitted "field": null.
  * Broadcast notifications (target_type all/users/partners) are expanded to
    recipients at WRITE time, not evaluated at read time. An account created
    after a broadcast never sees it. See NotificationRepo.
  * The prayer_requests GSIs are sparse: a row is only in
    assigned_partner_id-assigned_at-index if it has BOTH attributes. Every
    write path here sets and clears them together (and the live table has zero
    violations), but a hand-edited row with a partner and no assigned_at would
    be invisible to the partner queue / partner analytics.
"""
import asyncio
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import boto3
from boto3.dynamodb.conditions import Attr, Key
from botocore.exceptions import ClientError

try:                                    # normal case: backend/ is on sys.path
    from migration import table_spec
except ImportError:                     # invoked from outside backend/
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from migration import table_spec

# TTL is enabled on the log tables but only bites on items that actually carry
# the attribute, so writers set it. Mongo kept logs forever; a year of audit
# history is the deliberate trade for free expiry.
LOG_RETENTION_DAYS = 365

# Never exposed through admin lists/exports (same set as mongo.py's _USER_SECRETS).
# apple_refresh_token is a live Apple credential kept only so account deletion can
# revoke it — it must not ride along in an admin list or a CSV export.
_USER_SECRETS = ("password_hash", "verification_code", "apple_refresh_token")

# Full-string ISO-8601 datetime, i.e. exactly what _enc() writes. Strict on
# purpose: a free-text field that merely contains a date must not be parsed.
# The offset is OPTIONAL because migration/04_backfill.py deliberately writes
# UTC WITHOUT one ("2026-04-22T09:00:51.586000"); requiring it here silently
# left every backfilled date as a plain string, which broke date sorting,
# _since() and every daily_* aggregation on migrated rows.
_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?([+-]\d{2}:\d{2}|Z)?$")


# --------------------------------------------------------------------------
# value <-> DynamoDB conversion
# --------------------------------------------------------------------------
def _utc(dt):
    """Naive datetimes are assumed UTC (server.py only ever writes aware UTC)."""
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def _enc(v):
    if isinstance(v, datetime):
        # UTC, WITHOUT an offset -- byte-identical to migration/04_backfill.py's
        # iso(). The two formats must not be mixed: they share GSI sort keys and
        # the notifications range key, and "…50+00:00" vs "…50.235000" do not
        # compare correctly against each other.
        return _utc(v).replace(tzinfo=None).isoformat()
    if isinstance(v, float):
        return Decimal(str(v))          # str() first: Decimal(0.1) is not 0.1
    if isinstance(v, dict):
        return {k: _enc(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_enc(x) for x in v]
    return v


def _dec(v):
    if isinstance(v, Decimal):
        return int(v) if v == v.to_integral_value() else float(v)
    if isinstance(v, str) and _ISO.match(v):
        return _utc(datetime.fromisoformat(v))
    if isinstance(v, set):
        # DynamoDB sets are unordered; Mongo stored these fields as arrays.
        return sorted(_dec(x) for x in v)
    if isinstance(v, dict):
        return {k: _dec(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_dec(x) for x in v]
    return v


def _to_item(doc, pk):
    return {(pk if k == "_id" else k): _enc(v) for k, v in doc.items()}


def _to_doc(item, pk, drop=()):
    if item is None:
        return None
    return {("_id" if k == pk else k): _dec(v)
            for k, v in item.items() if k not in drop}


def _without(doc, fields):
    """Mongo exclusion projection."""
    return {k: v for k, v in doc.items() if k not in fields}


def _only(doc, fields):
    """Mongo inclusion projection (absent fields stay absent, as in Mongo)."""
    return {k: v for k, v in doc.items() if k in fields}


def _since(value, floor):
    """Mongo's {$gte: <date>}: non-dates (incl. null/missing) never match."""
    return isinstance(value, datetime) and _utc(value) >= _utc(floor)


def _before(value, ceiling):
    """Mongo's {$lt: <date>}: non-dates (incl. null/missing) never match."""
    return isinstance(value, datetime) and _utc(value) < _utc(ceiling)


def _drop_nulls(doc):
    """Top-level None -> absent, exactly like migration/04_backfill.py.

    A top-level None on an index key attribute (assigned_partner_id,
    assigned_at, user_id, status) serialises as DynamoDB NULL and the write is
    REJECTED with a key-type mismatch. Absent is also how DynamoDB spells "no
    value", and every caller reads through doc.get(), so the two are
    indistinguishable downstream.
    """
    return {k: v for k, v in doc.items() if v is not None}


def _split_nulls(set_fields=None, unset_fields=None):
    """Mongo's {"$set": {"f": None}} -> DynamoDB REMOVE f. See _drop_nulls."""
    sets = {k: v for k, v in (set_fields or {}).items() if v is not None}
    unsets = dict(unset_fields or {})
    unsets.update({k: "" for k, v in (set_fields or {}).items() if v is None})
    return sets, unsets


def _gsi(spec, pk):
    """Resolve a GSI by its partition-key attribute.

    Index names live in migration/table_spec.py and nowhere else; looking them
    up by the attribute they are keyed on keeps that true without the repo
    repeating a single string literal.
    """
    for g in spec.get("gsis", ()):
        if g["pk"] == pk:
            return g["name"]
    raise KeyError(f"{spec['table']}: no GSI partitioned by {pk!r}")


def _cond(*clauses):
    """Mongo-style guards -> (ConditionExpression, names, values).

    clauses are (op, attr, value) with op in {"eq", "ne", "nin"}. "ne"/"nin"
    carry an attribute_not_exists() arm because in Mongo a MISSING field also
    satisfies $ne/$nin -- dropping that arm would quietly refuse to update rows
    whose status attribute was never written.

    EVERY attribute is referenced through a `#c<n>` alias: `status` is a
    DynamoDB RESERVED WORD (as are name, count, read, ...) and an un-aliased
    reference fails at runtime only, inside a write path.
    """
    parts, names, values = [], {}, {}

    def alias(attr):
        a = f"#c{len(names)}"
        names[a] = attr
        return a

    def val(v):
        a = f":c{len(values)}"
        values[a] = _enc(v)
        return a

    for op, attr, value in clauses:
        a = alias(attr)
        if op == "eq":
            parts.append(f"{a} = {val(value)}")
        elif op == "ne":
            parts.append(f"(attribute_not_exists({a}) OR {a} <> {val(value)})")
        elif op == "nin":
            # ponytail: DynamoDB caps IN at 100 operands. blocked_users and the
            # releasable-status list are both tiny; revisit if a partner ever
            # blocks 100 people.
            joined = ", ".join(val(v) for v in value)
            parts.append(f"(attribute_not_exists({a}) OR NOT {a} IN ({joined}))")
        else:
            raise ValueError(f"unknown condition op {op!r}")
    return " AND ".join(parts), names, values


# Mongo query operators understood by _matches(). Anything else raises rather
# than silently matching, so a new caller cannot get wrong rows back.
_OPS = {
    "$ne": lambda v, a: v != a,
    "$in": lambda v, a: v in a,
    "$nin": lambda v, a: v not in a,
    "$gte": _since,
    "$lt": _before,
}


def _matches(doc, query: dict) -> bool:
    """Evaluate a small Mongo query dict in Python (see list_for_partner)."""
    for field, want in query.items():
        v = doc.get(field)
        if isinstance(want, dict):
            for op, arg in want.items():
                try:
                    test = _OPS[op]
                except KeyError:
                    raise ValueError(f"unsupported query operator {op!r}") from None
                if not test(v, arg):
                    return False
        elif v != want:
            return False
    return True


def _bucket(docs, date_field, fmt, *, start=None, end=None, cap=100):
    """[{_id: 'YYYY-MM-DD', count: n}] ascending -- Mongo's $dateToString $group.

    ponytail: Scan + group in Python. prayer_requests is 31 rows, so this is one
    sub-second read; the `counters` table in table_spec.py is the scale-up path
    (writers ADD, readers do a small range read) if it ever stops being.
    """
    buckets = {}
    for doc in docs:
        v = doc.get(date_field)
        if not isinstance(v, datetime):
            continue
        if start is not None and not _since(v, start):
            continue
        if end is not None and _utc(v) > _utc(end):
            continue
        # %Y/%m/%d/%H mean the same thing in strftime and $dateToString, and
        # both bucket in UTC.
        key = _utc(v).strftime(fmt)
        buckets[key] = buckets.get(key, 0) + 1
    rows = [{"_id": k, "count": c} for k, c in sorted(buckets.items())]
    return rows if cap is None else rows[:cap]


_EPOCH = datetime.min.replace(tzinfo=timezone.utc)


def _by(field):
    """Sort key that tolerates a missing/None date (Mongo sorts those last)."""
    def key(doc):
        v = doc.get(field)
        return _utc(v) if isinstance(v, datetime) else _EPOCH
    return key


# --------------------------------------------------------------------------
# base plumbing
# --------------------------------------------------------------------------
class _Repo:
    """Shared DynamoDB plumbing. Subclasses only name their table_spec entry."""

    _spec_key = None
    _drop = ()                          # internal attributes hidden from callers

    def __init__(self, dynamodb):
        self._spec = table_spec.TABLES[self._spec_key]
        self._pk = self._spec["pk"]
        self._t = dynamodb.Table(self._spec["table"])

    # ---- reads ------------------------------------------------------------
    async def _get(self, doc_id):
        resp = await asyncio.to_thread(self._t.get_item, Key={self._pk: doc_id})
        return _to_doc(resp.get("Item"), self._pk, self._drop)

    async def _scan(self, **kwargs):
        """Every item in the table, decoded.

        ponytail: full Scan + in-Python filtering. The whole dataset is ~1000
        items, so this is a few hundred KB and well under a second; the
        `counters` table in table_spec.py is the scale-up path for the counts
        and the daily aggregations built on top of this.
        """
        def run():
            items, kw = [], dict(kwargs)
            while True:
                resp = self._t.scan(**kw)
                items.extend(resp.get("Items", []))
                kw["ExclusiveStartKey"] = resp.get("LastEvaluatedKey")
                if not kw["ExclusiveStartKey"]:
                    return items
        raw = await asyncio.to_thread(run)
        return [_to_doc(i, self._pk, self._drop) for i in raw]

    async def _query(self, index, key_condition, forward=True, **kwargs):
        def run():
            items, kw = [], {"IndexName": index,
                             "KeyConditionExpression": key_condition,
                             "ScanIndexForward": forward, **kwargs}
            while True:
                resp = self._t.query(**kw)
                items.extend(resp.get("Items", []))
                kw["ExclusiveStartKey"] = resp.get("LastEvaluatedKey")
                if not kw["ExclusiveStartKey"]:
                    return items
        raw = await asyncio.to_thread(run)
        return [_to_doc(i, self._pk, self._drop) for i in raw]

    # ---- writes -----------------------------------------------------------
    async def _put(self, doc, extra=None):
        item = _to_item(doc, self._pk)
        if extra:
            item.update(extra)
        await asyncio.to_thread(self._t.put_item, Item=item)

    async def _update(self, doc_id, set_fields=None, unset_fields=None,
                      inc_fields=None, add_to_set=None, condition=None) -> int:
        """UpdateItem guarded by attribute_exists(pk), so it never upserts and
        the return value is Mongo's matched_count (1 or 0).

        `condition` is an extra (expr, names, values) triple from _cond(),
        ANDed onto the guard. That is how a Mongo update_one({..., guard})
        becomes atomic here: the guard is evaluated by DynamoDB, not by us, so
        a concurrent double-tap loses the race and gets 0 back.

        A None in set_fields becomes a REMOVE, not an attribute set to NULL:
        writing NULL to a GSI key attribute (status, user_id, ...) is rejected
        outright by DynamoDB, and absent is how DynamoDB spells "no value".
        Matches _drop_nulls() on insert and what 04_backfill.py already did.
        """
        set_fields, unset_fields = _split_nulls(set_fields, unset_fields)
        names, values, n = {}, {}, [0]

        def path(field):
            """'a.b' -> '#n0.#n1', so reserved words are always safe."""
            parts = []
            for seg in str(field).split("."):
                alias = f"#n{n[0]}"
                n[0] += 1
                names[alias] = seg
                parts.append(alias)
            return ".".join(parts)

        def val(v):
            alias = f":v{n[0]}"
            n[0] += 1
            values[alias] = _enc(v)
            return alias

        sets, removes, adds = [], [], []
        for k, v in (set_fields or {}).items():
            sets.append(f"{path(k)} = {val(v)}")
        for k in (unset_fields or {}):
            removes.append(path(k))
        for k, v in (inc_fields or {}).items():
            adds.append(f"{path(k)} {val(v)}")
        for k, v in (add_to_set or {}).items():
            # ADD on a DynamoDB set IS $addToSet. Mongo's list form of
            # $addToSet has different semantics, so refuse it loudly rather
            # than guess (no caller uses it).
            if isinstance(v, (list, tuple, set, dict)):
                raise TypeError(
                    f"add_to_set expects a scalar, got {type(v).__name__} for {k!r}")
            adds.append(f"{path(k)} {val({v})}")

        clauses = []
        if sets:
            clauses.append("SET " + ", ".join(sets))
        if removes:
            clauses.append("REMOVE " + ", ".join(removes))
        if adds:
            clauses.append("ADD " + ", ".join(adds))
        if not clauses:
            return 0                    # mirrors mongo.py's empty-update guard

        guard = f"#n{n[0]}"
        names[guard] = self._pk
        guard_expr = f"attribute_exists({guard})"
        if condition:
            cexpr, cnames, cvalues = condition
            if cexpr:
                guard_expr = f"{guard_expr} AND {cexpr}"
                names.update(cnames)
                values.update(cvalues)
        kwargs = {
            "Key": {self._pk: doc_id},
            "UpdateExpression": " ".join(clauses),
            "ExpressionAttributeNames": names,
            "ConditionExpression": guard_expr,
        }
        if values:
            kwargs["ExpressionAttributeValues"] = values
        try:
            await asyncio.to_thread(self._t.update_item, **kwargs)
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                return 0                # no such row -> matched_count 0
            raise
        return 1

    async def _delete(self, doc_id) -> int:
        resp = await asyncio.to_thread(
            self._t.delete_item, Key={self._pk: doc_id}, ReturnValues="ALL_OLD")
        return 1 if resp.get("Attributes") else 0

    async def ensure_indexes(self) -> None:
        """No-op: GSIs are provisioned by migration/03_create_tables.py.

        NOTE: this is also where Mongo's UNIQUE email index is lost -- DynamoDB
        has no unique constraint on a GSI.
        """
        return None


class _DailyCounts:
    """Mirror of mongo.py's _DailyCounts mixin."""

    async def daily_counts(self, date_field: str, start, end=None, fmt: str = "%Y-%m-%d"):
        """[{_id: 'YYYY-MM-DD', count: n}] ascending by date."""
        return _bucket(await self._scan(), date_field, fmt, start=start, end=end)


class _AccountRepo(_Repo, _DailyCounts):
    """Shared surface for the three account types (users / partners / admins).

    Same contract as mongo.py's _AccountRepo: the auth flows treat the three
    interchangeably, so they must really be substitutable.
    """

    async def get(self, doc_id: str):
        return await self._get(doc_id)

    async def get_by_email(self, email: str):
        rows = await self._query("email-index", Key("email").eq(email))
        return rows[0] if rows else None

    async def get_by_email_with_reset_code(self, email: str):
        """Account on this email that currently holds a live reset code."""
        rows = await self._query("email-index", Key("email").eq(email),
                                 FilterExpression=Attr("password_reset_code").exists())
        return rows[0] if rows else None

    async def email_taken_by_other(self, email: str, exclude_id: str) -> bool:
        rows = await self._query("email-index", Key("email").eq(email))
        return any(r["_id"] != exclude_id for r in rows)

    async def insert(self, doc: dict) -> None:
        await self._put(doc)

    async def update(self, doc_id: str, set_fields: dict = None, unset_fields: dict = None,
                     inc_fields: dict = None, add_to_set: dict = None) -> int:
        """$set/$unset/$inc/$addToSet -> SET / REMOVE / ADD. Returns matched_count.

        $addToSet needs the target attribute to be a DynamoDB SET, so the
        backfill must write blocked_users as a String Set -- and omit it when
        empty, because DynamoDB has no empty set.
        """
        return await self._update(doc_id, set_fields=set_fields, unset_fields=unset_fields,
                                  inc_fields=inc_fields, add_to_set=add_to_set)

    async def update_by_email(self, email: str, set_fields: dict = None,
                              unset_fields: dict = None) -> int:
        """Update the account matching an email (password reset syncs by email).

        DynamoDB can only update by primary key, so this resolves the key on
        email-index first. Like Mongo's update_one it touches ONE row.
        """
        row = await self.get_by_email(email)
        if row is None:
            return 0
        return await self._update(row["_id"], set_fields=set_fields,
                                  unset_fields=unset_fields)

    async def delete(self, doc_id: str) -> int:
        return await self._delete(doc_id)

    async def fcm_tokens_for_ids(self, ids):
        """Device tokens for a specific set of account ids (targeted push).

        ponytail: reuses the whole-table scan rather than adding a second read
        path; BatchGetItem is the upgrade if these tables ever outgrow a scan.
        """
        wanted = set(ids)
        return [d["fcm_token"] for d in await self._scan()
                if d["_id"] in wanted and d.get("fcm_token") is not None]

    async def email_name_for_ids(self, ids):
        """(email, name) for a specific set of account ids (targeted email)."""
        wanted = set(ids)
        return [_only(d, ("_id", "email", "name")) for d in await self._scan()
                if d["_id"] in wanted]


class _LogRepo(_Repo):
    """Append-only log tables: constant-bucket GSI for time ordering, plus TTL."""

    _drop = (table_spec.LOG_BUCKET_ATTR, table_spec.TTL_ATTRIBUTE)

    async def _append(self, entry: dict) -> None:
        ts = entry.get("timestamp")
        ts = _utc(ts) if isinstance(ts, datetime) else datetime.now(timezone.utc)
        await self._put(entry, extra={
            table_spec.LOG_BUCKET_ATTR: table_spec.LOG_BUCKET_VALUE,
            table_spec.TTL_ATTRIBUTE: int(
                (ts + timedelta(days=LOG_RETENTION_DAYS)).timestamp()),
        })

    async def _newest_first(self):
        return await self._query(
            "bucket-timestamp-index",
            Key(table_spec.LOG_BUCKET_ATTR).eq(table_spec.LOG_BUCKET_VALUE),
            forward=False,
        )


# --------------------------------------------------------------------------
# repositories
# --------------------------------------------------------------------------
class AvatarRepo:
    """Backed by S3, not DynamoDB.

    Avatar blobs exceed DynamoDB's 400KB item limit, and new uploads already go
    to S3, so table_spec.EXCLUDED_COLLECTIONS drops the collection. Serving the
    legacy read path from S3 instead of returning None keeps /api/avatar/{id}
    behaving EXACTLY as it does on Mongo -- otherwise cutover would silently
    turn that endpoint into a 404 for anyone still holding the old URL.

    Keys are written by server.py's _save_avatar as `avatars/{owner_id}-{ts}.{ext}`,
    so the timestamp is unknown here: list the owner's prefix and take the newest.

    REQUIRES s3:ListBucket AND s3:GetObject on the bucket for the EB instance
    role. **Production does NOT currently grant these** (the role's inline
    policy is TefillahAvatarWrite), so /api/avatar/{id} returns 404 there.
    Verified zero impact before accepting that: no client code calls the
    endpoint, and no account's profile_photo_url points at it -- avatars are
    served straight from CloudFront via profile_photo_url. Grant the two S3
    actions if the legacy endpoint is ever needed again; the code below then
    works unchanged.
    """

    _CONTENT_TYPE = {"jpg": "image/jpeg", "png": "image/png",
                     "webp": "image/webp", "gif": "image/gif"}

    # Read at call time, not import time, so tests can point at a scratch prefix
    # without touching real avatar keys. Bucket mirrors server.py's env var.
    @property
    def bucket(self):
        return os.environ.get("S3_AVATAR_BUCKET", "tefillah-web-prod")

    @property
    def prefix(self):
        return os.environ.get("AVATAR_S3_PREFIX", "avatars/")

    def _s3(self):
        return boto3.client("s3")

    def _newest_key(self, owner_id: str):
        resp = self._s3().list_objects_v2(
            Bucket=self.bucket, Prefix=f"{self.prefix}{owner_id}-")
        objects = resp.get("Contents") or []
        if not objects:
            return None
        return max(objects, key=lambda o: o["LastModified"])["Key"]

    async def get(self, owner_id: str):
        """Same shape server.py expects from Mongo: {_id, data, content_type}."""
        def _fetch():
            key = self._newest_key(owner_id)
            if not key:
                return None
            body = self._s3().get_object(Bucket=self.bucket, Key=key)
            ext = key.rsplit(".", 1)[-1].lower()
            doc = {
                "_id": owner_id,
                "data": body["Body"].read(),
                "content_type": body.get("ContentType")
                or self._CONTENT_TYPE.get(ext, "image/jpeg"),
            }
            # Mongo's avatar row carries updated_at. Prefer the original value
            # copied across by migration/07_avatars_to_s3.py; LastModified is
            # only the MIGRATION time, which is a different fact.
            original = (body.get("Metadata") or {}).get("updated-at")
            if original:
                try:
                    doc["updated_at"] = _utc(datetime.fromisoformat(original))
                except ValueError:
                    pass
            if "updated_at" not in doc and body.get("LastModified"):
                doc["updated_at"] = _utc(body["LastModified"])
            return doc
        try:
            return await asyncio.to_thread(_fetch)
        except Exception:
            # Missing object / no S3 access behaves like "no avatar", which is
            # what the Mongo path does when the row is absent.
            return None

    async def delete(self, owner_id: str) -> None:
        def _rm():
            key = self._newest_key(owner_id)
            if key:
                self._s3().delete_object(Bucket=self.bucket, Key=key)
        try:
            await asyncio.to_thread(_rm)
        except Exception:
            return None


class ActivityLogRepo(_LogRepo):
    """Append-only admin audit trail."""

    _spec_key = "activity_logs"

    async def insert(self, entry: dict) -> None:
        await self._append(entry)

    async def list(self, *, action=None, actor_type=None, skip: int = 0, limit: int = 50):
        docs = await self._newest_first()
        if action:
            docs = [d for d in docs if d.get("action") == action]
        if actor_type:
            docs = [d for d in docs if d.get("actor_type") == actor_type]
        return len(docs), docs[skip:skip + limit]

    async def export(self, limit: int = 10000):
        return (await self._newest_first())[:limit]


class LLMLogRepo(_LogRepo):
    """Append-only LLM usage log; also backs the token/usage analytics."""

    _spec_key = "llm_logs"

    async def insert(self, entry: dict) -> None:
        await self._append(entry)

    async def count_all(self) -> int:
        def run():
            total, kw = 0, {"Select": "COUNT"}
            while True:
                resp = self._t.scan(**kw)
                total += resp.get("Count", 0)
                kw["ExclusiveStartKey"] = resp.get("LastEvaluatedKey")
                if not kw["ExclusiveStartKey"]:
                    return total
        return await asyncio.to_thread(run)

    async def total_tokens(self) -> int:
        return sum(int(d.get("total_tokens") or 0) for d in await self._scan())

    async def daily_usage(self, start_date, group_format: str):
        """[{_id: 'YYYY-MM-DD', requests: n, tokens: n}] ascending by date."""
        buckets = {}
        for doc in await self._scan():
            if not _since(doc.get("timestamp"), start_date):
                continue
            key = _utc(doc["timestamp"]).strftime(group_format)
            row = buckets.setdefault(key, {"_id": key, "requests": 0, "tokens": 0})
            row["requests"] += 1
            row["tokens"] += int(doc.get("total_tokens") or 0)
        return [buckets[k] for k in sorted(buckets)][:100]

    async def list(self, *, status=None, skip: int = 0, limit: int = 50):
        docs = await self._newest_first()
        if status:
            docs = [d for d in docs if d.get("status") == status]
        return len(docs), docs[skip:skip + limit]

    async def export(self, limit: int = 10000):
        # Intentionally unsorted -- matches the original export query.
        return (await self._scan())[:limit]


class AdminRepo(_AccountRepo):
    """Admin accounts. Small table, all access is by id or email."""

    _spec_key = "admins"

    async def any_exists(self) -> bool:
        """True if ANY admin row exists -- gates the one-time bootstrap."""
        resp = await asyncio.to_thread(self._t.scan, Limit=1)
        return bool(resp.get("Items"))

    async def list_without_secrets(self):
        """All admins with password_hash projected out."""
        return [_without(d, ("password_hash",)) for d in await self._scan()]


class UserRepo(_AccountRepo):
    _spec_key = "users"

    async def exists(self, user_id: str) -> bool:
        resp = await asyncio.to_thread(
            self._t.get_item, Key={self._pk: user_id},
            ProjectionExpression="#p", ExpressionAttributeNames={"#p": self._pk})
        return resp.get("Item") is not None

    # ---- counts -----------------------------------------------------------
    async def count(self, *, status=None, status_ne=None,
                    last_login_since=None, created_since=None) -> int:
        docs = await self._scan()
        # status_ne overrides status: mongo.py writes both to query["status"].
        if status_ne is not None:
            docs = [d for d in docs if d.get("status") != status_ne]
        elif status is not None:
            docs = [d for d in docs if d.get("status") == status]
        if last_login_since is not None:
            docs = [d for d in docs if _since(d.get("last_login"), last_login_since)]
        if created_since is not None:
            docs = [d for d in docs if _since(d.get("created_at"), created_since)]
        return len(docs)

    # ---- listing / export -------------------------------------------------
    async def list(self, *, search=None, status=None, skip: int = 0, limit: int = 20):
        """(total, docs) newest-first, secrets projected out."""
        docs = await self._scan()
        if search:
            # mongo.py escapes the regex, so it is a literal case-insensitive
            # substring match -- exactly what `in` does here.
            s = search.lower()
            docs = [d for d in docs
                    if s in str(d.get("name") or "").lower()
                    or s in str(d.get("email") or "").lower()]
        if status:
            docs = [d for d in docs if d.get("status") == status]
        docs.sort(key=_by("created_at"), reverse=True)
        return len(docs), [_without(d, _USER_SECRETS) for d in docs[skip:skip + limit]]

    async def export_without_secrets(self, limit: int = 10000):
        return [_without(d, _USER_SECRETS) for d in (await self._scan())[:limit]]

    async def fcm_tokens(self):
        """Device tokens for push fan-out (only rows that actually have one)."""
        return [d["fcm_token"] for d in await self._scan()
                if d.get("fcm_token") is not None]

    async def all_email_name(self):
        return [_only(d, ("_id", "email", "name")) for d in await self._scan()]


class PartnerRepo(_AccountRepo):
    _spec_key = "partners"

    # ---- counts -----------------------------------------------------------
    async def count(self, *, status=None, is_active=None,
                    last_active_since=None, created_since=None) -> int:
        docs = await self._scan()
        if status is not None:
            docs = [d for d in docs if d.get("status") == status]
        if is_active is not None:
            docs = [d for d in docs if d.get("is_active") == is_active]
        if last_active_since is not None:
            docs = [d for d in docs if _since(d.get("last_active"), last_active_since)]
        if created_since is not None:
            docs = [d for d in docs if _since(d.get("created_at"), created_since)]
        return len(docs)

    # ---- listing / export -------------------------------------------------
    async def list(self, *, search=None, status=None, partner_type=None,
                   skip: int = 0, limit: int = 20):
        docs = await self._scan()
        if search:
            s = search.lower()
            docs = [d for d in docs
                    if s in str(d.get("name") or "").lower()
                    or s in str(d.get("email") or "").lower()
                    or s in str(d.get("organization") or "").lower()]
        if status:
            docs = [d for d in docs if d.get("status") == status]
        if partner_type:
            docs = [d for d in docs if d.get("partner_type") == partner_type]
        docs.sort(key=_by("created_at"), reverse=True)
        return len(docs), [_without(d, _USER_SECRETS) for d in docs[skip:skip + limit]]

    async def for_assignment(self):
        """Active + verified partners with capacity info, for assignment dropdowns."""
        fields = ("_id", "name", "email", "prayer_capacity",
                  "location_city", "location_country", "cell_name")
        docs = [_only(d, fields) for d in await self._scan()
                if d.get("is_active") is True and d.get("is_verified") is True]
        docs.sort(key=lambda d: str(d.get("name") or ""))
        return docs

    async def export_without_secrets(self, limit: int = 10000):
        return [_without(d, _USER_SECRETS) for d in (await self._scan())[:limit]]

    async def fcm_tokens(self):
        return [d["fcm_token"] for d in await self._scan()
                if d.get("fcm_token") is not None]

    async def all_email_name(self):
        return [_only(d, ("_id", "email", "name")) for d in await self._scan()]


# Releasing a prayer back to the pending pool -- mirror of mongo.py's
# _RELEASE_TO_POOL, except the None-valued fields are REMOVEd rather than
# written as NULL (see _split_nulls: three of them are index keys).
_RELEASE_TO_POOL = {
    "assigned_partner_id": None, "assigned_partner_name": None,
    "assigned_cell_id": None, "assigned_cell_name": None,
    "status": "pending", "assigned_at": None, "seen_by_partner": False,
}
# Statuses that must NEVER be silently released: 'prayed' is done, and 'flagged'
# is reported content held out of circulation until an admin reviews it.
_NOT_RELEASABLE = ("prayed", "flagged")
_ANSWERED = ("prayed", "completed")


class PrayerRequestRepo(_Repo, _DailyCounts):
    """The hottest table. Guarded writes are NAMED methods, and every guard is
    a DynamoDB ConditionExpression rather than a Python read-then-write: that is
    the only way mark_prayed's double-tap check and the release paths' 'never
    recycle prayed/flagged content' check stay atomic under concurrency.
    """

    _spec_key = "prayer_requests"

    def __init__(self, dynamodb):
        super().__init__(dynamodb)
        self._by_user = _gsi(self._spec, "user_id")
        self._by_partner = _gsi(self._spec, "assigned_partner_id")
        self._by_status = _gsi(self._spec, "status")

    # ---- reads ------------------------------------------------------------
    async def get(self, prayer_id: str):
        return await self._get(prayer_id)

    async def get_for_partner(self, prayer_id: str, partner_id: str, *,
                              exclude_prayed: bool = False, fields: dict = None):
        doc = await self._get(prayer_id)
        if doc is None or doc.get("assigned_partner_id") != partner_id:
            return None
        if exclude_prayed and doc.get("status") == "prayed":
            return None
        # Mongo's inclusion projection always keeps _id unless excluded.
        return _only(doc, set(fields) | {"_id"}) if fields else doc

    async def get_for_user(self, prayer_id: str, user_id: str):
        doc = await self._get(prayer_id)
        return doc if doc is not None and doc.get("user_id") == user_id else None

    async def last_answered_for_user(self, user_id: str):
        rows = [d for d in await self._query(self._by_user, Key("user_id").eq(user_id))
                if d.get("status") in _ANSWERED and d.get("prayed_at") is not None]
        if not rows:
            return None
        return _only(max(rows, key=_by("prayed_at")), ("_id", "prayed_at"))

    # ---- counts -----------------------------------------------------------
    async def count(self, *, user_id=None, assigned_partner_id=None, status=None,
                    status_in=None, seen=None, seen_after=None, seen_before=None,
                    submitted_since=None) -> int:
        docs = await self._scan()
        if user_id is not None:
            docs = [d for d in docs if d.get("user_id") == user_id]
        if assigned_partner_id is not None:
            docs = [d for d in docs if d.get("assigned_partner_id") == assigned_partner_id]
        # status_in overrides status: mongo.py writes both to query["status"].
        if status_in is not None:
            wanted = list(status_in)
            docs = [d for d in docs if d.get("status") in wanted]
        elif status is not None:
            docs = [d for d in docs if d.get("status") == status]
        if seen is True:
            docs = [d for d in docs if d.get("seen_by_partner") is True]
        elif seen is False:
            docs = [d for d in docs if d.get("seen_by_partner") is not True]
        if seen_after is not None:
            docs = [d for d in docs if _since(d.get("seen_at"), seen_after)]
        if seen_before is not None:
            docs = [d for d in docs if _before(d.get("seen_at"), seen_before)]
        if submitted_since is not None:
            docs = [d for d in docs if _since(d.get("submitted_at"), submitted_since)]
        return len(docs)

    # ---- analytics --------------------------------------------------------
    # All of these Scan + group in Python; see _bucket() for why (31 rows) and
    # for the `counters` table scale-up path.
    async def avg_response_ms(self, partner_id: str) -> float:
        deltas = [
            (_utc(d["prayed_at"]) - _utc(d["assigned_at"])).total_seconds() * 1000
            for d in await self._query(self._by_partner,
                                       Key("assigned_partner_id").eq(partner_id))
            if d.get("status") == "prayed"
            and isinstance(d.get("prayed_at"), datetime)
            and isinstance(d.get("assigned_at"), datetime)
        ]
        # Mongo returns 0 for "no rows" AND for a falsy average.
        return (sum(deltas) / len(deltas)) if deltas else 0

    async def daily_prayed_for_partner(self, partner_id: str, since):
        rows = await self._query(self._by_partner,
                                 Key("assigned_partner_id").eq(partner_id))
        # to_list(None) in mongo.py -> no 100-bucket cap here either.
        return _bucket(rows, "prayed_at", "%Y-%m-%d", start=since, cap=None)

    async def daily_completed(self, start, end=None, fmt: str = "%Y-%m-%d"):
        """status=prayed, bucketed by prayed_at."""
        rows = [d for d in await self._scan() if d.get("status") == "prayed"]
        return _bucket(rows, "prayed_at", fmt, start=start, end=end)

    async def daily_assigned(self, start, end=None, fmt: str = "%Y-%m-%d"):
        rows = [d for d in await self._scan()
                if d.get("status") in ("assigned", "prayed")]
        return _bucket(rows, "assigned_at", fmt, start=start, end=end)

    async def completion_trend(self, start, fmt: str):
        """Answered-over-time. Prefers prayed_at, falls back to updated_at, so
        rows completed before prayed_at existed still appear."""
        rows = []
        for d in await self._scan():
            if d.get("status") not in _ANSWERED:
                continue
            # $ifNull: missing OR null prayed_at falls through to updated_at.
            completed_at = d.get("prayed_at")
            if completed_at is None:
                completed_at = d.get("updated_at")
            rows.append({"_completed_at": completed_at})
        return _bucket(rows, "_completed_at", fmt, start=start)

    async def category_counts(self, limit: int = 10):
        counts = {}
        for d in await self._scan():
            c = d.get("category")
            if c is None:                # $exists: absent never groups
                continue
            counts[c] = counts.get(c, 0) + 1
        rows = [{"_id": k, "count": v} for k, v in counts.items()]
        # Ties: Mongo's $sort leaves them unspecified; Python's sort is stable,
        # so they come back in first-seen order. Either is valid.
        rows.sort(key=lambda r: -r["count"])
        return rows[:limit]

    # ---- listing ----------------------------------------------------------
    async def list_for_partner(self, query: dict, *, fields: dict, skip: int, limit: int):
        """The partner dashboard. `query` is the raw Mongo filter server.py
        builds for the New/Assigned/Pending/Prayed buckets; _matches() evaluates
        it here and raises on any operator it does not implement."""
        partner_id = query.get("assigned_partner_id")
        if isinstance(partner_id, str):
            # The partner GSI already narrows to one partner's queue, which is
            # capped by prayer_capacity. Rows with no assigned_at are absent
            # from it -- but a row with an assigned_partner_id always has one
            # (they are set and cleared together by every write below).
            docs = await self._query(self._by_partner,
                                     Key("assigned_partner_id").eq(partner_id))
        else:
            docs = await self._scan()
        docs = [d for d in docs if _matches(d, query)]
        docs.sort(key=_by("submitted_at"), reverse=True)
        keep = set(fields) | {"_id"}
        return [_only(d, keep) for d in docs[skip:skip + limit]]

    async def list_admin(self, *, status=None, category=None, search=None,
                         skip: int = 0, limit: int = 20):
        docs = await self._scan()
        if status:
            docs = [d for d in docs if d.get("status") == status]
        if category:
            docs = [d for d in docs if d.get("category") == category]
        if search:
            # mongo.py escapes the regex, so it is a literal case-insensitive
            # substring match -- exactly what `in` does here.
            s = search.lower()
            docs = [d for d in docs if s in str(d.get("content") or "").lower()]
        docs.sort(key=_by("submitted_at"), reverse=True)
        return len(docs), docs[skip:skip + limit]

    async def list_for_user(self, user_id: str, *, skip: int = 0, limit: int = 20):
        docs = await self._query(self._by_user, Key("user_id").eq(user_id),
                                 forward=False)
        return docs[skip:skip + limit]

    async def export(self, limit: int = 10000):
        # Intentionally unsorted -- matches the original export query.
        return (await self._scan())[:limit]

    # ---- writes -----------------------------------------------------------
    async def insert(self, doc: dict) -> None:
        await self._put(_drop_nulls(doc))

    async def update_fields(self, prayer_id: str, set_fields: dict = None,
                            unset_fields: dict = None) -> int:
        sets, unsets = _split_nulls(set_fields, unset_fields)
        return await self._update(prayer_id, set_fields=sets, unset_fields=unsets)

    async def mark_prayed(self, prayer_id: str, partner_id: str, duration_minutes) -> int:
        """Atomic transition to 'prayed'. Returns MODIFIED count (not matched):
        a concurrent double-tap or client retry must come back 0 so partner
        stats, the notification and the push each fire exactly once.

        The status guard is a ConditionExpression, so DynamoDB -- not this
        process -- decides the race; ConditionalCheckFailedException IS the 0.
        """
        return await self._update(
            prayer_id,
            set_fields={"status": "prayed", "prayed_at": datetime.now(timezone.utc),
                        "prayer_duration_minutes": duration_minutes},
            condition=_cond(("eq", "assigned_partner_id", partner_id),
                            ("ne", "status", "prayed")),
        )

    async def unassign(self, prayer_id: str) -> int:
        """Admin unassign. Status guard stops a prayer marked prayed mid-request
        from being reverted to pending (which would let it be prayed twice)."""
        sets, unsets = _split_nulls(_RELEASE_TO_POOL, {"seen_at": ""})
        return await self._update(
            prayer_id, set_fields=sets, unset_fields=unsets,
            condition=_cond(("nin", "status", _NOT_RELEASABLE)),
        )

    async def bulk_unassign(self, prayer_id: str) -> int:
        """Bulk-unassign. NOTE: unlike unassign() this deliberately does NOT clear
        assigned_cell_id/assigned_cell_name -- preserved verbatim from the original
        so the refactor stays behaviour-identical. Looks like a pre-existing bug
        (bulk leaves stale cell info); worth fixing separately, not here."""
        sets, unsets = _split_nulls(
            {"assigned_partner_id": None, "assigned_partner_name": None,
             "status": "pending", "assigned_at": None, "seen_by_partner": False},
            {"seen_at": ""})
        return await self._update(
            prayer_id, set_fields=sets, unset_fields=unsets,
            condition=_cond(("nin", "status", _NOT_RELEASABLE)),
        )

    async def assign_if_pending(self, prayer_id: str, set_fields: dict,
                                blocked=None) -> int:
        """Assign only while still pending, skipping users the partner blocked."""
        guards = [("eq", "status", "pending")]
        if blocked:
            guards.append(("nin", "user_id", list(blocked)))
        sets, unsets = _split_nulls(set_fields, {"seen_at": ""})
        return await self._update(prayer_id, set_fields=sets, unset_fields=unsets,
                                  condition=_cond(*guards))

    async def release_partner(self, partner_id: str) -> None:
        """Free a partner's whole queue (delete/disable) back to the pool.

        Mongo's update_many is not atomic across documents either -- each row
        carries its own guard -- so a per-row conditional unassign() is the
        faithful translation.
        """
        rows = await self._query(self._by_partner,
                                 Key("assigned_partner_id").eq(partner_id))
        for row in rows:
            await self.unassign(row["_id"])

    async def release_user_from_partner(self, partner_id: str, user_id: str) -> None:
        """Partner blocked a user: hand that user's requests back to the pool."""
        rows = await self._query(self._by_partner,
                                 Key("assigned_partner_id").eq(partner_id))
        for row in rows:
            if row.get("user_id") == user_id:
                await self.unassign(row["_id"])

    async def anonymize_user(self, user_id: str) -> None:
        """Account deletion: strip the submitter's PII but keep the prayer text,
        which a partner may already be holding."""
        rows = await self._query(self._by_user, Key("user_id").eq(user_id))
        sets, unsets = _split_nulls({"user_id": None, "user_name": None,
                                     "user_email": None, "is_anonymous": True})
        for row in rows:
            await self._update(row["_id"], set_fields=sets, unset_fields=unsets)

    async def delete(self, prayer_id: str) -> int:
        return await self._delete(prayer_id)


# Which account tables a broadcast target_type expands to. Same table as
# migration/04_backfill.py's BROADCAST_TARGETS; anything else (incl.
# "specific") uses target_ids alone.
_BROADCAST_TARGETS = {
    "all": ("users", "partners"),
    "users": ("users",),
    "partners": ("partners",),
}


class NotificationRepo(_Repo):
    """Recipient-centric notification access, on the FAN-OUT table.

    Mongo stores ONE row per notification with target_ids[]/read_by[] arrays.
    DynamoDB cannot index list membership, so the table holds one item PER
    RECIPIENT: pk=recipient_id, sk="<created_at ISO>#<notification_id>", a
    boolean `read`, and target_type kept as a scalar for audit only.

    AUDIENCE: `audience` ("users"/"partners") is accepted for interface parity
    and deliberately NOT used as a filter. Fan-out already applied Mongo's
    visibility rule once, at write time, so a recipient's partition contains
    exactly the notifications they are allowed to see. Re-filtering on the
    stored target_type would be actively WRONG: a "specific" notification
    addressed to a partner has target_type="specific" (neither "all" nor
    "partners") and target_ids is gone, so the audience test would hide a
    notification Mongo showed. Presence in the partition IS the authorisation
    check, and it is also what scopes mark_read.
    """

    _spec_key = "notifications"

    def __init__(self, dynamodb):
        super().__init__(dynamodb)
        self._sk = self._spec["sk"]
        # Own handles on the account tables, for broadcast fan-out at insert.
        self._accounts = {
            kind: (dynamodb.Table(table_spec.TABLES[kind]["table"]),
                   table_spec.TABLES[kind]["pk"])
            for kind in _BROADCAST_TARGETS["all"]
        }

    # ---- item <-> doc -----------------------------------------------------
    def _doc(self, item):
        """One fanned-out item back into the shape mongo.py returned.

        `read_by` is REBUILT from the boolean because callers compute
        `is_read = recipient_id in notif["read_by"]`; without it every
        notification would render as unread.
        """
        doc = {k: _dec(v) for k, v in item.items()
               if k not in (self._pk, self._sk, "notification_id", "read")}
        doc["_id"] = item.get("notification_id")
        doc["read_by"] = [item[self._pk]] if item.get("read") else []
        return doc

    async def _items_for(self, recipient_id, **kwargs):
        """Raw items in one recipient's partition, NEWEST FIRST."""
        def run():
            items, kw = [], {"KeyConditionExpression": Key(self._pk).eq(recipient_id),
                             "ScanIndexForward": False, **kwargs}
            while True:
                resp = self._t.query(**kw)
                items.extend(resp.get("Items", []))
                kw["ExclusiveStartKey"] = resp.get("LastEvaluatedKey")
                if not kw["ExclusiveStartKey"]:
                    return items
        return await asyncio.to_thread(run)

    def _key(self, item):
        return {self._pk: item[self._pk], self._sk: item[self._sk]}

    async def _all_account_ids(self, kind):
        table, pk = self._accounts[kind]

        def run():
            ids, kw = [], {"ProjectionExpression": "#p",
                           "ExpressionAttributeNames": {"#p": pk}}
            while True:
                resp = table.scan(**kw)
                ids.extend(i[pk] for i in resp.get("Items", []))
                kw["ExclusiveStartKey"] = resp.get("LastEvaluatedKey")
                if not kw["ExclusiveStartKey"]:
                    return ids
        return await asyncio.to_thread(run)

    async def _recipients_of(self, doc):
        """Same rule as migration/04_backfill.py's recipients_of()."""
        ids = list(doc.get("target_ids") or [])
        for kind in _BROADCAST_TARGETS.get(doc.get("target_type") or "specific", ()):
            ids.extend(await self._all_account_ids(kind))
        seen, out = set(), []
        for i in ids:
            if i and i not in seen:
                seen.add(i)
                out.append(i)
        return out

    # ---- writes -----------------------------------------------------------
    async def insert(self, doc: dict) -> None:
        """Fan out: one item per recipient.

        GAP vs Mongo: target_type="all"/"users"/"partners" is resolved HERE, at
        write time, against the accounts that exist now. In Mongo the match was
        evaluated at read time, so an account created after a broadcast still
        saw it. Fanned-out broadcasts are only visible to accounts that already
        existed. (Same trade migration/04_backfill.py already made.)
        """
        notification_id = str(doc["_id"])
        created_at = doc.get("created_at")
        created_sort = _enc(created_at) if isinstance(created_at, datetime) else ""
        base = _drop_nulls({k: _enc(v) for k, v in doc.items()
                            if k not in ("_id", "target_ids", "read_by")})
        base["notification_id"] = notification_id
        recipients = await self._recipients_of(doc)

        def run():
            with self._t.batch_writer() as batch:
                for recipient in recipients:
                    batch.put_item(Item=dict(
                        base,
                        **{self._pk: str(recipient),
                           self._sk: f"{created_sort}#{notification_id}",
                           "read": False},
                    ))
        await asyncio.to_thread(run)

    async def set_message(self, notif_id: str, message: str) -> None:
        """Personalised text arrives after the row is created (background task).

        ponytail: Scan by notification_id. The table has no GSI on it (see
        table_spec.py) and the only caller enriches a single-recipient
        'prayer_prayed' notification. A notification_id GSI is the upgrade if
        broadcasts ever need editing at scale.
        """
        def run():
            items, kw = [], {"FilterExpression": Attr("notification_id").eq(notif_id)}
            while True:
                resp = self._t.scan(**kw)
                items.extend(resp.get("Items", []))
                kw["ExclusiveStartKey"] = resp.get("LastEvaluatedKey")
                if not kw["ExclusiveStartKey"]:
                    break
            for item in items:
                self._t.update_item(
                    Key=self._key(item),
                    UpdateExpression="SET #m = :m",
                    ExpressionAttributeNames={"#m": "message"},
                    ExpressionAttributeValues={":m": message},
                )
        await asyncio.to_thread(run)

    async def mark_read(self, notif_id: str, recipient_id: str, audience: str) -> int:
        """Returns matched_count. Scoped to what the recipient can actually see:
        an id that was never fanned out to them has no item in their partition,
        so a known id cannot be marked read by someone it was never sent to."""
        items = await self._items_for(
            recipient_id, FilterExpression=Attr("notification_id").eq(notif_id))
        if not items:
            return 0

        def run():
            for item in items:
                self._t.update_item(
                    Key=self._key(item),
                    UpdateExpression="SET #r = :t",
                    ExpressionAttributeNames={"#r": "read"},   # RESERVED WORD
                    ExpressionAttributeValues={":t": True},
                )
        await asyncio.to_thread(run)
        # Mongo's $addToSet returns matched_count 1 even when already read.
        return 1

    async def mark_all_read(self, recipient_id: str, audience: str) -> None:
        items = await self._items_for(recipient_id,
                                      FilterExpression=Attr("read").ne(True))

        def run():
            for item in items:
                self._t.update_item(
                    Key=self._key(item),
                    UpdateExpression="SET #r = :t",
                    ExpressionAttributeNames={"#r": "read"},
                    ExpressionAttributeValues={":t": True},
                )
        await asyncio.to_thread(run)

    async def detach_recipient(self, recipient_id: str) -> None:
        """Account deletion: drop this recipient's whole partition.

        Mongo needed a second pass to bin 'specific' notifications left with no
        recipients; under fan-out that is automatic -- removing the last
        recipient removes the notification.
        """
        items = await self._items_for(recipient_id)

        def run():
            with self._t.batch_writer() as batch:
                for item in items:
                    batch.delete_item(Key=self._key(item))
        await asyncio.to_thread(run)

    # ---- reads ------------------------------------------------------------
    async def list_for(self, recipient_id: str, audience: str, *, unread_only: bool = False,
                       skip: int = 0, limit: int = 50):
        kwargs = {"FilterExpression": Attr("read").ne(True)} if unread_only else {}
        # sk starts with the created_at ISO string, so descending sk IS
        # descending created_at -- mongo.py's .sort("created_at", -1).
        items = await self._items_for(recipient_id, **kwargs)
        return [self._doc(i) for i in items[skip:skip + limit]]

    async def count_for(self, recipient_id: str, audience: str, *,
                        unread_only: bool = False) -> int:
        def run():
            kw = {"KeyConditionExpression": Key(self._pk).eq(recipient_id),
                  "Select": "COUNT"}
            if unread_only:
                kw["FilterExpression"] = Attr("read").ne(True)
            total = 0
            while True:
                resp = self._t.query(**kw)
                total += resp.get("Count", 0)
                kw["ExclusiveStartKey"] = resp.get("LastEvaluatedKey")
                if not kw["ExclusiveStartKey"]:
                    return total
        return await asyncio.to_thread(run)


class PrayerCellRepo(_Repo):
    """Geographic prayer cells. Endpoints are live but the table is empty in
    production, so this has no golden-harness coverage beyond an empty list."""

    _spec_key = "prayer_cells"

    async def find_for_location(self, city: str, country: str):
        """First active cell whose city AND country match (case-insensitive).

        mongo.py escapes the regex, so it is a literal case-insensitive
        SUBSTRING match, not equality -- `in` reproduces that.
        """
        c, k = city.lower(), country.lower()
        for doc in await self._scan():
            if (doc.get("is_active") is True
                    and c in str(doc.get("location_city") or "").lower()
                    and k in str(doc.get("location_country") or "").lower()):
                return doc
        return None

    async def get_by_name(self, name: str):
        # Filtered in Python: `name` is a DynamoDB RESERVED WORD, and the table
        # is empty in production anyway.
        for doc in await self._scan():
            if doc.get("name") == name:
                return doc
        return None

    async def list_active(self):
        return [d for d in await self._scan() if d.get("is_active") is True]

    async def insert(self, doc: dict) -> None:
        await self._put(_drop_nulls(doc))

    async def adjust_agent_count(self, cell_id: str, delta: int) -> None:
        """+1 when a partner joins a cell, -1 when they leave or are deleted.

        DynamoDB's ADD treats a missing numeric attribute as 0, same as $inc.
        """
        await self._update(cell_id, inc_fields={"agent_count": delta})


class DynamoRepos:
    """Same attribute names as MongoRepos, so server.py never changes."""

    backend = "dynamo"

    def __init__(self):
        dynamodb = boto3.resource("dynamodb", region_name=table_spec.REGION)
        self._dynamodb = dynamodb
        self.avatars = AvatarRepo()
        self.activity_logs = ActivityLogRepo(dynamodb)
        self.llm_logs = LLMLogRepo(dynamodb)
        self.admins = AdminRepo(dynamodb)
        self.users = UserRepo(dynamodb)
        self.partners = PartnerRepo(dynamodb)
        self.prayer_cells = PrayerCellRepo(dynamodb)
        self.notifications = NotificationRepo(dynamodb)
        self.prayer_requests = PrayerRequestRepo(dynamodb)
