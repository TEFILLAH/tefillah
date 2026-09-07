"""
Phase 2, step 1 — provision every DynamoDB table declared in table_spec.py.

Idempotent: an existing table is reported and left completely alone. This script
NEVER deletes or alters a table, so re-running it after a partial failure is
always safe.

Usage:
  python migration/03_create_tables.py --dry-run
  python migration/03_create_tables.py
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import boto3                                    # noqa: E402
from botocore.exceptions import ClientError     # noqa: E402

import table_spec                               # noqa: E402  (single source of truth)


def build_request(spec):
    """Full CreateTable kwargs for one spec entry."""
    keys, attrs = table_spec.key_schema(spec)
    req = {
        "TableName": spec["table"],
        "KeySchema": keys,
        "AttributeDefinitions": [
            {"AttributeName": n, "AttributeType": t} for n, t in sorted(attrs.items())
        ],
        "BillingMode": "PAY_PER_REQUEST",
    }
    gsis = []
    for gsi in spec.get("gsis", []):
        gsi_keys = [{"AttributeName": gsi["pk"], "KeyType": "HASH"}]
        if gsi.get("sk"):
            gsi_keys.append({"AttributeName": gsi["sk"], "KeyType": "RANGE"})
        gsis.append({
            "IndexName": gsi["name"],
            "KeySchema": gsi_keys,
            # ALL: the repo layer reads whole documents off these indexes
            # (get_by_email returns the full user), so KEYS_ONLY would just
            # force a second GetItem per row.
            "Projection": {"ProjectionType": "ALL"},
        })
    if gsis:
        req["GlobalSecondaryIndexes"] = gsis
    return req


def enable_ttl(client, name):
    """Turn on TTL for `name`. Returns a short status string."""
    current = client.describe_time_to_live(TableName=name)
    status = current["TimeToLiveDescription"]["TimeToLiveStatus"]
    if status in ("ENABLED", "ENABLING"):
        return f"already {status.lower()}"
    client.update_time_to_live(
        TableName=name,
        TimeToLiveSpecification={"Enabled": True,
                                 "AttributeName": table_spec.TTL_ATTRIBUTE},
    )
    return f"enabled on '{table_spec.TTL_ATTRIBUTE}'"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true",
                    help="print the plan and create nothing")
    args = ap.parse_args()

    client = boto3.client("dynamodb", region_name=table_spec.REGION)
    existing = set()
    paginator = client.get_paginator("list_tables")
    for page in paginator.paginate():
        existing.update(page["TableNames"])

    created, skipped, ttl_notes = [], [], []

    for key, spec in table_spec.TABLES.items():
        name = spec["table"]
        req = build_request(spec)
        gsi_names = [g["IndexName"] for g in req.get("GlobalSecondaryIndexes", [])]

        if args.dry_run:
            sk = f", sk={spec['sk']}" if spec.get("sk") else ""
            print(f"[plan] {name}: pk={spec['pk']}{sk}, "
                  f"gsis={gsi_names or 'none'}, "
                  f"ttl={'yes' if spec.get('ttl') else 'no'}, "
                  f"{'EXISTS -> would skip' if name in existing else 'would CREATE'}")
            continue

        if name in existing:
            skipped.append(name)
            print(f"[skip]   {name} already exists")
        else:
            try:
                client.create_table(**req)
            except ClientError as e:
                # Lost a race with another run of this script -- still a skip.
                if e.response["Error"]["Code"] != "ResourceInUseException":
                    raise
                skipped.append(name)
                print(f"[skip]   {name} already exists")
            else:
                created.append(name)
                print(f"[create] {name} gsis={gsi_names or 'none'}")

        print(f"         waiting for {name} to become ACTIVE...")
        client.get_waiter("table_exists").wait(TableName=name)

        if spec.get("ttl"):
            ttl_notes.append(f"{name}: {enable_ttl(client, name)}")

    if args.dry_run:
        print(f"\ndry run — {len(table_spec.TABLES)} table(s) in the spec, nothing changed")
        return 0

    print("\n" + "=" * 60)
    print(f"created ({len(created)}): {', '.join(created) or 'none'}")
    print(f"skipped ({len(skipped)}): {', '.join(skipped) or 'none'}")
    for note in ttl_notes:
        print(f"ttl: {note}")

    # Every table in the spec must now be ACTIVE, or the migration cannot proceed.
    bad = []
    for spec in table_spec.TABLES.values():
        state = client.describe_table(TableName=spec["table"])["Table"]["TableStatus"]
        if state != "ACTIVE":
            bad.append(f"{spec['table']}={state}")
    if bad:
        print("NOT ACTIVE: " + ", ".join(bad))
        return 1
    print(f"all {len(table_spec.TABLES)} table(s) ACTIVE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
