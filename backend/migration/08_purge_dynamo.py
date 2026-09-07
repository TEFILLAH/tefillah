"""
Delete every item from the tefillah_* DynamoDB tables.

Needed because 04_backfill.py only PUTS: re-running it overwrites rows that
still exist in the source but cannot remove rows that no longer do. Without a
purge, a table keeps stale items forever and the parity count check fails
(exactly what happened with 7 test-only llm_logs rows).

    python migration/08_purge_dynamo.py --dry-run     # counts only
    python migration/08_purge_dynamo.py --apply

SAFETY: refuses to run while the live environment is actually serving from
DynamoDB (DB_BACKEND=dynamo). Purging the store production is reading would be
an outage, so the check is not optional and is not skippable by a flag.
Tables and their indexes are left intact -- only items are removed.
"""
import argparse
import shutil
import subprocess
import sys

import boto3

import table_spec

EB_APP = "tefillah-api"
EB_ENV = "tefillah-api-prod-v2"


def live_backend():
    """What DB_BACKEND is the production environment using right now?"""
    # shutil.which resolves the .cmd/.exe shim on Windows; a bare "aws" raises
    # FileNotFoundError there, and this check must never fail OPEN.
    aws = shutil.which("aws")
    if not aws:
        return "UNKNOWN (aws CLI not found)"
    try:
        out = subprocess.run(
            [aws, "elasticbeanstalk", "describe-configuration-settings",
             "--application-name", EB_APP, "--environment-name", EB_ENV,
             "--region", table_spec.REGION,
             "--query",
             "ConfigurationSettings[0].OptionSettings[?OptionName=='DB_BACKEND'].Value",
             "--output", "text"],
            capture_output=True, text=True, timeout=90)
        return (out.stdout or "").strip() or "mongo"      # unset == mongo
    except Exception as e:
        return f"UNKNOWN ({type(e).__name__})"


def purge(table, pk, sk, apply):
    keys = [pk] + ([sk] if sk else [])
    seen, deleted, kwargs = 0, 0, {"ProjectionExpression": ", ".join(f"#k{i}" for i in range(len(keys))),
                                   "ExpressionAttributeNames": {f"#k{i}": k for i, k in enumerate(keys)}}
    batch = table.batch_writer() if apply else None
    while True:
        resp = table.scan(**kwargs)
        for item in resp["Items"]:
            seen += 1
            if apply:
                batch.delete_item(Key={k: item[k] for k in keys})
                deleted += 1
        if "LastEvaluatedKey" not in resp:
            break
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
    if batch is not None:
        batch.__exit__(None, None, None)
    return seen, deleted


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true",
                    help="Actually delete. Without it this only counts.")
    args = ap.parse_args()

    backend = live_backend()
    print(f"live production DB_BACKEND: {backend}")
    if backend != "mongo":
        sys.exit(f"REFUSING: production is serving from {backend!r}. "
                 "Purging these tables would take the site down.")

    dynamodb = boto3.resource("dynamodb", region_name=table_spec.REGION)
    total_seen = total_deleted = 0
    for name, spec in table_spec.TABLES.items():
        table = dynamodb.Table(spec["table"])
        seen, deleted = purge(table, spec["pk"], spec.get("sk"), args.apply)
        total_seen += seen
        total_deleted += deleted
        verb = "deleted" if args.apply else "would delete"
        print(f"  {spec['table']:<30} {verb} {seen}")

    print(f"\n{'PURGED' if args.apply else 'DRY RUN'}: "
          f"{total_deleted if args.apply else total_seen} item(s) across "
          f"{len(table_spec.TABLES)} tables.")
    if not args.apply:
        print("Re-run with --apply to actually delete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
