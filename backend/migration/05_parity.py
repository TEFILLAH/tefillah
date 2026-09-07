"""
Phase 5 -- prove the DynamoDB copy matches MongoDB. Gates the cutover.

READ-ONLY on both sides. Exits non-zero if ANYTHING mismatches, so CI or a
deploy script can use it as a gate:

    python migration/05_parity.py                     # -> tefilah_test
    python migration/05_parity.py --source-db tefilah --i-know-this-is-production

Three checks:

1. COUNTS      Mongo count_documents() vs a real DynamoDB scan(Select=COUNT).
               DescribeTable's ItemCount is deliberately NOT used -- it is only
               refreshed every ~6 hours and would report 0 right after a
               backfill.
               notifications is FAN-OUT, so its expected count is the number of
               (notification, recipient) pairs, not the raw document count.

2. FIELDS      Up to --sample docs per collection are re-transformed with
               04_backfill's own converter and compared attribute-by-attribute
               against the real DynamoDB item, recursively, reporting exact
               field paths. Decimal/int/float are compared numerically and
               datetimes via the same ISO normalisation, so type changes that
               preserve the value do not register as mismatches -- but a bool
               that turned into a number does.
               A separate no-silent-drop check asserts every non-null top-level
               Mongo field actually landed as an attribute, which the
               transform-vs-item comparison alone could not catch.

3. COUNTERS    The derived `counters` table is rebuilt from the source data and
               diffed against what is actually stored. These values replace
               count_documents() at runtime, so a wrong counter is a silent
               production bug rather than a visible one.
"""
import argparse
import importlib.util
import sys
from collections import Counter
from datetime import datetime
from decimal import Decimal
from pathlib import Path

import boto3

import table_spec

# 04_backfill is not a valid module name (leading digit), so load it by path.
# Reusing its converter is the point: parity must check that what the backfill
# produced actually landed, using the identical transformation.
_spec = importlib.util.spec_from_file_location(
    "backfill", Path(__file__).resolve().parent / "04_backfill.py")
backfill = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(backfill)


# --------------------------------------------------------------------------
# comparison
# --------------------------------------------------------------------------
NUMBERS = (int, float, Decimal)


def equal(a, b) -> bool:
    # bool is a subclass of int, so True == Decimal(1) in plain Python.
    # A boolean that became a number is a real corruption; catch it.
    if isinstance(a, bool) or isinstance(b, bool):
        return isinstance(a, bool) and isinstance(b, bool) and a == b
    if isinstance(a, NUMBERS) and isinstance(b, NUMBERS):
        return Decimal(str(a)) == Decimal(str(b))
    return a == b


def diff(expected, actual, path=""):
    """[(field_path, expected, actual)] for everything that differs."""
    out = []
    if isinstance(expected, dict) and isinstance(actual, dict):
        for key in sorted(set(expected) | set(actual)):
            child = f"{path}.{key}" if path else key
            if key not in expected:
                out.append((child, "<absent in mongo>", actual[key]))
            elif key not in actual:
                out.append((child, expected[key], "<absent in dynamo>"))
            else:
                out += diff(expected[key], actual[key], child)
    elif isinstance(expected, list) and isinstance(actual, list):
        if len(expected) != len(actual):
            out.append((path, f"list[{len(expected)}]", f"list[{len(actual)}]"))
        else:
            for i, (e, a) in enumerate(zip(expected, actual)):
                out += diff(e, a, f"{path}[{i}]")
    elif not equal(expected, actual):
        out.append((path, expected, actual))
    return out


# --------------------------------------------------------------------------
# dynamo helpers
# --------------------------------------------------------------------------
def scan_count(table) -> int:
    total, kwargs = 0, {"Select": "COUNT"}
    while True:
        response = table.scan(**kwargs)
        total += response["Count"]
        if "LastEvaluatedKey" not in response:
            return total
        kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]


def scan_all(table):
    kwargs = {}
    while True:
        response = table.scan(**kwargs)
        yield from response["Items"]
        if "LastEvaluatedKey" not in response:
            return
        kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]


class Report:
    def __init__(self):
        self.failures = []

    def fail(self, message):
        self.failures.append(message)
        print(f"  MISMATCH  {message}")

    def ok(self, message):
        print(f"  ok        {message}")


