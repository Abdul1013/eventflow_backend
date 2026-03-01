"""
EventFlow load-test seed script.

Run BEFORE starting locust:
    python fixtures/seed_load_data.py

What it creates
───────────────
  Database
  ├── 1  Admin user    (loadtest_admin_{ts}@eventflow.test)
  ├── 1  Staff user    (loadtest_staff_{ts}@eventflow.test)
  ├── 1  Venue         (totalCapacity=3 000, layoutJson={})
  ├── 1  Event         (title="Load Test Event {ts}", status=ONGOING)
  ├── 1  TicketType    (quantityTotal=3 000, quantitySold=2 500)
  └── 2 500 Attendees + 2 500 Tickets (all ACTIVE, no seats)

  Redis
  └── 2 500 QR tokens  key="qr:{token}" → ticketId   TTL 24 h

  fixtures/
  ├── tokens.json       [{token, ticketId, userId}, ...]
  └── event_info.json   {eventId, ticketTypeId, venueId,
                         adminUserId, staffUserId,
                         staffToken, adminToken}

Re-run safety
─────────────
  If event_info.json already exists the script checks whether the eventId
  still exists in the DB.  If it does, it skips seeding and exits early.
"""

import asyncio
import base64
import hashlib
import hmac as hmaclib
import json
import os
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import asyncpg
import bcrypt
import jwt as pyjwt
import redis.asyncio as aioredis

# ── locate config 
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # load/ directory
from config import LoadTestConfig, FIXTURES_DIR  # noqa: E402

TOTAL_USERS = 2500
TICKET_TYPE_CAPACITY = 3000  # 2 500 seeded + 500 slots for PurchaseUser tests


# ─── QR token generator — must match apps/api/src/lib/qr.ts exactly 

def _compute_hmac(ticket_id: str, timestamp: str, secret: str) -> str:
    msg = f"{ticket_id}.{timestamp}".encode("utf-8")
    return hmaclib.new(secret.encode("utf-8"), msg, hashlib.sha256).hexdigest()


def generate_qr_token(ticket_id: str, secret: str) -> str:
    """
    Produces base64url(ticketId + '.' + timestamp_ms + '.' + hmac_hex).
    Padding is stripped to match Node's Buffer.from().toString('base64url').
    """
    timestamp = str(int(time.time() * 1000))
    h = _compute_hmac(ticket_id, timestamp, secret)
    raw = f"{ticket_id}.{timestamp}.{h}"
    return base64.urlsafe_b64encode(raw.encode("utf-8")).rstrip(b"=").decode("ascii")


# ─── JWT generator — must match apps/api/src/lib/jwt.ts 

