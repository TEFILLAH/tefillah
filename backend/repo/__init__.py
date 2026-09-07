"""
Data-access layer for Tefillah.

Every database call in server.py goes through here instead of touching Motor
collections directly. That gives us ONE swap point: today it's MongoDB, next
phase it's DynamoDB, chosen by the DB_BACKEND env var. Flipping that variable
is the cutover -- and flipping it back is the rollback.

Phase 1 migrates collections into this layer one at a time; anything not yet
migrated keeps using `db.<collection>` directly in server.py, so the refactor
is incremental and always shippable.
"""
import os

VALID_BACKENDS = ("mongo", "dynamo")


def get_backend_name() -> str:
    name = os.environ.get("DB_BACKEND", "mongo").strip().lower()
    if name not in VALID_BACKENDS:
        raise RuntimeError(
            f"DB_BACKEND={name!r} is not valid; expected one of {VALID_BACKENDS}"
        )
    return name


def make_repos(db=None):
    """Build the repository set for the configured backend.

    `db` is the Motor database handle (only used by the mongo backend).
    """
    name = get_backend_name()
    if name == "mongo":
        from .mongo import MongoRepos
        return MongoRepos(db)
    from .dynamo import DynamoRepos  # added in Phase 2
    return DynamoRepos()
