"""
Phase 4 -- copy MongoDB documents into DynamoDB.

READ-ONLY against MongoDB. This script never issues a write/update/delete to
Mongo; it only calls find()/distinct(). The source database DEFAULTS to
`tefilah_test` and DB_NAME from backend/.env is deliberately IGNORED, because
that variable points at the live production database.

Run:
    python migration/04_backfill.py --dry-run
    python migration/04_backfill.py                       # -> tefilah_test
    python migration/04_backfill.py --source-db tefilah --i-know-this-is-production

Idempotent: every write is a PutItem on the table's own key, so re-running
overwrites in place and never duplicates.

--------------------------------------------------------------------------
TRANSFORMATION RULES (see the module constants / functions for the code)
--------------------------------------------------------------------------
_id            -> renamed to the spec's partition key, coerced with str().
datetime       -> ISO-8601 string, normalised to UTC and emitted WITHOUT an
                  offset ("2026-04-22T09:00:51.586000"). pymongo hands back
                  naive-UTC datetimes and server.py already returns exactly
                  this shape from .isoformat(), so this keeps the wire format
                  unchanged. It also sorts correctly lexicographically, which
                  is what the range keys and GSI sort keys rely on.
float          -> Decimal(str(x)); DynamoDB has no float type. NaN/Inf abort.
None           -> DROPPED at the top level only. Two reasons: a top-level None
                  on a GSI key attribute (assigned_partner_id, assigned_at,
                  status) is serialised as NULL and DynamoDB rejects the item
                  with a key-type mismatch; and "absent" is how DynamoDB
                  expresses "no value". Nulls NESTED inside maps/lists are
                  PRESERVED as DynamoDB NULL so list positions stay stable and
                  nested payloads (activity_logs.details) round-trip exactly.
index keys     -> forced to str() if the source value is not a string, with a
                  warning, because every key attribute is declared "S".
empty string   -> dropped when it lands on a key/index-key attribute (DynamoDB
                  forbids empty key values); kept everywhere else.
logs           -> LOG_BUCKET_ATTR=LOG_BUCKET_VALUE is stamped on every item so
                  the bucket-timestamp GSI is queryable, and TTL_ATTRIBUTE is
                  set to <timestamp> + --ttl-days (default 180) in epoch
                  seconds.
notifications  -> FAN-OUT, see fan_out_notification().
"""
import argparse
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import boto3
from pymongo import MongoClient

import table_spec

BACKEND_DIR = Path(__file__).resolve().parent.parent

# The source database is NEVER read from .env: DB_NAME there is production.
DEFAULT_SOURCE_DB = "tefilah_test"
PRODUCTION_DB = "tefilah"

# Numeric attribute on every `counters` item. table_spec pins the key
# (counter_name) but not the payload, so this is the one name the DynamoDB
# repository has to agree with.
COUNTER_VALUE_ATTR = "value"

EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


# --------------------------------------------------------------------------
# env / mongo
# --------------------------------------------------------------------------
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


def connect_mongo(db_name: str):
    env = load_env(BACKEND_DIR / ".env")
    url = env.get("MONGO_URL")
    if not url:
        raise SystemExit("ERROR: MONGO_URL not found in backend/.env")
    client = MongoClient(url, serverSelectionTimeoutMS=20000)
    client.admin.command("ping")
    return client[db_name]


# --------------------------------------------------------------------------
# value transformation
# --------------------------------------------------------------------------
def iso(dt: datetime) -> str:
    """UTC ISO-8601 without an offset -- see the module docstring."""
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt.isoformat()


def epoch_seconds(dt: datetime) -> int:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int((dt - EPOCH).total_seconds())


