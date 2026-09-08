"""
MongoDB implementation of the repository layer.

Each method is a faithful, behaviour-identical extraction of a query that used
to be inline in server.py. Deliberately boring: named methods that do exactly
one known thing, rather than a generic Mongo-query emulator. When the DynamoDB
implementation lands it mirrors these method names exactly.

Collections are migrated into this file incrementally (smallest first), and the
golden-snapshot harness (migration/02_golden.py) must report IDENTICAL after
each one.
"""
from datetime import datetime, timezone


class _DailyCounts:
    """Shared 'group rows into daily buckets' analytics.

    users, partners and prayer_requests all ran the identical pipeline shape
    ($match a date range -> $group by $dateToString -> $sort). One method covers
    all of them, and it maps directly onto the DynamoDB `counters` table
    (e.g. users_daily#2026-09-06), turning a scan into a small range read.
    """

    async def daily_counts(self, date_field: str, start, end=None, fmt: str = "%Y-%m-%d"):
        """[{_id: 'YYYY-MM-DD', count: n}] ascending by date."""
        window = {"$gte": start}
        if end is not None:
            window["$lte"] = end
        return await self._c.aggregate([
            {"$match": {date_field: window}},
            {"$group": {
                "_id": {"$dateToString": {"format": fmt, "date": f"${date_field}"}},
                "count": {"$sum": 1},
            }},
            {"$sort": {"_id": 1}},
        ]).to_list(100)


# Fields never exposed through admin lists/exports.
# apple_refresh_token is a live Apple credential kept only so account deletion can
# revoke it — it must not ride along in an admin list or a CSV export.
_USER_SECRETS = {"password_hash": 0, "verification_code": 0, "apple_refresh_token": 0}


class _AccountRepo(_DailyCounts):
    """Shared surface for the three account types (users / partners / admins).

    The verification, forgot-password and reset-password flows treat these
    interchangeably -- they pick a collection at runtime and then operate on it
    generically ("find this email across all account types, then update it").
    Inheriting one base guarantees the three repos really ARE substitutable;
    without it a missing method would only blow up at runtime, in an auth flow.
    """

    def __init__(self, db, collection_name: str):
        self._c = db[collection_name]

    async def get(self, doc_id: str):
        return await self._c.find_one({"_id": doc_id})

    async def get_by_email(self, email: str):
        return await self._c.find_one({"email": email})

    async def get_by_email_with_reset_code(self, email: str):
        """Account on this email that currently holds a live reset code."""
        return await self._c.find_one({"email": email, "password_reset_code": {"$exists": True}})

    async def email_taken_by_other(self, email: str, exclude_id: str) -> bool:
        return await self._c.find_one({"email": email, "_id": {"$ne": exclude_id}}) is not None

    async def insert(self, doc: dict) -> None:
        await self._c.insert_one(doc)

    @staticmethod
    def _build_update(set_fields, unset_fields, inc_fields, add_to_set):
        update = {}
        if set_fields:
            update["$set"] = set_fields
        if unset_fields:
            update["$unset"] = unset_fields
        if inc_fields:
            update["$inc"] = inc_fields
        if add_to_set:
            update["$addToSet"] = add_to_set
        return update

    async def update(self, doc_id: str, set_fields: dict = None, unset_fields: dict = None,
                     inc_fields: dict = None, add_to_set: dict = None) -> int:
        """Returns matched_count -- callers branch on it to report success."""
        update = self._build_update(set_fields, unset_fields, inc_fields, add_to_set)
        if not update:
            return 0
        res = await self._c.update_one({"_id": doc_id}, update)
        return res.matched_count

    async def update_by_email(self, email: str, set_fields: dict = None,
                              unset_fields: dict = None) -> int:
        """Update the account matching an email (password reset syncs by email)."""
        update = self._build_update(set_fields, unset_fields, None, None)
        if not update:
            return 0
        res = await self._c.update_one({"email": email}, update)
        return res.matched_count

    async def delete(self, doc_id: str) -> int:
        res = await self._c.delete_one({"_id": doc_id})
        return res.deleted_count

    async def fcm_tokens_for_ids(self, ids):
        """Device tokens for a specific set of account ids (targeted push)."""
        docs = await self._c.find(
            {"_id": {"$in": list(ids)}, "fcm_token": {"$exists": True, "$ne": None}},
            {"fcm_token": 1},
        ).to_list(None)
        return [d["fcm_token"] for d in docs]

    async def email_name_for_ids(self, ids):
        """(email, name) for a specific set of account ids (targeted email)."""
        return await self._c.find(
            {"_id": {"$in": list(ids)}}, {"email": 1, "name": 1}
        ).to_list(None)


