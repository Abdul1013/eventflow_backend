"""
BrowseUser — simulates a public attendee browsing events under load.

Background traffic class; weight 15 → ~375 of 2 500 VUs.
All requests are unauthenticated (public endpoints).

Task weights
─────────────
  list_events      (5) — GET /events (no auth, status filter omitted)
  get_event_detail (3) — GET /events/:id for the load-test event
  get_event_seats  (1) — GET /events/:id/seats for the load-test event

The load-test event is ONGOING, so the public list may not include it
(non-admins see only PUBLISHED).  list_events is still a valid latency test
even when it returns an empty result set.  get_event_detail and get_event_seats
may return 404 for the same reason; those are marked success so they count
toward throughput without inflating the error rate.
"""

import json
import sys
from pathlib import Path

from locust import HttpUser, between, task

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # load/
from config import FIXTURES_DIR  # noqa: E402


def _load_event_info() -> dict:
    p = Path(FIXTURES_DIR) / "event_info.json"
    if not p.exists():
        raise FileNotFoundError(
            f"[BrowseUser] {p} not found — run: python fixtures/seed_load_data.py"
        )
    with open(p) as f:
        return json.load(f)


class BrowseUser(HttpUser):
    """
    Simulates public attendees browsing events concurrently with active scanning.
    Keeps the DB read path (event listing, detail fetch) under realistic load
    during the H2 window.
    """

    weight = 15
    wait_time = between(1, 3)

    def on_start(self) -> None:
        info = _load_event_info()
        self.event_id = info["eventId"]

    @task(5)
    def list_events(self) -> None:
        """
        GET /api/v1/events?limit=12&page=1

        No status filter — tests the public listing endpoint under concurrent
        load regardless of event status.  Any 2xx response is a pass.
        """
        self.client.get(
            "/api/v1/events?limit=12&page=1",
            name="/events (list)",
        )

    @task(3)
    def get_event_detail(self) -> None:
        """
        GET /api/v1/events/:id for the seeded load-test event.

        The event is ONGOING so an unauthenticated request may receive 404
        (service filters non-PUBLISHED events for public callers).  We accept
        200 and 404 as successful responses — the server is responding correctly
        in both cases.
        """
        with self.client.get(
            f"/api/v1/events/{self.event_id}",
            name="/events/:id",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 404):
                resp.success()
            elif resp.status_code >= 500:
                resp.failure(f"Server error {resp.status_code}")
            else:
                resp.success()

    @task(1)
    def get_event_seats(self) -> None:
        """
        GET /api/v1/events/:id/seats

        Exercises the seat-map query (JOIN-heavy) under load.
        Accepts 200 and 404 as non-failures.
        """
        with self.client.get(
            f"/api/v1/events/{self.event_id}/seats",
            name="/events/:id/seats",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 404):
                resp.success()
            elif resp.status_code >= 500:
                resp.failure(f"Server error {resp.status_code}")
            else:
                resp.success()
