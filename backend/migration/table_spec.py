"""
SINGLE SOURCE OF TRUTH for the DynamoDB table design.

Every migration script and the DynamoDB repository implementation import this
module. Nothing may hardcode a table name, key or index anywhere else -- that is
how two components silently drift apart and a migration corrupts data.

Design rationale (derived from measuring the real query patterns in server.py):
  * PAY_PER_REQUEST everywhere: the whole dataset is ~1000 items, so on-demand
    costs cents and needs zero capacity planning.
  * Every access pattern found in the code maps to a Query on a key or GSI.
    The only Scans left are admin search + exports, which are rare and tiny.
  * `counters` replaces 39 count_documents() calls and the daily $group
    aggregations: writers atomically ADD, readers do an O(1) get or a small
    range read (e.g. prayers_daily#2026-09-01 .. #2026-09-30).
  * notifications is FAN-OUT (one item per recipient) because DynamoDB cannot
    index list membership, which is what the old target_ids[]/read_by[] model
    relied on.
"""

REGION = "ap-south-1"
PREFIX = "tefillah_"

# Attribute used for DynamoDB TTL on the log tables (epoch seconds).
TTL_ATTRIBUTE = "expires_at"

# Logs have no natural partition key to sort by, so they share a constant
# bucket attribute; that lets the GSI sort by timestamp with a single Query
# instead of a Scan. Safe here because log volume is tiny.
LOG_BUCKET_ATTR = "log_bucket"
LOG_BUCKET_VALUE = "all"


def table(name):
    return PREFIX + name


TABLES = {
    # ---- accounts ----------------------------------------------------------
    "users": {
        "table": table("users"),
        "pk": "id",
        "gsis": [
            {"name": "email-index", "pk": "email"},
            {"name": "status-created_at-index", "pk": "status", "sk": "created_at"},
        ],
        "source_collection": "users",
    },
    "partners": {
        "table": table("partners"),
        "pk": "id",
        "gsis": [
            {"name": "email-index", "pk": "email"},
            {"name": "status-created_at-index", "pk": "status", "sk": "created_at"},
        ],
        "source_collection": "partners",
    },
    "admins": {
        "table": table("admins"),
        "pk": "id",
        "gsis": [{"name": "email-index", "pk": "email"}],
        "source_collection": "admins",
    },

    # ---- prayer requests (hottest table) -----------------------------------
    "prayer_requests": {
        "table": table("prayer_requests"),
        "pk": "id",
        "gsis": [
            # user's own history, newest first
            {"name": "user_id-submitted_at-index", "pk": "user_id", "sk": "submitted_at"},
            # partner dashboard queue. ponytail: the New/Assigned/Overdue buckets
            # filter on status + seen_by_partner + seen_at, but they do NOT need
            # their own GSI -- this index already narrows to one partner, whose
            # queue is capped by prayer_capacity (default 10), so bucketing the
            # handful of returned rows in Python is cheaper than a 4th index.
            # Revisit only if per-partner volume ever reaches thousands.
            {"name": "assigned_partner_id-assigned_at-index",
             "pk": "assigned_partner_id", "sk": "assigned_at"},
            # admin filters + the pending pool
            {"name": "status-submitted_at-index", "pk": "status", "sk": "submitted_at"},
        ],
        "source_collection": "prayer_requests",
    },

    # ---- notifications: FAN-OUT, one item per recipient ---------------------
    "notifications": {
        "table": table("notifications"),
        "pk": "recipient_id",
        "sk": "created_sort",          # "<created_at ISO>#<notification_id>"
        "gsis": [],
        "source_collection": "notifications",
        "fan_out": True,
    },

    # ---- misc --------------------------------------------------------------
    "prayer_cells": {
        "table": table("prayer_cells"),
        "pk": "id",
        "gsis": [],
        "source_collection": "prayer_cells",
    },

    # ---- append-only logs (TTL so they expire for free) --------------------
    "llm_logs": {
        "table": table("llm_logs"),
        "pk": "id",
        "gsis": [{"name": "bucket-timestamp-index", "pk": LOG_BUCKET_ATTR, "sk": "timestamp"}],
        # "log" = stamp LOG_BUCKET_ATTR so the bucket-timestamp GSI works.
        # This is REQUIRED (it is a GSI key) and is deliberately separate from
        # TTL, which is optional -- they were previously gated on one flag.
        "log": True,
        # ponytail: TTL deliberately OFF (--ttl-days 0). 878 log rows: expiry saves
        # nothing, and stamping it would have deleted backfilled logs 6 days after
        # migration, since their own timestamps already exceed a 180d window.
        # Re-enable with one update-time-to-live call if the logs ever grow.
        "source_collection": "llm_logs",
    },
    "activity_logs": {
        "table": table("activity_logs"),
        "pk": "id",
        "gsis": [{"name": "bucket-timestamp-index", "pk": LOG_BUCKET_ATTR, "sk": "timestamp"}],
        # "log" = stamp LOG_BUCKET_ATTR so the bucket-timestamp GSI works.
        # This is REQUIRED (it is a GSI key) and is deliberately separate from
        # TTL, which is optional -- they were previously gated on one flag.
        "log": True,
        # ponytail: TTL deliberately OFF (--ttl-days 0). 878 log rows: expiry saves
        # nothing, and stamping it would have deleted backfilled logs 6 days after
        # migration, since their own timestamps already exceed a 180d window.
        # Re-enable with one update-time-to-live call if the logs ever grow.
        "source_collection": "activity_logs",
    },

    # ---- counters: replaces counts + daily aggregations ---------------------
    "counters": {
        "table": table("counters"),
        "pk": "counter_name",
        "gsis": [],
        "source_collection": None,   # derived, never backfilled from a collection
    },
}

# `avatars` is intentionally ABSENT: new uploads already go to S3, only one
# legacy blob remains, and DynamoDB's 400KB item limit makes it the wrong store.
# That single legacy row moves to S3 instead.
EXCLUDED_COLLECTIONS = {"avatars"}


def all_table_names():
    return [t["table"] for t in TABLES.values()]


def key_schema(spec):
    """DynamoDB KeySchema + AttributeDefinitions for a table spec."""
    keys = [{"AttributeName": spec["pk"], "KeyType": "HASH"}]
    attrs = {spec["pk"]: "S"}
    if spec.get("sk"):
        keys.append({"AttributeName": spec["sk"], "KeyType": "RANGE"})
        attrs[spec["sk"]] = "S"
    for gsi in spec.get("gsis", []):
        attrs[gsi["pk"]] = "S"
        if gsi.get("sk"):
            attrs[gsi["sk"]] = "S"
    return keys, attrs