class AvatarRepo:
    """Legacy avatar blobs. New uploads go straight to S3; this only serves the
    back-compat read path and cleanup, so it stays tiny."""

    def __init__(self, db):
        self._c = db.avatars

    async def get(self, owner_id: str):
        """The stored avatar doc, or None. Doc shape: {_id, data, content_type}."""
        return await self._c.find_one({"_id": owner_id})

    async def delete(self, owner_id: str) -> None:
        await self._c.delete_one({"_id": owner_id})


class ActivityLogRepo:
    """Append-only admin audit trail."""

    def __init__(self, db):
        self._c = db.activity_logs

    async def insert(self, entry: dict) -> None:
        await self._c.insert_one(entry)

    async def list(self, *, action=None, actor_type=None, skip: int = 0, limit: int = 50):
        """(total, docs) newest-first. Filters are explicit, not a raw query dict,
        so the DynamoDB implementation can map them to keys."""
        query = {}
        if action:
            query["action"] = action
        if actor_type:
            query["actor_type"] = actor_type
        total = await self._c.count_documents(query)
        docs = await self._c.find(query).sort("timestamp", -1).skip(skip).limit(limit).to_list(limit)
        return total, docs

    async def export(self, limit: int = 10000):
        return await self._c.find({}).sort("timestamp", -1).limit(limit).to_list(limit)

    async def ensure_indexes(self) -> None:
        await self._c.create_index("timestamp")


class LLMLogRepo:
    """Append-only LLM usage log; also backs the token/usage analytics."""

    def __init__(self, db):
        self._c = db.llm_logs

    async def insert(self, entry: dict) -> None:
        await self._c.insert_one(entry)

    async def count_all(self) -> int:
        return await self._c.count_documents({})

    async def total_tokens(self) -> int:
        """Sum of total_tokens across every log. Becomes an O(1) counter read
        under DynamoDB instead of a full aggregation."""
        rows = await self._c.aggregate(
            [{"$group": {"_id": None, "total": {"$sum": "$total_tokens"}}}]
        ).to_list(1)
        return rows[0]["total"] if rows else 0

    async def daily_usage(self, start_date, group_format: str):
        """[{_id: 'YYYY-MM-DD', requests: n, tokens: n}] ascending by date."""
        return await self._c.aggregate([
            {"$match": {"timestamp": {"$gte": start_date}}},
            {"$group": {
                "_id": {"$dateToString": {"format": group_format, "date": "$timestamp"}},
                "requests": {"$sum": 1},
                "tokens": {"$sum": "$total_tokens"},
            }},
            {"$sort": {"_id": 1}},
        ]).to_list(100)

    async def list(self, *, status=None, skip: int = 0, limit: int = 50):
        query = {}
        if status:
            query["status"] = status
        total = await self._c.count_documents(query)
        docs = await self._c.find(query).sort("timestamp", -1).skip(skip).limit(limit).to_list(limit)
        return total, docs

    async def export(self, limit: int = 10000):
        # NOTE: intentionally unsorted -- matches the original export query.
        return await self._c.find({}).to_list(limit)

    async def ensure_indexes(self) -> None:
        await self._c.create_index("timestamp")


class AdminRepo(_AccountRepo):
    """Admin accounts. Small table, all access is by id or email."""

    def __init__(self, db):
        super().__init__(db, "admins")

    async def any_exists(self) -> bool:
        """True if ANY admin row exists -- gates the one-time bootstrap."""
        return await self._c.find_one({}) is not None

    async def list_without_secrets(self):
        """All admins with password_hash projected out."""
        return await self._c.find({}, {"password_hash": 0}).to_list(None)

    async def ensure_indexes(self) -> None:
        await self._c.create_index("email", unique=True)


