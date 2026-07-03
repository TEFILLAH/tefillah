"""
Autonomous tail of the tefillah.in AWS deploy.

Runs in a single background invocation that:

  1. Polls public DNS until tefillah.in NS records point at AWS Route 53.
  2. Polls ACM (us-east-1) until the certificate is ISSUED.
  3. Reads the existing CloudFront distribution config, adds tefillah.in +
     www.tefillah.in to Aliases, and binds the ACM cert. UpdateDistribution.
  4. Adds two A-type ALIAS records to Route 53 (apex + www) pointing at the
     CloudFront distribution.
  5. Waits for the distribution to finish Deployed status.
  6. Smoke-tests https://tefillah.in/ and https://www.tefillah.in/.

Prints progress to stdout. Exits non-zero on any unrecoverable failure.
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.request
import urllib.error
from typing import Iterable

ZONE_ID = "Z06246302MVTLD5P84FBW"
DOMAIN = "tefillah.in"
WWW = f"www.{DOMAIN}"
DIST_ID = "E20DJ1IDF5M5MD"
ACM_ARN = (
    "arn:aws:acm:us-east-1:020262236044:certificate/"
    "e1749f45-07a1-4ad6-a956-3c2be29c88c8"
)
# CloudFront's fixed hosted-zone ID for ALIAS targets (global).
CLOUDFRONT_HOSTED_ZONE = "Z2FDTNDATAQYW2"
DIST_DOMAIN = "dc71sb5z88jh2.cloudfront.net"

EXPECTED_NS = {
    "ns-258.awsdns-32.com.",
    "ns-934.awsdns-52.net.",
    "ns-1137.awsdns-14.org.",
    "ns-1774.awsdns-29.co.uk.",
}

# Hard upper bound to stop polling — 12h. Far more than any reasonable
# propagation. If we hit this, GoDaddy didn't actually save the change.
MAX_TOTAL_WAIT_SECONDS = 12 * 60 * 60


def log(msg: str) -> None:
    ts = time.strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def run(cmd: list[str]) -> str:
    """Run a command, return stdout as string. Raises on non-zero exit."""
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(
            f"command failed ({result.returncode}): {' '.join(cmd)}\n"
            f"stderr: {result.stderr}"
        )
    return result.stdout


def doh_query(name: str, qtype: str, resolver: str) -> dict:
    """DNS-over-HTTPS query that ignores the local resolver."""
    if resolver == "google":
        url = f"https://dns.google/resolve?name={name}&type={qtype}"
        headers = {"accept": "application/dns-json"}
    else:  # cloudflare
        url = f"https://cloudflare-dns.com/dns-query?name={name}&type={qtype}"
        headers = {"accept": "application/dns-json"}
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


def ns_set_for(name: str, resolver: str) -> set[str]:
    """Return the set of NS hostnames for `name` as the resolver sees them."""
    try:
        data = doh_query(name, "NS", resolver)
    except urllib.error.URLError:
        return set()
    return {a["data"] for a in data.get("Answer", []) if a.get("type") == 2}


def wait_for_ns_flip() -> None:
    log("Waiting for Route 53 to become authoritative for tefillah.in")
    log(f"  Expected NS set: {sorted(EXPECTED_NS)}")
    start = time.time()
    attempt = 0
    while time.time() - start < MAX_TOTAL_WAIT_SECONDS:
        attempt += 1
        google = ns_set_for(DOMAIN, "google")
        cf = ns_set_for(DOMAIN, "cloudflare")
        log(
            f"  attempt {attempt:3d}  google={sorted(google) or '∅'}  "
            f"cf={sorted(cf) or '∅'}"
        )
        if google == EXPECTED_NS and cf == EXPECTED_NS:
            log("  ✅ Both major resolvers show AWS NS. NS flipped.")
            return
        # Aggressive at the start (every 90s for first 30 min), then slow down.
        elapsed = time.time() - start
        if elapsed < 30 * 60:
            time.sleep(90)
        elif elapsed < 2 * 60 * 60:
            time.sleep(5 * 60)
        else:
            time.sleep(15 * 60)
    raise RuntimeError("NS flip did not complete inside the 12h budget")


def wait_for_acm_issued() -> None:
    log("Waiting for ACM cert to validate via Route 53")
    while True:
        out = run(
            [
                "aws", "acm", "describe-certificate",
                "--region", "us-east-1",
                "--certificate-arn", ACM_ARN,
                "--query", "Certificate.Status",
                "--output", "text",
            ]
        ).strip()
        log(f"  cert status: {out}")
        if out == "ISSUED":
            return
        if out in {"FAILED", "REVOKED", "INACTIVE"}:
            raise RuntimeError(f"ACM cert ended in bad state: {out}")
        time.sleep(45)


def bind_cert_and_aliases() -> None:
    log("Reading current CloudFront distribution config")
    raw = run(
        [
            "aws", "cloudfront", "get-distribution-config",
            "--id", DIST_ID, "--output", "json",
        ]
    )
    payload = json.loads(raw)
    etag = payload["ETag"]
    cfg = payload["DistributionConfig"]

    # Patch: aliases + ACM cert (replacing CloudFront default cert).
    cfg["Aliases"] = {"Quantity": 2, "Items": [DOMAIN, WWW]}
    cfg["ViewerCertificate"] = {
        "ACMCertificateArn": ACM_ARN,
        "SSLSupportMethod": "sni-only",
        "MinimumProtocolVersion": "TLSv1.2_2021",
        "CertificateSource": "acm",
        "CloudFrontDefaultCertificate": False,
    }
    cfg["Comment"] = "tefillah.in SPA - S3 origin via OAC - LIVE"

    config_path = "/tmp/cf-dist-update.json"
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)

    # Windows AWS CLI quirk: file:// URIs need to resolve through cwd, so we
    # pass the absolute Windows path explicitly.
    win_path = "D:\\tmp\\cf-dist-update.json"
    with open(win_path, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)

    log("Pushing UpdateDistribution (binds aliases + cert)")
    out = run(
        [
            "aws", "cloudfront", "update-distribution",
            "--id", DIST_ID,
            "--if-match", etag,
            "--distribution-config", f"file://{win_path}",
            "--output", "json",
        ]
    )
    new_status = json.loads(out)["Distribution"]["Status"]
    log(f"  UpdateDistribution accepted, distribution status: {new_status}")


def add_alias_records() -> None:
    log("Adding Route 53 A-ALIAS records for apex + www → CloudFront")
    change_batch = {
        "Comment": "Apex + www point at CloudFront",
        "Changes": [
            {
                "Action": "UPSERT",
                "ResourceRecordSet": {
                    "Name": DOMAIN + ".",
                    "Type": "A",
                    "AliasTarget": {
                        "HostedZoneId": CLOUDFRONT_HOSTED_ZONE,
                        "DNSName": DIST_DOMAIN + ".",
                        "EvaluateTargetHealth": False,
                    },
                },
            },
            {
                "Action": "UPSERT",
                "ResourceRecordSet": {
                    "Name": WWW + ".",
                    "Type": "A",
                    "AliasTarget": {
                        "HostedZoneId": CLOUDFRONT_HOSTED_ZONE,
                        "DNSName": DIST_DOMAIN + ".",
                        "EvaluateTargetHealth": False,
                    },
                },
            },
        ],
    }
    path = "D:\\tmp\\r53-alias-batch.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(change_batch, f, indent=2)
    out = run(
        [
            "aws", "route53", "change-resource-record-sets",
            "--hosted-zone-id", ZONE_ID,
            "--change-batch", f"file://{path}",
            "--output", "json",
        ]
    )
    change_id = json.loads(out)["ChangeInfo"]["Id"]
    log(f"  Change submitted: {change_id}")
    while True:
        status = run(
            [
                "aws", "route53", "get-change",
                "--id", change_id, "--query", "ChangeInfo.Status",
                "--output", "text",
            ]
        ).strip()
        log(f"  ALIAS change: {status}")
        if status == "INSYNC":
            return
        time.sleep(10)


def wait_distribution_deployed() -> None:
    log("Waiting for CloudFront distribution to redeploy with the new aliases")
    while True:
        status = run(
            [
                "aws", "cloudfront", "get-distribution",
                "--id", DIST_ID, "--query", "Distribution.Status",
                "--output", "text",
            ]
        ).strip()
        log(f"  distribution status: {status}")
        if status == "Deployed":
            return
        time.sleep(30)


def smoke_test() -> None:
    log("Smoke testing the live domain")
    targets: Iterable[str] = (
        f"https://{DOMAIN}/",
        f"https://{WWW}/",
        f"https://{DOMAIN}/login",
        f"https://{DOMAIN}/this-route-does-not-exist",
    )
    for url in targets:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "deploy-smoke"})
            with urllib.request.urlopen(req, timeout=15) as r:
                log(f"  {url} → HTTP {r.status}, {r.headers.get('content-length')} bytes")
                for h in (
                    "Strict-Transport-Security",
                    "Content-Security-Policy",
                    "X-Frame-Options",
                ):
                    v = r.headers.get(h)
                    if v:
                        v = v[:80] + ("…" if len(v) > 80 else "")
                    log(f"    {h}: {v}")
        except urllib.error.HTTPError as e:
            log(f"  {url} → HTTP {e.code} (expected? error)")
        except Exception as e:  # noqa: BLE001
            log(f"  {url} → FAILED ({e!r})")


def main() -> None:
    wait_for_ns_flip()
    wait_for_acm_issued()
    bind_cert_and_aliases()
    add_alias_records()
    wait_distribution_deployed()
    smoke_test()
    log("✅ tefillah.in is live")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        log(f"❌ FAILED: {e!r}")
        sys.exit(1)
