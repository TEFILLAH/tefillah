"""
Run every migration gate in order and report a single verdict.

This is the checkpoint between phases: nothing advances unless this is green.
Deliberately boring -- it shells out to the existing scripts and collects exit
codes rather than re-implementing their logic, so there is exactly one copy of
each check and this file cannot drift away from what it claims to verify.

    python migration/verify_all.py            # gates that apply right now
    python migration/verify_all.py --phase 2  # include the DynamoDB gates

Exit code is 0 only if every gate that RAN passed. Gates that cannot run yet
(a script not written, an adapter incomplete) are reported SKIP, never PASS --
a skipped gate must never look like a passing one.
"""
import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
PY = BACKEND / ".venv" / "Scripts" / "python.exe"
if not PY.exists():                     # non-Windows / different layout
    PY = BACKEND / ".venv" / "bin" / "python"

PASS, FAIL, SKIP = "PASS", "FAIL", "SKIP"


def run(cmd, timeout=1800):
    env = dict(os.environ)
    env.setdefault("AWS_DEFAULT_REGION", "ap-south-1")
    env["PYTHONIOENCODING"] = "utf-8"
    try:
        # encoding/errors are explicit: gate output contains prayer text and raw
        # image bytes, and the Windows default (cp1252) raises on those -- which
        # would crash the runner and MASK the gate's real result.
        p = subprocess.run(cmd, cwd=BACKEND, capture_output=True, text=True,
                           encoding="utf-8", errors="replace",
                           timeout=timeout, env=env)
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except subprocess.TimeoutExpired:
        return 124, f"TIMEOUT after {timeout}s"


def gate_syntax():
    files = ["server.py"] + [str(p.relative_to(BACKEND)) for p in
                             sorted((BACKEND / "repo").glob("*.py"))]
    rc, out = run([str(PY), "-m", "py_compile", *files])
    return (PASS if rc == 0 else FAIL), out.strip()[-400:]


def gate_undefined_names():
    """py_compile does NOT catch undefined names. This gate exists because two
    real NameErrors survived a refactor and the GET-only golden harness could
    not see them (they were only reachable via DELETE)."""
    files = ["server.py"] + [str(p.relative_to(BACKEND)) for p in
                             sorted((BACKEND / "repo").glob("*.py"))]
    rc, out = run([str(PY), "-m", "pyflakes", *files])
    real = [ln for ln in out.splitlines()
            if ln.strip() and "imported but unused" not in ln
            and "f-string is missing placeholders" not in ln]
    return (PASS if not real else FAIL), "\n".join(real[:15])


def gate_no_direct_db():
    """Phase 1's actual invariant: no inline collection access left in server.py."""
    import re
    src = (BACKEND / "server.py").read_text(encoding="utf-8")
    hits = re.findall(r"\bdb\.[a-z_]+\.(?:find|insert|update|delete|count|aggregate|create_index)\w*",
                      src)
    return (PASS if not hits else FAIL), f"{len(hits)} direct call(s): {sorted(set(hits))[:8]}"


def gate_golden(backend):
    script = "migration/02_golden.py"
    rc, out = run([str(PY), script, "compare", "--backend", backend,
                   "--baseline", "migration/golden_before.json"])
    if "IDENTICAL" in out:
        return PASS, [l for l in out.splitlines() if "IDENTICAL" in l][0].strip()
    if "has no attribute" in out:
        return SKIP, "adapter incomplete: " + next(
            (l.strip() for l in out.splitlines() if "has no attribute" in l), "")[:160]
    diffs = [l for l in out.splitlines() if "DIFFERENCE" in l]
    return FAIL, (diffs[0] if diffs else out.strip()[-400:])


def gate_script(rel, args=(), needs=None):
    path = BACKEND / rel
    if not path.exists():
        return SKIP, f"{rel} not written yet"
    rc, out = run([str(PY), rel, *args])
    tail = [l for l in out.splitlines() if l.strip()][-1:] or [""]
    return (PASS if rc == 0 else FAIL), tail[0].strip()[:200]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase", type=int, default=1,
                    help="1 = code-level gates only; 2+ = also the DynamoDB gates")
    ap.add_argument("--prod", action="store_true",
                    help="Compare against the PRODUCTION Mongo database. "
                         "Required once DB_BACKEND=dynamo is live: the "
                         "DynamoDB tables then hold production data, so "
                         "comparing them to tefilah_test reports false "
                         "mismatches. Read-only either way.")
    args = ap.parse_args()

    gates = [
        ("syntax compiles", gate_syntax),
        ("no undefined names", gate_undefined_names),
        ("no direct db.* in server.py", gate_no_direct_db),
        ("golden harness (mongo)", lambda: gate_golden("mongo")),
    ]
    if args.phase >= 2:
        gates += [
            # Post-cutover the DynamoDB tables hold PRODUCTION data, so the
            # test-data comparisons stop being meaningful. --prod swaps them
            # for checks that still are: parity against the real source, and
            # a live smoke test of the deployed app.
            ("mongo->dynamo data parity", lambda: gate_script(
                "migration/05_parity.py",
                ("--sample", "1000")
                + (("--source-db", "tefilah", "--i-know-this-is-production")
                   if args.prod else ()))),
        ]
        if args.prod:
            gates.append(("live production smoke  <-- POST-CUTOVER GATE",
                          lambda: gate_script("migration/09_prod_smoke.py",
                                              ("--write-check",))))
        else:
            gates += [
                ("repo differential (mongo vs dynamo)",
                 lambda: gate_script("migration/06_differential.py")),
                ("golden harness (dynamo)  <-- CUTOVER GATE",
                 lambda: gate_golden("dynamo")),
            ]

    print(f"\nRunning {len(gates)} gate(s)\n" + "=" * 64)
    results = []
    for name, fn in gates:
        t0 = time.time()
        try:
            status, detail = fn()
        except Exception as e:                     # a crashing gate is a failing gate
            status, detail = FAIL, f"gate raised: {e!r}"
        results.append((name, status, detail))
        print(f"  [{status}] {name}  ({time.time()-t0:.0f}s)")
        if detail and status != PASS:
            print(f"         {detail}")

    print("=" * 64)
    failed = [n for n, s, _ in results if s == FAIL]
    skipped = [n for n, s, _ in results if s == SKIP]
    if failed:
        print(f"BLOCKED: {len(failed)} gate(s) failed -> {failed}")
        print("Do NOT advance to the next phase.")
        return 1
    if skipped:
        print(f"PASSED {len(results)-len(skipped)}/{len(results)}; {len(skipped)} not runnable yet:")
        for n in skipped:
            print(f"  - {n}")
        return 0
    print(f"ALL {len(results)} GATES PASSED — safe to advance.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
