# Production cutover runbook — MongoDB → DynamoDB

Status as of 2026-09-06: **everything below is UNEXECUTED.** All verification so
far ran against `tefilah_test`. Production is untouched.

## The ordering constraint that matters most

Production currently runs `v33-security-hardening-20260720-230031` (2026-07-20).
**That code has no `repo/` layer and never reads `DB_BACKEND`.** Setting
`DB_BACKEND=dynamo` on the live environment today would do nothing at all.

So the order is forced:

```
deploy code (still on mongo)  ->  backfill prod data  ->  flip DB_BACKEND
```

Flipping the variable before deploying is a no-op; backfilling long before
flipping just lets the copy drift.

## Unverified precondition — resolve before step 1

Local HEAD has **11 commits dated 2026-07-20**; EB version v33 was created the
same evening (17:30 UTC / 23:00 IST), so it probably contains them. This could
not be confirmed remotely: `/api/health` and `/api/` deliberately expose no
version banner (a deliberate anti-fingerprinting fix), and there is no other
safe probe.

**Consequence:** a deploy ships those 11 commits *plus* the migration work. The
golden harness proves the migration is behaviour-preserving *relative to local
HEAD* — it says nothing about local HEAD vs. what is actually running.

Whoever ran the v33 deploy should confirm it was built from `2fc3653`. If it was
not, treat the deploy as shipping unreviewed backend changes and diff them first.

## Step 0 — gates must be green

```bash
cd backend
AVATAR_S3_PREFIX=migration-test/avatars/ ./.venv/Scripts/python.exe migration/verify_all.py --phase 2
```

Must print `ALL 7 GATES PASSED`. Do not continue otherwise.

## Step 1 — legacy avatar to S3

The prod `avatars/` prefix is EMPTY and the affected user's `profile_photo_url`
points at a `.png` that does not exist (**already broken today** — pre-existing,
not caused by this migration). Fetching it returns 200 only because CloudFront
serves the SPA fallback.

```bash
./.venv/Scripts/python.exe migration/07_avatars_to_s3.py \
    --apply --s3-prefix "" --source-db tefilah --i-know-this-is-production
```

Non-destructive: writes one new object to an empty prefix, never deletes the
Mongo row. Verifies sha256 after upload and carries the original `updated_at`
across as S3 object metadata.

Then set that user's `profile_photo_url` to the URL the script prints.

**Rollback:** `aws s3 rm <key>`. The Mongo blob is still the source of truth
until DB_BACKEND flips.

## Step 2 — deploy the code (still on Mongo)

`DB_BACKEND` stays unset. The app keeps using MongoDB; this only ships the
repository layer, which the golden harness proved behaviour-identical.

Verify after deploy, before going further:
- `/api/health` returns 200
- sign in as a user, a partner and an admin
- partner dashboard buckets (New / Assigned / Overdue) show expected counts
- submit a prayer, mark one prayed

**Rollback:** redeploy v33 from the EB console. This is the ONLY step that
changes live behaviour while still on Mongo, so soak it before step 3.

## Step 3 — backfill production data

`tefillah_*` currently holds **test** data. It must be replaced with production
data, as late as possible before the flip to minimise drift.

```bash
./.venv/Scripts/python.exe migration/04_backfill.py \
    --source-db tefilah --i-know-this-is-production
./.venv/Scripts/python.exe migration/05_parity.py --sample 1000 \
    --source-db tefilah --i-know-this-is-production
```

Parity must exit 0. Mongo access is read-only throughout.

**Quiesce writes first if possible.** Parity compares a moving source otherwise,
and mutable fields will produce false mismatches (this already happened once in
testing — see `HEARTBEAT_FIELDS` in `05_parity.py`).

**Rollback:** none needed — nothing reads these tables yet.

## Step 4 — the flip

```bash
aws elasticbeanstalk update-environment \
  --application-name tefillah-api --environment-name tefillah-api-prod-v2 \
  --option-settings Namespace=aws:elasticbeanstalk:application:environment,OptionName=DB_BACKEND,Value=dynamo
```

**Rollback — this is the whole point of the design:**

```bash
aws elasticbeanstalk update-environment \
  --application-name tefillah-api --environment-name tefillah-api-prod-v2 \
  --option-settings Namespace=aws:elasticbeanstalk:application:environment,OptionName=DB_BACKEND,Value=mongo
```

Mongo is untouched by the migration and stays a complete, current copy right up
to the flip, so reverting loses only writes made while on DynamoDB. **Keep
writing nothing to Mongo after the flip** — the two stores diverge from that
moment, and the longer you stay on DynamoDB the more a rollback costs.

## Accepted behaviour differences (verified, not guessed)

| difference | blast radius |
|---|---|
| `notifications.target_ids` absent | none — no caller reads it (grepped); `read_by` IS reconstructed |
| top-level `null` → attribute absent | none — every caller uses `.get()`; JSON exports omit the key |
| broadcast notifications expanded at write time | an account created *after* a broadcast never sees it |
| no unique index on email | a racing duplicate signup silently wins instead of returning 400 |
| `category_counts` tie order | cosmetic; neither backend guarantees it |

## Known gap

`_Repo._update` (users/partners/admins) does not split nulls, so
`repos.users.update(uid, {"status": None})` would raise a DynamoDB
`ValidationException` (`status` is a GSI key). **No current caller does this** —
latent, not live. One-line fix: route it through `_split_nulls`, as the three
newer repos already do.