def ddb_value(v, path: str):
    """Convert one Mongo value to something DynamoDB accepts.

    Nulls are preserved here; only convert_doc() drops them, and only at the
    top level.
    """
    if isinstance(v, bool) or v is None:
        return v
    if isinstance(v, datetime):
        return iso(v)
    if isinstance(v, float):
        if v != v or v in (float("inf"), float("-inf")):
            raise ValueError(f"{path}: DynamoDB cannot store NaN/Infinity ({v!r})")
        return Decimal(str(v))
    if isinstance(v, dict):
        return {k: ddb_value(x, f"{path}.{k}") for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [ddb_value(x, f"{path}[{i}]") for i, x in enumerate(v)]
    return v


def index_key_attrs(spec: dict) -> set:
    """Every attribute used as a table or GSI key -- all declared type "S"."""
    attrs = {spec["pk"]}
    if spec.get("sk"):
        attrs.add(spec["sk"])
    for gsi in spec.get("gsis", []):
        attrs.add(gsi["pk"])
        if gsi.get("sk"):
            attrs.add(gsi["sk"])
    return attrs


def convert_doc(doc: dict, spec: dict, warnings: Counter, rename_id=True) -> dict:
    """Mongo document -> DynamoDB item."""
    keyed = index_key_attrs(spec)
    item = {}
    for k, v in doc.items():
        if rename_id and k == "_id":
            k = spec["pk"]
        if v is None:
            continue  # top-level nulls are dropped
        value = ddb_value(v, k)
        if k in keyed:
            if not isinstance(value, str):
                warnings[f"{spec['table']}: coerced index key {k!r} to str"] += 1
                value = str(value)
            if value == "":
                warnings[f"{spec['table']}: dropped empty index key {k!r}"] += 1
                continue
        item[k] = value
    return item


def stamp_log(item: dict, spec: dict, ttl_days: int, stats: Counter) -> dict:
    """Add the log bucket attribute (REQUIRED: it is a GSI key), and the TTL
    attribute only when ttl_days > 0. These are separate concerns -- gating the
    bucket on the TTL flag would silently break the bucket-timestamp GSI."""
    item[table_spec.LOG_BUCKET_ATTR] = table_spec.LOG_BUCKET_VALUE
    if ttl_days <= 0:
        return item
    ts = item.get("timestamp")
    if isinstance(ts, str):
        try:
            expires = epoch_seconds(datetime.fromisoformat(ts)) + ttl_days * 86400
        except ValueError:
            stats["log_ttl_unparseable_timestamp"] += 1
            return item
        item[table_spec.TTL_ATTRIBUTE] = expires
        if expires <= epoch_seconds(datetime.now(timezone.utc)):
            stats["log_ttl_already_expired"] += 1
    else:
        stats["log_ttl_missing_timestamp"] += 1
    return item


# --------------------------------------------------------------------------
# notifications fan-out
# --------------------------------------------------------------------------
BROADCAST_TARGETS = {
    "all": ("users", "partners"),
    "users": ("users",),
    "partners": ("partners",),
}


class AccountIds:
    """Lazily-loaded id lists for broadcast fan-out. Read-only on Mongo."""

    def __init__(self, db):
        self._db = db
        self._cache = {}

    def get(self, collection: str):
        if collection not in self._cache:
            self._cache[collection] = [
                d["_id"] for d in self._db[collection].find({}, {"_id": 1})
            ]
        return self._cache[collection]


def recipients_of(doc: dict, accounts: AccountIds) -> list:
    """Who this notification is for.

    target_type "specific" (or anything unrecognised) uses target_ids;
    "all"/"users"/"partners" expand to every account id in the matching
    collections. Duplicates are removed so one recipient gets one item.
    """
    target_type = doc.get("target_type") or "specific"
    ids = list(doc.get("target_ids") or [])
    for collection in BROADCAST_TARGETS.get(target_type, ()):
        ids.extend(accounts.get(collection))
    seen, out = set(), []
    for i in ids:
        if i and i not in seen:
            seen.add(i)
            out.append(i)
    return out


def fan_out_notification(doc: dict, spec: dict, accounts: AccountIds,
                         warnings: Counter) -> list:
    """One DynamoDB item per recipient.

    target_ids[] and read_by[] are intentionally NOT copied onto the items:
    they are the exact list-membership model DynamoDB cannot index, and on a
    broadcast they would be duplicated onto every recipient's row. read_by is
    collapsed into the per-recipient boolean `read`; target_ids is what the
    fan-out itself encodes. target_type is kept as a plain scalar for audit.
    """
    notification_id = str(doc["_id"])
    created_at = doc.get("created_at")
    created_iso = iso(created_at) if isinstance(created_at, datetime) else ""
    read_by = set(doc.get("read_by") or [])

    base = {k: v for k, v in doc.items()
            if k not in ("_id", "target_ids", "read_by")}
    base = convert_doc(base, spec, warnings, rename_id=False)
    base["notification_id"] = notification_id

    items = []
    for recipient in recipients_of(doc, accounts):
        item = dict(base)
        item[spec["pk"]] = str(recipient)
        item[spec["sk"]] = f"{created_iso}#{notification_id}"
        item["read"] = recipient in read_by
        items.append(item)
    if not items:
        warnings[f"notifications: {notification_id} has no recipients, skipped"] += 1
    return items


# --------------------------------------------------------------------------
# counters
# --------------------------------------------------------------------------
# Entity prefixes used in counter names. repo/mongo.py already documents the
# shape: "users_daily#2026-09-06".
ENTITY = {
    "users": "users",
    "partners": "partners",
    "admins": "admins",
    "prayer_requests": "prayers",
    "notifications": "notifications",
    "prayer_cells": "prayer_cells",
    "llm_logs": "llm",
    "activity_logs": "activity",
}

# (collection, counter prefix, list of doc fields forming the suffix)
GROUP_BYS = [
    ("users", "users_status", ["status"]),
    ("partners", "partners_status", ["status"]),
    ("prayer_requests", "prayers_status", ["status"]),
    ("prayer_requests", "prayers_category", ["category"]),
    ("prayer_requests", "prayers_partner", ["assigned_partner_id"]),
    ("prayer_requests", "prayers_partner_status",
     ["assigned_partner_id", "status"]),
]

# (collection, counter prefix, datetime field)
DAILIES = [
    ("users", "users_daily", "created_at"),
    ("partners", "partners_daily", "created_at"),
    ("prayer_requests", "prayers_daily", "submitted_at"),
    ("prayer_requests", "prayers_completed_daily", "prayed_at"),
    ("prayer_requests", "prayers_assigned_daily", "assigned_at"),
    ("llm_logs", "llm_daily", "timestamp"),
]

# (collection, counter name, numeric field to sum)
SUMS = [("llm_logs", "llm_tokens_total", "total_tokens")]


def accumulate_counters(collection: str, doc: dict, counters: Counter) -> None:
    """Fold one source document into the derived counters. One pass, no
    second read of the collection."""
    counters[f"{ENTITY.get(collection, collection)}_total"] += 1

    for coll, prefix, fields in GROUP_BYS:
        if coll != collection:
            continue
        values = [doc.get(f) for f in fields]
        if any(v is None or v == "" for v in values):
            continue
        counters[prefix + "#" + "#".join(str(v) for v in values)] += 1

    for coll, prefix, date_field in DAILIES:
        if coll != collection:
            continue
        value = doc.get(date_field)
        if isinstance(value, datetime):
            counters[f"{prefix}#{value.strftime('%Y-%m-%d')}"] += 1

    for coll, name, field in SUMS:
        if coll == collection and isinstance(doc.get(field), int):
            counters[name] += doc[field]


# --------------------------------------------------------------------------
# writing
# --------------------------------------------------------------------------
class Sink:
    """Writes items, or just counts them when --dry-run."""

    def __init__(self, dynamodb, dry_run: bool):
        self._dynamodb = dynamodb
        self.dry_run = dry_run
        self.samples = {}

    def write(self, spec: dict, items) -> int:
        written = 0
        pkeys = [spec["pk"]] + ([spec["sk"]] if spec.get("sk") else [])
        if self.dry_run:
            for item in items:
                self.samples.setdefault(spec["table"], item)
                written += 1
            return written
        table = self._dynamodb.Table(spec["table"])
        # overwrite_by_pkeys: a fan-out batch could otherwise contain the same
        # key twice, which DynamoDB rejects for the whole BatchWriteItem.
        with table.batch_writer(overwrite_by_pkeys=pkeys) as batch:
            for item in items:
                self.samples.setdefault(spec["table"], item)
                batch.put_item(Item=item)
                written += 1
        return written


def existing_tables(dynamodb) -> set:
    names = set()
    paginator = dynamodb.meta.client.get_paginator("list_tables")
    for page in paginator.paginate():
        names.update(page["TableNames"])
    return names


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------
def parse_args(argv=None):
    p = argparse.ArgumentParser(description="Backfill MongoDB -> DynamoDB.")
    p.add_argument("--source-db", default=DEFAULT_SOURCE_DB,
                   help=f"Mongo database to READ (default: {DEFAULT_SOURCE_DB}). "
                        f"DB_NAME from .env is ignored on purpose.")
    p.add_argument("--i-know-this-is-production", action="store_true",
                   help=f"Required to read the live {PRODUCTION_DB!r} database.")
    p.add_argument("--dry-run", action="store_true",
                   help="Read Mongo, transform, print what WOULD be written. "
                        "Touches no AWS API at all.")
    p.add_argument("--ttl-days", type=int, default=0,
                   help="Log TTL horizon after each log's own timestamp. "
                        "DEFAULT 0 = no TTL stamped (tables are tiny). Set e.g. "
                        "180 only if the log tables actually grow.")
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)

    if args.source_db == PRODUCTION_DB and not args.i_know_this_is_production:
        print(f"REFUSING to read {PRODUCTION_DB!r}: that is the LIVE production "
              f"database.\nPass --i-know-this-is-production if you really mean it.")
        return 2
    if args.source_db == PRODUCTION_DB:
        print(f"!! Reading LIVE PRODUCTION database {PRODUCTION_DB!r} (read-only) !!\n")

    db = connect_mongo(args.source_db)
    present = set(db.list_collection_names())
    accounts = AccountIds(db)

    dynamodb = None
    if not args.dry_run:
        dynamodb = boto3.resource("dynamodb", region_name=table_spec.REGION)
        missing = set(table_spec.all_table_names()) - existing_tables(dynamodb)
        if missing:
            print("ERROR: these DynamoDB tables do not exist yet:")
            for name in sorted(missing):
                print(f"  {name}")
            print("Run 03_create_tables.py first (or use --dry-run).")
            return 3

    sink = Sink(dynamodb, args.dry_run)
    warnings = Counter()
    stats = Counter()
    counters = Counter()
    written = {}
    skipped = {}

    mode = "DRY RUN -- nothing will be written" if args.dry_run else "WRITING"
    print(f"{mode}\nsource mongo db : {args.source_db}\n"
          f"target region   : {table_spec.REGION}\n")

    for name, spec in table_spec.TABLES.items():
        collection = spec.get("source_collection")
        if collection is None:
            continue  # counters, handled after the pass
        if collection in table_spec.EXCLUDED_COLLECTIONS:
            skipped[collection] = "EXCLUDED_COLLECTIONS"
            continue
        if collection not in present:
            skipped[collection] = "collection absent from source database"
            continue

        def items():
            for doc in db[collection].find({}):
                accumulate_counters(collection, doc, counters)
                if spec.get("fan_out"):
                    yield from fan_out_notification(doc, spec, accounts, warnings)
                else:
                    item = convert_doc(doc, spec, warnings)
                    if spec.get("log"):
                        item = stamp_log(item, spec, args.ttl_days, stats)
                    yield item

        written[spec["table"]] = sink.write(spec, items())

    # ---- counters -------------------------------------------------------
    counter_spec = table_spec.TABLES["counters"]
    counter_items = [
        {counter_spec["pk"]: name, COUNTER_VALUE_ATTR: value}
        for name, value in sorted(counters.items())
    ]
    written[counter_spec["table"]] = sink.write(counter_spec, counter_items)

    # ---- report ---------------------------------------------------------
    if args.dry_run:
        print("Sample item per table (first one seen):")
        for table_name in sorted(sink.samples):
            print(f"\n  {table_name}:")
            for k, v in sorted(sink.samples[table_name].items()):
                text = repr(v)
                print(f"    {k:<26} {text[:90]}{'...' if len(text) > 90 else ''}")
        print()

    print(f"\n{'WOULD WRITE' if args.dry_run else 'WROTE'} per table:")
    for table_name in sorted(written):
        print(f"  {table_name:<32} {written[table_name]:>6}")
    print(f"  {'TOTAL':<32} {sum(written.values()):>6}")

    if skipped:
        print("\nSkipped collections:")
        for collection, why in sorted(skipped.items()):
            print(f"  {collection:<24} {why}")

    print("\nDerived counters:")
    for name, value in sorted(counters.items())[:200]:
        print(f"  {name:<48} {value:>6}")
    if len(counters) > 200:
        print(f"  ... and {len(counters) - 200} more")

    if stats["log_ttl_already_expired"]:
        print(f"\nWARNING: {stats['log_ttl_already_expired']} log item(s) have a "
              f"TTL ({args.ttl_days} days after their own timestamp) that is "
              f"ALREADY IN THE PAST.\n         DynamoDB will delete them within "
              f"~48h of the table having TTL enabled. Re-run with a larger "
              f"--ttl-days if you need to keep them.")
    for key in ("log_ttl_missing_timestamp", "log_ttl_unparseable_timestamp"):
        if stats[key]:
            print(f"WARNING: {stats[key]} log item(s): {key}")

    if warnings:
        print("\nWarnings:")
        for message, n in sorted(warnings.items()):
            print(f"  x{n:<5} {message}")

    return 0


