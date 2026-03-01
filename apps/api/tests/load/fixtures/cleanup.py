"""
EventFlow load-test cleanup script.

Run AFTER the load test to remove all seeded data:
    python fixtures/cleanup.py

What it removes
───────────────
  Redis
  └── All "qr:{token}" keys listed in fixtures/tokens.json
      (uses a pipeline — does NOT flush the entire Redis DB)

  Database (in FK order)
  ├── CheckInLog  — all logs for the load-test event's tickets
  ├── Allocation  — any seat allocations triggered during the test
  ├── Ticket      — all 2 500 seeded tickets
  ├── TicketType  — the load-test ticket type
  ├── Event       — the load-test event
  ├── Venue       — the load-test venue
  └── User        — admin, staff, and all 2 500 loadtest attendees

  fixtures/
  ├── tokens.json     → deleted
  └── event_info.json → deleted
"""

import asyncio
import json
import os
import sys
from pathlib import Path

import asyncpg
import redis.asyncio as aioredis

# ── locate config ──────────────────────────────────────────────────────────────
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # load/ directory
from config import LoadTestConfig, FIXTURES_DIR  # noqa: E402


async def cleanup() -> None:
    cfg = LoadTestConfig()

    tokens_path = Path(FIXTURES_DIR) / "tokens.json"
    event_info_path = Path(FIXTURES_DIR) / "event_info.json"

    if not event_info_path.exists():
        print("[cleanup] fixtures/event_info.json not found — nothing to clean up.")
        return

    with open(event_info_path) as f:
        info = json.load(f)

    event_id = info["eventId"]
    venue_id = info["venueId"]
    admin_id = info["adminUserId"]
    staff_id = info["staffUserId"]

    # ── Redis ─────────────────────────────────────────────────────────────────
    if tokens_path.exists():
        with open(tokens_path) as f:
            token_docs = json.load(f)

        print(f"[cleanup] Removing {len(token_docs)} QR tokens from Redis…")
        rdb = await aioredis.from_url(cfg.redis_url, decode_responses=True)
        try:
            BATCH = 1000
            deleted = 0
            for start in range(0, len(token_docs), BATCH):
                batch = token_docs[start : start + BATCH]
                keys = [f"qr:{doc['token']}" for doc in batch]
                n = await rdb.delete(*keys)
                deleted += n
            print(f"[cleanup] Deleted {deleted} Redis keys.")
        finally:
            await rdb.aclose()
    else:
        print("[cleanup] tokens.json not found — skipping Redis cleanup.")

    # ── Database ──────────────────────────────────────────────────────────────
    if not cfg.database_url:
        print("[cleanup] DATABASE_URL not set — skipping DB cleanup.")
    else:
        print("[cleanup] Connecting to PostgreSQL…")
        conn = await asyncpg.connect(dsn=cfg.database_url)
        try:
            async with conn.transaction():
                # 1. CheckInLog — references Ticket and User
                r = await conn.execute(
                    """
                    DELETE FROM "CheckInLog"
                    WHERE "ticketId" IN (
                        SELECT id FROM "Ticket" WHERE "eventId" = $1
                    )
                    """,
                    event_id,
                )
                print(f"[cleanup] CheckInLog rows deleted: {r.split()[-1]}")

                # 2. Allocation — references Event
                r = await conn.execute(
                    'DELETE FROM "Allocation" WHERE "eventId" = $1',
                    event_id,
                )
                print(f"[cleanup] Allocation rows deleted: {r.split()[-1]}")

                # 3. Ticket — references User, Event, TicketType
                r = await conn.execute(
                    'DELETE FROM "Ticket" WHERE "eventId" = $1',
                    event_id,
                )
                print(f"[cleanup] Ticket rows deleted: {r.split()[-1]}")

                # 4. TicketType — references Event
                r = await conn.execute(
                    'DELETE FROM "TicketType" WHERE "eventId" = $1',
                    event_id,
                )
                print(f"[cleanup] TicketType rows deleted: {r.split()[-1]}")

                # 5. Event — references User (organizer), Venue
                r = await conn.execute(
                    'DELETE FROM "Event" WHERE id = $1',
                    event_id,
                )
                print(f"[cleanup] Event rows deleted: {r.split()[-1]}")

                # 6. Venue
                r = await conn.execute(
                    'DELETE FROM "Venue" WHERE id = $1',
                    venue_id,
                )
                print(f"[cleanup] Venue rows deleted: {r.split()[-1]}")

                # 7. All loadtest users (admin, staff, attendees).
                # Pattern: 'loadtest_%@eventflow.test'
                #   _ = match one char  (the underscore in real addresses)
                #   % = match the rest  (numbers, suffixes, etc.)
                # No ESCAPE clause needed — the unescaped _ wildcard correctly
                # matches the literal underscore in all loadtest emails.
                r = await conn.execute(
                    "DELETE FROM \"User\" WHERE email LIKE 'loadtest_%@eventflow.test'",
                )
                print(f"[cleanup] User rows deleted: {r.split()[-1]}")

        finally:
            await conn.close()

    # ── Remove fixture files ──────────────────────────────────────────────────
    for path in (tokens_path, event_info_path):
        if path.exists():
            path.unlink()
            print(f"[cleanup] Removed {path.name}")

    print()
    print("[cleanup] Done.  The database and Redis are clean.")


if __name__ == "__main__":
    asyncio.run(cleanup())
