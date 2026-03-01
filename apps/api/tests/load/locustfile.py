"""
EventFlow Locust entrypoint — H2 / H3 validation load test.

Load shape
──────────
  Phase 1  0 s – 60 s    Ramp from 0 → 2 500 users at 41 users/s
  Phase 2  60 s – 360 s  Hold at 2 500 users for 5 minutes
  End      360 s          Test stops automatically

User mix (by weight)
─────────────────────
  ScanUser      weight 80 → ~2 000 VUs  Primary H2 target
  BrowseUser    weight 15 → ~  375 VUs  Background read traffic
  PurchaseUser  weight  5 → ~  125 VUs  Concurrent write pressure

Running
───────
  Headless (CI / report):
    locust -f locustfile.py --headless --users 2500 --spawn-rate 41 \
      --run-time 6m --html results/h2_report.html

  Interactive UI:
    locust -f locustfile.py
    # Open http://localhost:8089, set Users=2500 Spawn-rate=41

H2 passes if P99 latency of POST /checkin/scan ≤ 7 000 ms.
H3 passes if the 5xx error rate ≤ 0.5 %.

Both results are printed at test-end and saved to results/h2_report_{ts}.txt
by the events.quitting listener in users/scan_user.py.
"""

from locust import LoadTestShape

from users.browse_user import BrowseUser  # noqa: F401 — must be imported for Locust discovery
from users.purchase_user import PurchaseUser  # noqa: F401
from users.scan_user import ScanUser  # noqa: F401


class EventFlowLoadShape(LoadTestShape):
    """
    Two-phase ramp-and-hold curve.

    Each stage's 'duration' is a CUMULATIVE wall-clock threshold (seconds).
    The tick() method returns the target (users, spawn_rate) for the
    current phase, or None to signal test completion.

    Stage 1  duration= 60  Ramp  0 → 2 500  (41 VUs/s × 60 s ≈ 2 460 → 2 500)
    Stage 2  duration=360  Hold  2 500       (spawn_rate=0 = maintain count)
    """

    stages = [
        {"duration": 60,  "users": 2500, "spawn_rate": 41},
        {"duration": 360, "users": 2500, "spawn_rate": 0},
    ]

    def tick(self) -> tuple[int, float] | None:
        run_time = self.get_run_time()
        for stage in self.stages:
            if run_time < stage["duration"]:
                return stage["users"], stage["spawn_rate"]
        return None  # all stages exhausted — stop the test