class UserRepo(_AccountRepo):
    def __init__(self, db):
        super().__init__(db, "users")

    async def exists(self, user_id: str) -> bool:
        return await self._c.find_one({"_id": user_id}, {"_id": 1}) is not None

    # ---- counts ---------------------------------------------------------------
    async def count(self, *, status=None, status_ne=None,
                    last_login_since=None, created_since=None) -> int:
        query = {}
        if status is not None:
            query["status"] = status
        if status_ne is not None:
            query["status"] = {"$ne": status_ne}
        if last_login_since is not None:
            query["last_login"] = {"$gte": last_login_since}
        if created_since is not None:
            query["created_at"] = {"$gte": created_since}
        return await self._c.count_documents(query)

    # ---- listing / export -----------------------------------------------------
    async def list(self, *, search=None, status=None, skip: int = 0, limit: int = 20):
        """(total, docs) newest-first, secrets projected out."""
        import re as _re
        query = {}
        if search:
            query["$or"] = [
                {"name": {"$regex": _re.escape(search), "$options": "i"}},
                {"email": {"$regex": _re.escape(search), "$options": "i"}},
            ]
        if status:
            query["status"] = status
        total = await self._c.count_documents(query)
        docs = await (
            self._c.find(query, dict(_USER_SECRETS))
            .sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
        )
        return total, docs

    async def export_without_secrets(self, limit: int = 10000):
        return await self._c.find({}, dict(_USER_SECRETS)).to_list(limit)

    async def fcm_tokens(self):
        """Device tokens for push fan-out (only rows that actually have one)."""
        docs = await self._c.find(
            {"fcm_token": {"$exists": True, "$ne": None}}, {"fcm_token": 1}
        ).to_list(None)
        return [d["fcm_token"] for d in docs]

    async def all_email_name(self):
        return await self._c.find({}, {"email": 1, "name": 1}).to_list(None)

    async def ensure_indexes(self) -> None:
        await self._c.create_index("email", unique=True)
        await self._c.create_index("created_at")
        await self._c.create_index("last_login", sparse=True)
        await self._c.create_index("fcm_token", sparse=True)


class PartnerRepo(_AccountRepo):
    def __init__(self, db):
        super().__init__(db, "partners")

    # ---- counts ---------------------------------------------------------------
    async def count(self, *, status=None, is_active=None,
                    last_active_since=None, created_since=None) -> int:
        query = {}
        if status is not None:
            query["status"] = status
        if is_active is not None:
            query["is_active"] = is_active
        if last_active_since is not None:
            query["last_active"] = {"$gte": last_active_since}
        if created_since is not None:
            query["created_at"] = {"$gte": created_since}
        return await self._c.count_documents(query)

    # ---- listing / export -----------------------------------------------------
    async def list(self, *, search=None, status=None, partner_type=None,
                   skip: int = 0, limit: int = 20):
        import re as _re
        query = {}
        if search:
            query["$or"] = [
                {"name": {"$regex": _re.escape(search), "$options": "i"}},
                {"email": {"$regex": _re.escape(search), "$options": "i"}},
                {"organization": {"$regex": _re.escape(search), "$options": "i"}},
            ]
        if status:
            query["status"] = status
        if partner_type:
            query["partner_type"] = partner_type
        total = await self._c.count_documents(query)
        docs = await (
            self._c.find(query, dict(_USER_SECRETS))
            .sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
        )
        return total, docs

    async def for_assignment(self):
        """Active + verified partners with capacity info, for assignment dropdowns."""
        return await self._c.find(
            {"is_active": True, "is_verified": True},
            {"_id": 1, "name": 1, "email": 1, "prayer_capacity": 1,
             "location_city": 1, "location_country": 1, "cell_name": 1},
        ).sort("name", 1).to_list(None)

    async def export_without_secrets(self, limit: int = 10000):
        return await self._c.find({}, dict(_USER_SECRETS)).to_list(limit)

    async def fcm_tokens(self):
        docs = await self._c.find(
            {"fcm_token": {"$exists": True, "$ne": None}}, {"fcm_token": 1}
        ).to_list(None)
        return [d["fcm_token"] for d in docs]

    async def all_email_name(self):
        return await self._c.find({}, {"email": 1, "name": 1}).to_list(None)

    async def ensure_indexes(self) -> None:
        await self._c.create_index("email", unique=True)
        await self._c.create_index("created_at")
        await self._c.create_index("last_active", sparse=True)
        await self._c.create_index("fcm_token", sparse=True)


