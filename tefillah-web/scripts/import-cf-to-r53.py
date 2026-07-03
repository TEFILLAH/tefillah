"""
Import every Cloudflare DNS record (from cf-tefillah-records.json) into the
Route 53 hosted zone for tefillah.in.

Skips the apex A records and the www CNAME — those will be replaced later by
A ALIAS records pointing at the new CloudFront distribution.

Groups records of the same (name, type) into one R53 ResourceRecordSet, which
is required by the R53 API.
"""

from __future__ import annotations

import json
import shlex
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

ZONE_ID = "Z06246302MVTLD5P84FBW"
ZONE_NAME = "tefillah.in"
RECORDS_FILE = Path(r"C:\Users\suraj\Downloads\cf-tefillah-records.json")

# Records we'll skip during the initial mirror — they get replaced with
# CloudFront ALIAS records in a later step.
SKIP = {
    ("tefillah.in", "A"),
    ("www.tefillah.in", "CNAME"),
}


def norm_name(name: str) -> str:
    """Route 53 expects names as FQDN with trailing dot."""
    if not name.endswith("."):
        name = name + "."
    return name


def normalize_txt_value(value: str) -> str:
    """
    R53 TXT values must be wrapped in quotes. Cloudflare gives us values that
    are either already-quoted strings (sometimes with multiple quoted chunks
    separated by spaces, like DKIM keys), or bare strings.

    We keep already-quoted content verbatim and wrap bare content in a single
    quoted string.
    """
    v = value.strip()
    if v.startswith('"') and v.endswith('"'):
        return v
    # Bare string: escape any inner quotes and wrap.
    return '"' + v.replace('"', r"\"") + '"'


def build_resource_records(records: list[dict]) -> dict:
    """
    Turn a list of Cloudflare records into a Route 53 change-batch dict.

    Records are grouped by (name, type). The Value for each record depends on
    type:

      - A / AAAA / CNAME: just `content`
      - MX:               "<priority> <content>"
      - SRV:              built from `data` (priority weight port target)
      - TXT:              quoted, raw or already-quoted from Cloudflare
    """
    grouped: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for rec in records:
        key = (rec["name"], rec["type"])
        if key in SKIP:
            print(f"  · skip {rec['name']} {rec['type']}")
            continue
        grouped[key].append(rec)

    changes = []
    for (name, rtype), items in grouped.items():
        values: list[str] = []
        ttl = max((it.get("ttl") or 300) for it in items)
        for it in items:
            if rtype in ("A", "AAAA", "CNAME"):
                values.append(it["content"])
            elif rtype == "MX":
                pri = it.get("priority") or 10
                values.append(f"{pri} {it['content']}")
            elif rtype == "SRV":
                d = it.get("data") or {}
                values.append(
                    f"{d.get('priority', 0)} {d.get('weight', 0)} "
                    f"{d.get('port', 0)} {d.get('target', '')}"
                )
            elif rtype == "TXT":
                values.append(normalize_txt_value(it["content"]))
            else:
                print(f"  · unsupported type {rtype} for {name} — skipped")
                continue

        if not values:
            continue

        changes.append({
            "Action": "UPSERT",
            "ResourceRecordSet": {
                "Name": norm_name(name),
                "Type": rtype,
                "TTL": ttl,
                "ResourceRecords": [{"Value": v} for v in values],
            },
        })

    return {"Comment": "Migrate from Cloudflare", "Changes": changes}


def main() -> None:
    payload = json.loads(RECORDS_FILE.read_text(encoding="utf-8"))
    records = payload["records"]
    print(f"Loaded {len(records)} records from Cloudflare export")

    batch = build_resource_records(records)
    print(f"Generated {len(batch['Changes'])} Route 53 change(s):")
    for c in batch["Changes"]:
        rrs = c["ResourceRecordSet"]
        print(f"  + {rrs['Type']:5} {rrs['Name']:45} -> "
              + " | ".join(r["Value"] for r in rrs["ResourceRecords"]))

    out = Path("/tmp/r53-import-batch.json")
    out.write_text(json.dumps(batch, indent=2))
    print(f"\nWrote batch to {out}")

    if "--apply" not in sys.argv:
        print("\nDry-run only. Pass --apply to push to Route 53.")
        return

    cmd = [
        "aws", "route53", "change-resource-record-sets",
        "--hosted-zone-id", ZONE_ID,
        "--change-batch", f"file://{out}",
        "--output", "json",
    ]
    print("\nRunning:", " ".join(shlex.quote(c) for c in cmd))
    result = subprocess.run(cmd, capture_output=True, text=True)
    print(result.stdout)
    if result.returncode != 0:
        print("STDERR:", result.stderr, file=sys.stderr)
        sys.exit(result.returncode)
    print("OK — batch applied. Waiting for change to propagate inside R53…")


if __name__ == "__main__":
    main()