def generate_jwt(user_id: str, role: str, secret: str, expires_hours: int = 24) -> str:
    """
    Signs a JWT with the same HS256 algorithm and {sub, role} payload used by
    the Node API.  24-hour expiry is sufficient for any single load-test run.
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=expires_hours)).timestamp()),
    }
    return pyjwt.encode(payload, secret, algorithm="HS256")


# ─── Helpers 

def _uid() -> str:
    return str(uuid.uuid4())


async def _event_exists(conn: asyncpg.Connection, event_id: str) -> bool:
    row = await conn.fetchrow('SELECT id FROM "Event" WHERE id = $1', event_id)
    return row is not None


# ─── Main 

async def seed() -> None:
    cfg = LoadTestConfig()

    if not cfg.hmac_secret:
        sys.exit("[seed] HMAC_SECRET env var is required")
    if not cfg.database_url:
        sys.exit("[seed] DATABASE_URL env var is required")
    if not cfg.jwt_access_secret:
        sys.exit("[seed] JWT_ACCESS_SECRET env var is required")

    tokens_path = Path(FIXTURES_DIR) / "tokens.json"
    event_info_path = Path(FIXTURES_DIR) / "event_info.json"

    # ── Re-run guard 
    if event_info_path.exists():
        with open(event_info_path) as f:
            existing = json.load(f)
        conn_check = await asyncpg.connect(dsn=cfg.database_url)
        try:
            if await _event_exists(conn_check, existing["eventId"]):
                print(
                    f"[seed] Event {existing['eventId']} already exists — "
                    "skipping seed.  Run cleanup.py first to reseed."
                )
                return
        finally:
            await conn_check.close()

    print("[seed] Connecting to PostgreSQL…")
    conn = await asyncpg.connect(dsn=cfg.database_url)

    print("[seed] Connecting to Redis…")
    rdb = await aioredis.from_url(cfg.redis_url, decode_responses=True)

    ts = int(time.time())
    now = datetime.now(timezone.utc)

    try:
        # ── Hash password once (bcrypt is slow; reuse across all 2 500 users) ─
        print("[seed] Hashing password…")
        pw_hash = bcrypt.hashpw(
            cfg.attendee_password.encode("utf-8"), bcrypt.gensalt(rounds=10)
        ).decode("utf-8")

        async with conn.transaction():

            # ── Admin user 
            admin_id = _uid()
            await conn.execute(
                """
                INSERT INTO "User"
                  (id, email, "passwordHash", name, role, "emailVerified",
                   "createdAt", "updatedAt")
                VALUES ($1, $2, $3, $4, CAST($5 AS "Role"), $6, $7, $7)
                """,
                admin_id,
                f"loadtest_admin_{ts}@eventflow.test",
                pw_hash,
                f"Load Test Admin {ts}",
                "ADMIN",
                True,
                now,
            )
            print(f"[seed] Created admin: loadtest_admin_{ts}@eventflow.test")

            # ── Staff user 
            staff_id = _uid()
            await conn.execute(
                """
                INSERT INTO "User"
                  (id, email, "passwordHash", name, role, "emailVerified",
                   "createdAt", "updatedAt")
                VALUES ($1, $2, $3, $4, CAST($5 AS "Role"), $6, $7, $7)
                """,
                staff_id,
                f"loadtest_staff_{ts}@eventflow.test",
                pw_hash,
                f"Load Test Staff {ts}",
                "STAFF",
                True,
                now,
            )
            print(f"[seed] Created staff: loadtest_staff_{ts}@eventflow.test")

            # ── Venue 
            venue_id = _uid()
            await conn.execute(
                """
                INSERT INTO "Venue"
                  (id, name, address, city, "totalCapacity", "layoutJson",
                   "createdAt", "updatedAt")
                VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
                """,
                venue_id,
                "Load Test Venue",
                "1 Locust Ave",
                "Lagos",
                TICKET_TYPE_CAPACITY,
                "{}",  # asyncpg accepts JSON string for Json columns
                now,
            )
            print(f"[seed] Created venue: {venue_id}")

            # ── Event (ONGOING — required for check-in) 
            event_id = _uid()
            await conn.execute(
                """
                INSERT INTO "Event"
                  (id, title, description, "organizerId", "venueId",
                   "startsAt", "endsAt", status, "createdAt", "updatedAt")
                VALUES ($1, $2, $3, $4, $5, $6, $7, CAST($8 AS "EventStatus"), $9, $9)
                """,
                event_id,
                f"Load Test Event {ts}",
                "Auto-generated event for H2/H3 load testing.",
                admin_id,
                venue_id,
                now - timedelta(hours=1),          # started 1 h ago
                now + timedelta(hours=5),           # ends in 5 h
                "ONGOING",
                now,
            )
            print(f"[seed] Created event: {event_id}")

            # ── TicketType 
            tt_id = _uid()
            await conn.execute(
                """
                INSERT INTO "TicketType"
                  (id, "eventId", name, price, "quantityTotal", "quantitySold",
                   "createdAt", "updatedAt")
                VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
                """,
                tt_id,
                event_id,
                "General",
                "1.00",           # Decimal as string — asyncpg casts to NUMERIC
                TICKET_TYPE_CAPACITY,
                TOTAL_USERS,      # pre-sold; leaves 500 slots for purchase tests
                now,
            )
            print(f"[seed] Created ticket type: {tt_id}")

            # ── Attendee users (bulk) 
            print(f"[seed] Creating {TOTAL_USERS} attendee users…")
            user_records = [
                (
                    _uid(),
                    f"loadtest_{i}@eventflow.test",
                    pw_hash,
                    f"Load Test Attendee {i}",
                    "ATTENDEE",
                    True,
                    now,
                )
                for i in range(TOTAL_USERS)
            ]
            await conn.executemany(
                """
                INSERT INTO "User"
                  (id, email, "passwordHash", name, role, "emailVerified",
                   "createdAt", "updatedAt")
                VALUES ($1, $2, $3, $4, CAST($5 AS "Role"), $6, $7, $7)
                """,
                user_records,
            )
            user_ids = [r[0] for r in user_records]
            print(f"[seed] Created {TOTAL_USERS} attendee users.")

            # ── Tickets + QR tokens (bulk) 
            print(f"[seed] Generating {TOTAL_USERS} QR tokens…")
            ticket_records = []
            token_docs = []

            for i, user_id in enumerate(user_ids):
                ticket_id = _uid()
                token = generate_qr_token(ticket_id, cfg.hmac_secret)
                ticket_records.append(
                    (ticket_id, user_id, event_id, tt_id, token, "ACTIVE", now)
                )
                token_docs.append(
                    {"token": token, "ticketId": ticket_id, "userId": user_id}
                )

                if (i + 1) % 500 == 0:
                    print(f"[seed]   {i + 1}/{TOTAL_USERS} tokens generated…")

            await conn.executemany(
                """
                INSERT INTO "Ticket"
                  (id, "userId", "eventId", "ticketTypeId",
                   "qrToken", status, "issuedAt")
                VALUES ($1, $2, $3, $4, $5, CAST($6 AS "TicketStatus"), $7)
                """,
                ticket_records,
            )
            print(f"[seed] Inserted {TOTAL_USERS} tickets.")

        # ── Seed Redis (pipeline for speed) 
        print("[seed] Seeding Redis…")
        BATCH = 500
        for start in range(0, len(token_docs), BATCH):
            batch = token_docs[start : start + BATCH]
            async with rdb.pipeline(transaction=False) as pipe:
                for doc in batch:
                    await pipe.set(
                        f"qr:{doc['token']}", doc["ticketId"], ex=86_400
                    )
                await pipe.execute()
            print(f"[seed]   Redis: {min(start + BATCH, TOTAL_USERS)}/{TOTAL_USERS}")

        # ── Generate JWTs 
        staff_token = generate_jwt(staff_id, "STAFF", cfg.jwt_access_secret)
        admin_token = generate_jwt(admin_id, "ADMIN", cfg.jwt_access_secret)

        # ── Write fixture files 
        Path(FIXTURES_DIR).mkdir(exist_ok=True)

        with open(tokens_path, "w") as f:
            json.dump(token_docs, f)
        print(f"[seed] Wrote {tokens_path}")

        event_info = {
            "eventId": event_id,
            "ticketTypeId": tt_id,
            "venueId": venue_id,
            "adminUserId": admin_id,
            "staffUserId": staff_id,
            "staffToken": staff_token,
            "adminToken": admin_token,
            "seededAt": ts,
        }
        with open(event_info_path, "w") as f:
            json.dump(event_info, f, indent=2)
        print(f"[seed] Wrote {event_info_path}")

        print()
        print("─" * 50)
        print("Seed complete.")
        print(f"  Event ID     : {event_id}")
        print(f"  Ticket type  : {tt_id}")
        print(f"  Tokens seeded: {TOTAL_USERS}")
        print()
        print("Set this env var (or it will be read from event_info.json):")
        print(f"  LOAD_TEST_STAFF_TOKEN={staff_token[:40]}…")
        print("─" * 50)

    finally:
        await conn.close()
        await rdb.aclose()


if __name__ == "__main__":
    asyncio.run(seed())