# --------------------------------------------------------------------------
# checks
# --------------------------------------------------------------------------
def expected_item(doc, spec, accounts, recipient=None):
    """What 04_backfill would have written for this document."""
    warnings = Counter()
    if spec.get("fan_out"):
        for item in backfill.fan_out_notification(doc, spec, accounts, warnings):
            if item[spec["pk"]] == recipient:
                return item
        return None
    item = backfill.convert_doc(doc, spec, warnings)
    if spec.get("log"):
        # ttl_days=0 -> stamps only the log bucket (a GSI key). TTL is optional
        # and varies with --ttl-days, so it is never part of the comparison.
        item = backfill.stamp_log(item, spec, 0, Counter())
        item.pop(table_spec.TTL_ATTRIBUTE, None)
    return item


# Fields mutated by ordinary authenticated READS, so they drift between two
# independently-exercised databases and can never be compared meaningfully.
# `last_active` is the partner heartbeat: get_current_partner() writes it on
# every request more than 30s after the last one, which means simply RUNNING
# the golden harness against a backend bumps it there. Kept deliberately tiny --
# every entry here is a hole in the check, so it needs a reason this specific.
HEARTBEAT_FIELDS = {"last_active", "last_login"}


def check_counts(db, dynamodb, report, accounts):
    print("\n[1/3] Document counts")
    for name, spec in table_spec.TABLES.items():
        collection = spec.get("source_collection")
        if collection is None or collection in table_spec.EXCLUDED_COLLECTIONS:
            continue
        if collection not in db.list_collection_names():
            report.ok(f"{collection}: absent from source database, nothing to migrate")
            continue

        actual = scan_count(dynamodb.Table(spec["table"]))
        if spec.get("fan_out"):
            docs = list(db[collection].find({}))
            expected = sum(len(backfill.recipients_of(d, accounts)) for d in docs)
            label = (f"{collection}: {len(docs)} docs fanned out to {expected} "
                     f"recipient items")
        else:
            expected = db[collection].count_documents({})
            label = f"{collection}: {expected} docs"

        if expected == actual:
            report.ok(f"{label} == {actual} in {spec['table']}")
        else:
            report.fail(f"{label} but {spec['table']} holds {actual} "
                        f"(delta {actual - expected:+d})")


def check_fields(db, dynamodb, report, accounts, sample_size):
    print(f"\n[2/3] Field-level spot check (up to {sample_size} per collection)")
    for name, spec in table_spec.TABLES.items():
        collection = spec.get("source_collection")
        if collection is None or collection in table_spec.EXCLUDED_COLLECTIONS:
            continue
        if collection not in db.list_collection_names():
            continue

        table = dynamodb.Table(spec["table"])
        # (mongo doc, dynamo key) pairs. Fan-out means one doc can produce many.
        pairs = []
        for doc in db[collection].find({}):
            if spec.get("fan_out"):
                for recipient in backfill.recipients_of(doc, accounts):
                    item = expected_item(doc, spec, accounts, recipient)
                    pairs.append((doc, recipient,
                                  {spec["pk"]: recipient,
                                   spec["sk"]: item[spec["sk"]]}))
            else:
                pairs.append((doc, None, {spec["pk"]: str(doc["_id"])}))
            if len(pairs) >= sample_size:
                break
        pairs = pairs[:sample_size]

        bad = 0
        for doc, recipient, key in pairs:
            got = table.get_item(Key=key).get("Item")
            ident = key[spec["pk"]] + (f" / {key[spec['sk']]}" if spec.get("sk") else "")
            if got is None:
                report.fail(f"{spec['table']}: no item for key {key}")
                bad += 1
                continue

            expected = expected_item(doc, spec, accounts, recipient)
            if spec.get("log"):
                # ignore any TTL attr left on rows from an earlier backfill
                got.pop(table_spec.TTL_ATTRIBUTE, None)

            for field_path, want, have in diff(expected, got):
                if field_path in HEARTBEAT_FIELDS:
                    continue
                report.fail(f"{spec['table']}[{ident}] field {field_path}: "
                            f"mongo={want!r} dynamo={have!r}")
                bad += 1

            # Independent of the transform: nothing non-null may vanish.
            ignored = {"_id"} | ({"target_ids", "read_by"} if spec.get("fan_out") else set())
            for field, value in doc.items():
                if field in ignored or value is None:
                    continue
                if field not in got:
                    report.fail(f"{spec['table']}[{ident}]: mongo field {field!r} "
                                f"was silently dropped")
                    bad += 1

        if not bad:
            report.ok(f"{collection}: {len(pairs)} sampled items match field-for-field")