# Releasing a prayer back to the pending pool. Shared by the partner-delete,
# partner-disable, user-block and admin-unassign paths so they cannot drift.
_RELEASE_TO_POOL = {
    "assigned_partner_id": None, "assigned_partner_name": None,
    "assigned_cell_id": None, "assigned_cell_name": None,
    "status": "pending", "assigned_at": None, "seen_by_partner": False,
}
# Statuses that must NEVER be silently released: 'prayed' is done, and 'flagged'
# is reported content held out of circulation until an admin reviews it.
_NOT_RELEASABLE = {"$nin": ["prayed", "flagged"]}


class PrayerRequestRepo(_DailyCounts):
    """The hottest collection. Guarded writes are exposed as NAMED methods rather
    than a generic update(), because their query guards are what make them safe:
    mark_prayed's status check is what stops a double-tap double-counting stats,
    and the release paths' status guard is what stops reported content being
    recycled without review. A generic update() would invite dropping them."""

    def __init__(self, db):
        self._c = db.prayer_requests

    # ---- reads ---------------------------------------------------------------
    async def get(self, prayer_id: str):
        return await self._c.find_one({"_id": prayer_id})

    async def get_for_partner(self, prayer_id: str, partner_id: str, *,
                              exclude_prayed: bool = False, fields: dict = None):
        query = {"_id": prayer_id, "assigned_partner_id": partner_id}
        if exclude_prayed:
            query["status"] = {"$ne": "prayed"}
        return await self._c.find_one(query, fields)

    async def get_for_user(self, prayer_id: str, user_id: str):
        return await self._c.find_one({"_id": prayer_id, "user_id": user_id})

    async def last_answered_for_user(self, user_id: str):
        return await self._c.find_one(
            {"user_id": user_id, "status": {"$in": ["prayed", "completed"]},
             "prayed_at": {"$exists": True}},
            sort=[("prayed_at", -1)], projection={"prayed_at": 1},
        )

    # ---- counts --------------------------------------------------------------
    async def count(self, *, user_id=None, assigned_partner_id=None, status=None,
                    status_in=None, seen=None, seen_after=None, seen_before=None,
                    submitted_since=None) -> int:
        query = {}
        if user_id is not None:
            query["user_id"] = user_id
        if assigned_partner_id is not None:
            query["assigned_partner_id"] = assigned_partner_id
        if status is not None:
            query["status"] = status
        if status_in is not None:
            query["status"] = {"$in": list(status_in)}
        if seen is True:
            query["seen_by_partner"] = True
        elif seen is False:
            query["seen_by_partner"] = {"$ne": True}   # unset counts as unseen
        if seen_after is not None:
            query["seen_at"] = {"$gte": seen_after}
        if seen_before is not None:
            query["seen_at"] = {"$lt": seen_before}
        if submitted_since is not None:
            query["submitted_at"] = {"$gte": submitted_since}
        return await self._c.count_documents(query)

    # ---- analytics -----------------------------------------------------------
    async def avg_response_ms(self, partner_id: str) -> float:
        rows = await self._c.aggregate([
            {"$match": {"assigned_partner_id": partner_id, "status": "prayed",
                        "prayed_at": {"$exists": True}, "assigned_at": {"$exists": True}}},
            {"$project": {"response_time": {"$subtract": ["$prayed_at", "$assigned_at"]}}},
            {"$group": {"_id": None, "avg_time": {"$avg": "$response_time"}}},
        ]).to_list(1)
        return rows[0]["avg_time"] if rows and rows[0].get("avg_time") else 0

    async def daily_prayed_for_partner(self, partner_id: str, since):
        return await self._c.aggregate([
            {"$match": {"assigned_partner_id": partner_id, "prayed_at": {"$gte": since}}},
            {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$prayed_at"}},
                        "count": {"$sum": 1}}},
            {"$sort": {"_id": 1}},
        ]).to_list(None)

    async def daily_completed(self, start, end=None, fmt: str = "%Y-%m-%d"):
        """status=prayed, bucketed by prayed_at."""
        window = {"$gte": start}
        if end is not None:
            window["$lte"] = end
        return await self._c.aggregate([
            {"$match": {"status": "prayed", "prayed_at": window}},
            {"$group": {"_id": {"$dateToString": {"format": fmt, "date": "$prayed_at"}},
                        "count": {"$sum": 1}}},
            {"$sort": {"_id": 1}},
        ]).to_list(100)

    async def daily_assigned(self, start, end=None, fmt: str = "%Y-%m-%d"):
        window = {"$gte": start}
        if end is not None:
            window["$lte"] = end
        return await self._c.aggregate([
            {"$match": {"status": {"$in": ["assigned", "prayed"]}, "assigned_at": window}},
            {"$group": {"_id": {"$dateToString": {"format": fmt, "date": "$assigned_at"}},
                        "count": {"$sum": 1}}},
            {"$sort": {"_id": 1}},
        ]).to_list(100)

    async def completion_trend(self, start, fmt: str):
        """Answered-over-time. Prefers prayed_at, falls back to updated_at, so
        rows completed before prayed_at existed still appear."""
        return await self._c.aggregate([
            {"$match": {"status": {"$in": ["prayed", "completed"]}}},
            {"$addFields": {"_completed_at": {"$ifNull": ["$prayed_at", "$updated_at"]}}},
            {"$match": {"_completed_at": {"$gte": start}}},
            {"$group": {"_id": {"$dateToString": {"format": fmt, "date": "$_completed_at"}},
                        "count": {"$sum": 1}}},
            {"$sort": {"_id": 1}},
        ]).to_list(100)

    async def category_counts(self, limit: int = 10):
        return await self._c.aggregate([
            {"$match": {"category": {"$exists": True}}},
            {"$group": {"_id": "$category", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": limit},
        ]).to_list(limit)

    # ---- listing -------------------------------------------------------------
    async def list_for_partner(self, query: dict, *, fields: dict, skip: int, limit: int):
        return await (self._c.find(query, fields)
                      .sort("submitted_at", -1).skip(skip).limit(limit).to_list(limit))

    async def list_admin(self, *, status=None, category=None, search=None,
                         skip: int = 0, limit: int = 20):
        import re as _re
        query = {}
        if status:
            query["status"] = status
        if category:
            query["category"] = category
        if search:
            query["content"] = {"$regex": _re.escape(search), "$options": "i"}
        total = await self._c.count_documents(query)
        docs = await (self._c.find(query)
                      .sort("submitted_at", -1).skip(skip).limit(limit).to_list(limit))
        return total, docs

    async def list_for_user(self, user_id: str, *, skip: int = 0, limit: int = 20):
        return await (self._c.find({"user_id": user_id})
                      .sort("submitted_at", -1).skip(skip).limit(limit).to_list(limit))

    async def export(self, limit: int = 10000):
        return await self._c.find({}).to_list(limit)

    # ---- writes --------------------------------------------------------------
    async def insert(self, doc: dict) -> None:
        await self._c.insert_one(doc)

    async def update_fields(self, prayer_id: str, set_fields: dict = None,
                            unset_fields: dict = None) -> int:
        update = {}
        if set_fields:
            update["$set"] = set_fields
        if unset_fields:
            update["$unset"] = unset_fields
        if not update:
            return 0
        res = await self._c.update_one({"_id": prayer_id}, update)
        return res.matched_count

    async def mark_prayed(self, prayer_id: str, partner_id: str, duration_minutes) -> int:
        """Atomic transition to 'prayed'. Returns MODIFIED count (not matched):
        a concurrent double-tap or client retry must come back 0 so partner
        stats, the notification and the push each fire exactly once."""
        res = await self._c.update_one(
            {"_id": prayer_id, "assigned_partner_id": partner_id, "status": {"$ne": "prayed"}},
            {"$set": {"status": "prayed", "prayed_at": datetime.now(timezone.utc),
                      "prayer_duration_minutes": duration_minutes}},
        )
        return res.modified_count

    async def unassign(self, prayer_id: str) -> int:
        """Admin unassign. Status guard stops a prayer marked prayed mid-request
        from being reverted to pending (which would let it be prayed twice)."""
        res = await self._c.update_one(
            {"_id": prayer_id, "status": _NOT_RELEASABLE},
            {"$set": dict(_RELEASE_TO_POOL), "$unset": {"seen_at": ""}},
        )
        return res.matched_count

    async def bulk_unassign(self, prayer_id: str) -> int:
        """Bulk-unassign. NOTE: unlike unassign() this deliberately does NOT clear
        assigned_cell_id/assigned_cell_name -- preserved verbatim from the original
        so the refactor stays behaviour-identical. Looks like a pre-existing bug
        (bulk leaves stale cell info); worth fixing separately, not here."""
        res = await self._c.update_one(
            {"_id": prayer_id, "status": _NOT_RELEASABLE},
            {"$set": {"assigned_partner_id": None, "assigned_partner_name": None,
                      "status": "pending", "assigned_at": None, "seen_by_partner": False},
             "$unset": {"seen_at": ""}},
        )
        return res.matched_count

    async def assign_if_pending(self, prayer_id: str, set_fields: dict,
                                blocked=None) -> int:
        """Assign only while still pending, skipping users the partner blocked."""
        query = {"_id": prayer_id, "status": "pending"}
        if blocked:
            query["user_id"] = {"$nin": list(blocked)}
        res = await self._c.update_one(
            query, {"$set": set_fields, "$unset": {"seen_at": ""}})
        return res.matched_count

    async def release_partner(self, partner_id: str) -> None:
        """Free a partner's whole queue (delete/disable) back to the pool."""
        await self._c.update_many(
            {"assigned_partner_id": partner_id, "status": _NOT_RELEASABLE},
            {"$set": dict(_RELEASE_TO_POOL), "$unset": {"seen_at": ""}},
        )

    async def release_user_from_partner(self, partner_id: str, user_id: str) -> None:
        """Partner blocked a user: hand that user's requests back to the pool."""
        await self._c.update_many(
            {"assigned_partner_id": partner_id, "user_id": user_id, "status": _NOT_RELEASABLE},
            {"$set": dict(_RELEASE_TO_POOL), "$unset": {"seen_at": ""}},
        )

    async def anonymize_user(self, user_id: str) -> None:
        """Account deletion: strip the submitter's PII but keep the prayer text,
        which a partner may already be holding."""
        await self._c.update_many(
            {"user_id": user_id},
            {"$set": {"user_id": None, "user_name": None, "user_email": None,
                      "is_anonymous": True}},
        )

    async def delete(self, prayer_id: str) -> int:
        res = await self._c.delete_one({"_id": prayer_id})
        return res.deleted_count

    async def ensure_indexes(self) -> None:
        await self._c.create_index([("assigned_partner_id", 1), ("status", 1), ("submitted_at", -1)])
        await self._c.create_index([("status", 1), ("submitted_at", -1)])
        await self._c.create_index([("user_id", 1), ("submitted_at", -1)])
        await self._c.create_index("submitted_at")
        await self._c.create_index("prayed_at", sparse=True)
        await self._c.create_index("updated_at", sparse=True)


class NotificationRepo:
    """Recipient-centric notification access.

    Mongo stores ONE row per notification with target_ids[]/read_by[] arrays.
    DynamoDB cannot index list membership, so it stores one row PER RECIPIENT
    (the fan-out in migration/04_backfill.py). Every method here is therefore
    phrased as "for this recipient" rather than exposing the array query --
    that is what lets the same interface sit on top of both models.

    `audience` is "users" or "partners": a recipient sees broadcasts aimed at
    everyone, broadcasts aimed at their own audience, and anything addressed to
    them individually.
    """

    def __init__(self, db):
        self._c = db.notifications

    @staticmethod
    def _visible_to(recipient_id: str, audience: str) -> dict:
        return {"$or": [
            {"target_type": "all"},
            {"target_type": audience},
            {"target_ids": recipient_id},
        ]}

    def _query(self, recipient_id: str, audience: str, unread_only: bool) -> dict:
        query = self._visible_to(recipient_id, audience)
        if unread_only:
            query["read_by"] = {"$nin": [recipient_id]}
        return query

    async def insert(self, doc: dict) -> None:
        await self._c.insert_one(doc)

    async def set_message(self, notif_id: str, message: str) -> None:
        """Personalised text arrives after the row is created (background task)."""
        await self._c.update_one({"_id": notif_id}, {"$set": {"message": message}})

    async def list_for(self, recipient_id: str, audience: str, *, unread_only: bool = False,
                       skip: int = 0, limit: int = 50):
        return await (
            self._c.find(self._query(recipient_id, audience, unread_only))
            .sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
        )

    async def count_for(self, recipient_id: str, audience: str, *, unread_only: bool = False) -> int:
        return await self._c.count_documents(self._query(recipient_id, audience, unread_only))

    async def mark_read(self, notif_id: str, recipient_id: str, audience: str) -> int:
        """Returns matched_count. Scoped to what the recipient can actually see,
        so a known id cannot be marked read by someone it was never sent to."""
        query = {"_id": notif_id, **self._visible_to(recipient_id, audience)}
        res = await self._c.update_one(query, {"$addToSet": {"read_by": recipient_id}})
        return res.matched_count

    async def mark_all_read(self, recipient_id: str, audience: str) -> None:
        await self._c.update_many(
            self._query(recipient_id, audience, unread_only=True),
            {"$addToSet": {"read_by": recipient_id}},
        )

    async def detach_recipient(self, recipient_id: str) -> None:
        """Account deletion: drop them from targeting, then bin any specific
        notification left with no recipients at all."""
        await self._c.update_many({"target_ids": recipient_id},
                                  {"$pull": {"target_ids": recipient_id}})
        await self._c.delete_many({"target_type": "specific", "target_ids": []})

    async def ensure_indexes(self) -> None:
        await self._c.create_index("created_at")
        await self._c.create_index("target_ids")


class PrayerCellRepo:
    """Geographic prayer cells. Endpoints are live but the collection is empty
    in production, so this has no golden-harness coverage beyond an empty list."""

    def __init__(self, db):
        self._c = db.prayer_cells

    async def find_for_location(self, city: str, country: str):
        """First active cell whose city AND country match (case-insensitive)."""
        import re as _re
        return await self._c.find_one({
            "location_city": {"$regex": _re.escape(city), "$options": "i"},
            "location_country": {"$regex": _re.escape(country), "$options": "i"},
            "is_active": True,
        })

    async def get_by_name(self, name: str):
        return await self._c.find_one({"name": name})

    async def list_active(self):
        return await self._c.find({"is_active": True}).to_list(None)

    async def insert(self, doc: dict) -> None:
        await self._c.insert_one(doc)

    async def adjust_agent_count(self, cell_id: str, delta: int) -> None:
        """+1 when a partner joins a cell, -1 when they leave or are deleted."""
        await self._c.update_one({"_id": cell_id}, {"$inc": {"agent_count": delta}})


class MongoRepos:
    """Container holding one repo per collection. The DynamoDB version exposes
    the same attribute names, so server.py never changes at cutover."""

    backend = "mongo"

    def __init__(self, db):
        if db is None:
            raise RuntimeError("MongoRepos requires a Motor database handle")
        self._db = db
        self.avatars = AvatarRepo(db)
        self.activity_logs = ActivityLogRepo(db)
        self.llm_logs = LLMLogRepo(db)
        self.admins = AdminRepo(db)
        self.users = UserRepo(db)
        self.partners = PartnerRepo(db)
        self.prayer_cells = PrayerCellRepo(db)
        self.notifications = NotificationRepo(db)
        self.prayer_requests = PrayerRequestRepo(db)
