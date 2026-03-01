"""
PurchaseUser — simulates concurrent ticket purchases under load.

Weight 5 → ~125 of 2 500 VUs.  Lowest weight because purchases are far
less frequent than scans in real-world event operations.

Lifecycle
─────────
  on_start: Login as loadtest_{vu_index}@eventflow.test / LoadTest1!
            Store access token; add Authorization header to all subsequent
            requests from this VU instance.

  purchase_ticket:
    POST /api/v1/tickets — buy a ticket for the load-test event.
    The seeded ticket type starts with quantitySold=2 500 and
    quantityTotal=3 000, leaving 500 slots.  Once exhausted the endpoint
    returns 409 NO_SEATS_AVAILABLE, which is marked success (expected
    business behaviour, not a server error).

    Only 5xx responses are counted as failures so as not to inflate the
    H3 error rate with expected inventory-exhaustion 409s.
"""

import itertools
import json
import sys
import threading
from pathlib import Path

from locust import HttpUser, between, task

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # load/
from config import LoadTestConfig, FIXTURES_DIR  # noqa: E402

# ── Sequential VU index so each PurchaseUser logs in as a different attendee ──
_vu_lock = threading.Lock()
_vu_iter = itertools.count(0)


def _next_vu() -> int:
    with _vu_lock:
        return next(_vu_iter)


def _load_event_info() -> dict:
    p = Path(FIXTURES_DIR) / "event_info.json"
    if not p.exists():
        raise FileNotFoundError(
            f"[PurchaseUser] {p} not found — run: python fixtures/seed_load_data.py"
        )
    with open(p) as f:
        return json.load(f)


class PurchaseUser(HttpUser):
    """
    Simulates attendees purchasing tickets concurrently with the scan load.
    Tests the atomicity of the Prisma ticket-inventory transaction under
    real concurrent write pressure.
    """

    weight = 5
    wait_time = between(2, 5)

    def on_start(self) -> None:
        cfg = LoadTestConfig()
        info = _load_event_info()

        self.event_id = info["eventId"]
        self.ticket_type_id = info["ticketTypeId"]
        self.auth_token: str | None = None

        # Assign this VU a unique attendee index so each VU logs in as a
        # different user.  Index wraps around total_tokens if more VUs than users.
        vu_index = _next_vu() % cfg.total_tokens
        email = f"loadtest_{vu_index}@eventflow.test"

        resp = self.client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": cfg.attendee_password},
            name="/auth/login (purchase setup)",
        )

        if resp.status_code == 200:
            try:
                self.auth_token = resp.json()["data"]["accessToken"]
                self.client.headers.update(
                    {"Authorization": f"Bearer {self.auth_token}"}
                )
            except (KeyError, ValueError):
                # Malformed response — VU will no-op on every task.
                self.auth_token = None
        else:
            # Login failed (wrong password, unverified email, etc.).
            # Mark the VU as inactive rather than stopping the whole test.
            self.auth_token = None

    @task
    def purchase_ticket(self) -> None:
        """
        POST /api/v1/tickets to buy a ticket for the load-test event.

        Expected outcomes:
          201 / 200 — Success.  Ticket issued, quantitySold incremented.
          409        — Sold out or duplicate.  Correct behaviour; not a failure.
          401        — Auth problem.  Counted as failure.
          5xx        — Server error.  Counted as failure (raises H3 concern).
        """
        if not self.auth_token:
            return  # VU failed to login — skip silently

        with self.client.post(
            "/api/v1/tickets",
            json={
                "eventId": self.event_id,
                "ticketTypeId": self.ticket_type_id,
            },
            name="/tickets (purchase)",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 201):
                resp.success()
            elif resp.status_code == 409:
                # Sold out (NO_SEATS_AVAILABLE) or duplicate ticket.
                # Both are valid business outcomes — not infrastructure failures.
                resp.success()
            elif resp.status_code == 401:
                resp.failure("Unauthorized — auth token expired or invalid")
            elif resp.status_code >= 500:
                resp.failure(f"Server error {resp.status_code}: {resp.text[:120]}")
            else:
                # 400 / 422 validation error — shouldn't happen with seeded data.
                resp.failure(f"Unexpected {resp.status_code}: {resp.text[:120]}")