def check_counters(db, dynamodb, report):
    print("\n[3/3] Derived counters")
    spec = table_spec.TABLES["counters"]
    expected = Counter()
    for other in table_spec.TABLES.values():
        collection = other.get("source_collection")
        if collection is None or collection in table_spec.EXCLUDED_COLLECTIONS:
            continue
        if collection not in db.list_collection_names():
            continue
        for doc in db[collection].find({}):
            backfill.accumulate_counters(collection, doc, expected)

    actual = {i[spec["pk"]]: i.get(backfill.COUNTER_VALUE_ATTR)
              for i in scan_all(dynamodb.Table(spec["table"]))}

    bad = 0
    for counter_name in sorted(set(expected) | set(actual)):
        want, have = expected.get(counter_name), actual.get(counter_name)
        if want is None:
            report.fail(f"counter {counter_name!r} exists in DynamoDB ({have}) "
                        f"but is not derivable from the source")
            bad += 1
        elif have is None:
            report.fail(f"counter {counter_name!r} missing from DynamoDB "
                        f"(expected {want})")
            bad += 1
        elif not equal(want, have):
            report.fail(f"counter {counter_name!r}: expected {want}, stored {have}")
            bad += 1
    if not bad:
        report.ok(f"all {len(expected)} counters match the source data")


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------
def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="MongoDB <-> DynamoDB parity check.")
    p.add_argument("--source-db", default=backfill.DEFAULT_SOURCE_DB,
                   help=f"Mongo database to READ (default: "
                        f"{backfill.DEFAULT_SOURCE_DB}).")
    p.add_argument("--i-know-this-is-production", action="store_true")
    p.add_argument("--sample", type=int, default=25,
                   help="Documents per collection for the field check (default 25).")
    args = p.parse_args(argv)

    if args.source_db == backfill.PRODUCTION_DB and not args.i_know_this_is_production:
        print(f"REFUSING to read {backfill.PRODUCTION_DB!r}: that is the LIVE "
              f"production database.\nPass --i-know-this-is-production if you "
              f"really mean it.")
        return 2

    db = backfill.connect_mongo(args.source_db)
    dynamodb = boto3.resource("dynamodb", region_name=table_spec.REGION)

    missing = set(table_spec.all_table_names()) - backfill.existing_tables(dynamodb)
    if missing:
        print("ERROR: these DynamoDB tables do not exist:")
        for name in sorted(missing):
            print(f"  {name}")
        return 3

    print(f"source mongo db : {args.source_db}\n"
          f"target region   : {table_spec.REGION}")

    accounts = backfill.AccountIds(db)
    report = Report()
    check_counts(db, dynamodb, report, accounts)
    check_fields(db, dynamodb, report, accounts, args.sample)
    check_counters(db, dynamodb, report)

    print()
    if report.failures:
        print(f"PARITY FAILED: {len(report.failures)} mismatch(es). "
              f"DO NOT CUT OVER.")
        return 1
    print("PARITY OK: counts, sampled fields and counters all match.")
    return 0


def _self_check() -> None:
    """`python migration/05_parity.py --self-check`"""
    assert diff({"a": 1}, {"a": Decimal("1")}) == [], "int/Decimal must compare equal"
    assert diff({"a": 1.5}, {"a": Decimal("1.5")}) == []
    assert diff({"a": True}, {"a": Decimal("1")}), "bool->number must be caught"
    assert diff({"a": True}, {"a": True}) == []
    assert diff({"a": None}, {"a": None}) == []
    assert diff({"a": {"b": [1, None]}}, {"a": {"b": [Decimal(1), None]}}) == []
    assert diff({"a": 1}, {}) == [("a", 1, "<absent in dynamo>")]
    assert diff({}, {"a": 1}) == [("a", "<absent in mongo>", 1)]
    assert diff({"a": [1]}, {"a": [1, 2]}) == [("a", "list[1]", "list[2]")]
    assert diff({"a": "x"}, {"a": "y"}) == [("a", "x", "y")]
    # nested path reporting
    assert diff({"d": {"x": 1}}, {"d": {"x": 2}})[0][0] == "d.x"
    # the ISO round-trip the whole design leans on
    assert backfill.iso(datetime(2026, 1, 2, 3, 4, 5)) == "2026-01-02T03:04:05"
    print("05_parity self-check OK")


if __name__ == "__main__":
    if "--self-check" in sys.argv:
        _self_check()
        sys.exit(0)
    sys.exit(main())