def _self_check() -> None:
    """Smallest runnable check of the non-obvious logic: transformation and
    fan-out. `python migration/04_backfill.py --self-check`"""
    spec = table_spec.TABLES["prayer_requests"]
    warn = Counter()
    doc = {
        "_id": "p1", "location_lat": 12.5, "assigned_partner_id": None,
        "submitted_at": datetime(2026, 4, 22, 9, 0, 51, 586000),
        "status": "pending", "reported": False,
        "details": {"a": None, "b": [1, None]},
    }
    item = convert_doc(doc, spec, warn)
    assert item["id"] == "p1", item
    assert "_id" not in item
    assert item["location_lat"] == Decimal("12.5")
    assert "assigned_partner_id" not in item, "top-level None must be dropped"
    assert item["submitted_at"] == "2026-04-22T09:00:51.586000", item["submitted_at"]
    assert item["reported"] is False
    assert item["details"] == {"a": None, "b": [1, None]}, "nested nulls kept"

    # aware datetimes normalise to the same naive-UTC string
    assert iso(datetime(2026, 4, 22, 9, 0, tzinfo=timezone.utc)) == "2026-04-22T09:00:00"

    # fan-out: one item per recipient, `read` derived from read_by
    nspec = table_spec.TABLES["notifications"]

    class FakeAccounts:
        def get(self, collection):
            return {"users": ["u1", "u2"], "partners": ["pa1"]}[collection]

    ndoc = {
        "_id": "n1", "title": "t", "target_type": "specific",
        "target_ids": ["u1", "u2", "u1"], "read_by": ["u2"],
        "created_at": datetime(2026, 6, 9, 14, 50, 7, 498000),
    }
    items = fan_out_notification(ndoc, nspec, FakeAccounts(), warn)
    assert len(items) == 2, "duplicate recipient must collapse to one item"
    by_recipient = {i["recipient_id"]: i for i in items}
    assert by_recipient["u1"]["read"] is False
    assert by_recipient["u2"]["read"] is True
    assert by_recipient["u1"]["created_sort"] == "2026-06-09T14:50:07.498000#n1"
    assert by_recipient["u1"]["notification_id"] == "n1"
    assert "read_by" not in by_recipient["u1"] and "target_ids" not in by_recipient["u1"]

    broadcast = dict(ndoc, _id="n2", target_type="all", target_ids=[], read_by=["pa1"])
    items = fan_out_notification(broadcast, nspec, FakeAccounts(), warn)
    assert sorted(i["recipient_id"] for i in items) == ["pa1", "u1", "u2"], items
    assert {i["recipient_id"]: i["read"] for i in items} == {
        "u1": False, "u2": False, "pa1": True}

    # log stamping
    lspec = table_spec.TABLES["activity_logs"]
    log = convert_doc({"_id": "l1", "timestamp": datetime(2026, 1, 1)}, lspec, warn)
    log = stamp_log(log, lspec, 180, Counter())
    assert log[table_spec.LOG_BUCKET_ATTR] == table_spec.LOG_BUCKET_VALUE
    assert log[table_spec.TTL_ATTRIBUTE] == epoch_seconds(datetime(2026, 1, 1)) + 180 * 86400

    # counters
    c = Counter()
    accumulate_counters("prayer_requests", {
        "status": "prayed", "category": "health", "assigned_partner_id": "pa1",
        "submitted_at": datetime(2026, 9, 6, 1, 0)}, c)
    assert c["prayers_total"] == 1
    assert c["prayers_status#prayed"] == 1
    assert c["prayers_partner#pa1"] == 1
    assert c["prayers_partner_status#pa1#prayed"] == 1
    assert c["prayers_daily#2026-09-06"] == 1

    print("04_backfill self-check OK")


if __name__ == "__main__":
    if "--self-check" in sys.argv:
        _self_check()
        sys.exit(0)
    sys.exit(main())
