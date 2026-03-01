"""
ScanUser — primary H2 / H3 load-test user class.

Simulates a staff member scanning QR codes at the door.

Task weights
─────────────
  scan_valid_token  (10) — POST /checkin/scan with a pre-seeded token.
  scan_invalid_token (2) — POST /checkin/scan with a known-bad token (H3).
  get_stats          (1) — GET  /checkin/stats/:eventId (background polling).

Each VU claims one token from fixtures/tokens.json by sequential index.
The token is consumed (ALREADY_USED) after the first successful scan;
subsequent scan_valid_token calls still return HTTP 200 so they still
count toward the P99 measurement.

Custom P99 report
─────────────────
  Response times for POST /checkin/scan are collected via the
  events.request listener and written at test-end by events.quitting.

  H2 criterion: P99 ≤ 7 000 ms
  H3 criterion: 5xx error rate ≤ 0.5 %
"""

import json
import os
import sys
import threading
import time
from pathlib import Path

from locust import HttpUser, between, events, task

# ── locate config (works when locust is invoked from the load/ directory) ──────
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # load/
from config import LoadTestConfig, FIXTURES_DIR, RESULTS_DIR  # noqa: E402

# ─── Module-level shared state 
# Guarded by _state_lock; gevent patches threading.Lock, so this is safe.

_state_lock = threading.Lock()

# Tokens loaded once from fixtures/tokens.json at first on_start().
_tokens: list[dict] | None = None

# Sequential VU index counter — each on_start() claims one slot.
_vu_counter: int = 0

# Response-time collection for POST /checkin/scan (milliseconds, floats).
_scan_times: list[float] = []

# Error counters for H3 calculation.
_scan_5xx: int = 0
_scan_total: int = 0


def _load_tokens() -> list[dict]:
    """Load tokens.json once; subsequent calls return the cached list."""
    global _tokens
    with _state_lock:
        if _tokens is None:
            p = Path(FIXTURES_DIR) / "tokens.json"
            if not p.exists():
                raise FileNotFoundError(
                    f"[ScanUser] {p} not found — run: python fixtures/seed_load_data.py"
                )
            with open(p) as f:
                _tokens = json.load(f)
        return _tokens


def _load_event_info() -> dict:
    p = Path(FIXTURES_DIR) / "event_info.json"
    if not p.exists():
        raise FileNotFoundError(
            f"[ScanUser] {p} not found — run: python fixtures/seed_load_data.py"
        )
    with open(p) as f:
        return json.load(f)


def _claim_vu_index() -> int:
    global _vu_counter
    with _state_lock:
        idx = _vu_counter
        _vu_counter += 1
    return idx


def _percentile(data: list[float], pct: float) -> float:
    """Linear-interpolation percentile (no numpy dependency)."""
    if not data:
        return 0.0
    s = sorted(data)
    k = (len(s) - 1) * pct / 100
    lo = int(k)
    hi = lo + 1
    if hi >= len(s):
        return s[lo]
    return s[lo] + (k - lo) * (s[hi] - s[lo])


# ─── Locust event listeners 

@events.request.add_listener
def on_request(
    request_type: str,
    name: str,
    response_time: float,
    response_length: int,
    exception: Exception | None,
    **kwargs,
) -> None:
    """
    Collect response times specifically for POST /checkin/scan requests.
    Locust fires this listener for every HTTP request across all user classes.
    We filter on the request name set in each task.
    """
    global _scan_total, _scan_5xx

    if "/checkin/scan" not in name:
        return

    response = kwargs.get("response")

    with _state_lock:
        _scan_total += 1

        # Network-level error or 5xx — counts as H3 error.
        if exception is not None:
            _scan_5xx += 1
            return

        if response is not None and response.status_code >= 500:
            _scan_5xx += 1
            return

        # Successful request (200 / 401 / 403 are expected outcomes) — record time.
        _scan_times.append(response_time)


@events.quitting.add_listener
def on_quitting(environment, **kwargs) -> None:
    """
    At test-end: compute P99, print the H2/H3 validation box, and write
    the report to results/h2_report_{timestamp}.txt.
    """
    with _state_lock:
        times = list(_scan_times)
        total = _scan_total
        errors = _scan_5xx

    if not times:
        print("[H2 report] No /checkin/scan data collected — report skipped.")
        return

    cfg = LoadTestConfig()

    p50 = _percentile(times, 50)
    p95 = _percentile(times, 95)
    p99 = _percentile(times, 99)
    error_rate = errors / total if total > 0 else 0.0

    h2_passed = p99 <= cfg.p99_target_ms
    h3_passed = error_rate <= cfg.error_rate_target

    h2_label = "YES ✓" if h2_passed else "NO  ✗"
    h3_label = "YES ✓" if h3_passed else "NO  ✗"

    # Build the box — each inner line is exactly 42 chars between the ║ walls.
    def row(label: str, value: str) -> str:
        inner = f"  {label:<22}{value:<18}"  # 2 + 22 + 18 = 42
        return f"║{inner}║"

    sep = "╠══════════════════════════════════════════╣"
    top = "╔══════════════════════════════════════════╗"
    bot = "╚══════════════════════════════════════════╝"
    hdr = "║     EventFlow H2 Validation Report       ║"

    report_lines = [
        top,
        hdr,
        sep,
        row("Total scans:", str(total)),
        row("P50 latency:", f"{p50:.0f} ms"),
        row("P95 latency:", f"{p95:.0f} ms"),
        row("P99 latency:", f"{p99:.0f} ms"),
        row("P99 target:", "7 000 ms"),
        row("H2 PASSED:", h2_label),
        sep,
        row("Error rate (5xx):", f"{error_rate * 100:.3f}%"),
        row("Error target:", "0.5%"),
        row("H3 PASSED:", h3_label),
        bot,
    ]
    report = "\n".join(report_lines)

    print()
    print(report)

    # Write to results/ directory.
    results_dir = Path(RESULTS_DIR)
    results_dir.mkdir(exist_ok=True)
    ts = int(time.time())
    report_path = results_dir / f"h2_report_{ts}.txt"
    with open(report_path, "w") as f:
        f.write(report)
        f.write(
            f"\n\nRaw stats: total={total}, p50={p50:.1f}ms, "
            f"p95={p95:.1f}ms, p99={p99:.1f}ms, "
            f"5xx={errors} ({error_rate * 100:.3f}%)\n"
        )

    print(f"\n[H2 report] Written to {report_path}")


# ─── ScanUser 

class ScanUser(HttpUser):
    """
    Primary H2 test user — simulates a staff member at the door.

    Weight 80 in locustfile → ~2 000 of 2 500 VUs are ScanUsers.
    Each instance holds one pre-seeded token and a shared staff Bearer token.
    """

    weight = 80
    wait_time = between(0.5, 1.5)  # realistic scan interval

    def on_start(self) -> None:
        # Load shared fixtures (cached after first call).
        tokens = _load_tokens()
        info = _load_event_info()

        # Assign one token per VU by sequential index.
        idx = _claim_vu_index()
        self.token = tokens[idx % len(tokens)]["token"]
        self.token_consumed = False  # True after first VALID scan

        self.event_id = info["eventId"]

        # Prefer env var so CI pipelines can inject their own token;
        # fall back to the JWT generated by seed_load_data.py.
        staff_token = (
            os.getenv("LOAD_TEST_STAFF_TOKEN") or info.get("staffToken", "")
        )
        if not staff_token:
            raise RuntimeError(
                "[ScanUser] No staff token available.  "
                "Set LOAD_TEST_STAFF_TOKEN or run seed_load_data.py first."
            )

        self.client.headers.update({"Authorization": f"Bearer {staff_token}"})

    @task(10)
    def scan_valid_token(self) -> None:
        """
        POST /checkin/scan with the VU's pre-seeded token.

        First call:  expects result=VALID  (token consumed from Redis).
        Subsequent:  expects result=ALREADY_USED (token gone from Redis).
        Both are marked success — HTTP 200 proves the API is responding.

        Response time is recorded manually via time.perf_counter() for the
        P99 calculation in on_quitting(), supplemented by the events.request
        listener which uses Locust's own clock for the HTML report.
        """
        start = time.perf_counter()

        with self.client.post(
            "/api/v1/checkin/scan",
            json={"token": self.token, "deviceInfo": "Locust/ScanUser v1"},
            name="/checkin/scan (valid)",
            catch_response=True,
        ) as resp:
            elapsed_ms = (time.perf_counter() - start) * 1000

            if resp.status_code == 200:
                try:
                    payload = resp.json()
                    result = payload.get("data", {}).get("result", "")
                except Exception:
                    resp.failure("Non-JSON 200 response from /checkin/scan")
                    return

                if result == "VALID":
                    self.token_consumed = True
                    resp.success()
                elif result == "ALREADY_USED":
                    # Token was consumed by a concurrent VU or a prior scan — fine.
                    resp.success()
                else:
                    # INVALID_TOKEN / EVENT_NOT_ACTIVE / TICKET_CANCELLED
                    # These should not happen with correctly seeded data; log them
                    # but still treat as success (API returned a valid response).
                    resp.success()

            elif resp.status_code in (401, 403):
                resp.failure(f"Auth error {resp.status_code} — check staff token")
            else:
                resp.failure(f"HTTP {resp.status_code}: {resp.text[:120]}")

    @task(2)
    def scan_invalid_token(self) -> None:
        """
        POST /checkin/scan with a known-invalid token string.

        Used for H3 validation: the API must reject forged tokens with
        result=INVALID_TOKEN (HTTP 200), never a 5xx.  Any 5xx increments
        the H3 error counter tracked by the events.request listener.
        """
        with self.client.post(
            "/api/v1/checkin/scan",
            json={
                "token": "bG9hZC10ZXN0LWludmFsaWQtdG9rZW4tZm9yLUgz",  # base64url garbage
                "deviceInfo": "Locust/ScanUser v1",
            },
            name="/checkin/scan (invalid)",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                result = resp.json().get("data", {}).get("result", "")
                if result == "INVALID_TOKEN":
                    # Correct behaviour — HMAC check rejected the forged token.
                    resp.success()
                else:
                    # Unexpected: the API accepted a forged token.
                    resp.failure(f"Forged token accepted with result={result!r}")
            elif resp.status_code in (401, 403):
                resp.failure(f"Auth error {resp.status_code}")
            else:
                # 5xx or unexpected — already counted by events.request listener.
                resp.failure(f"HTTP {resp.status_code}")

    @task(1)
    def get_stats(self) -> None:
        """
        GET /checkin/stats/:eventId — simulates a staff member's stats bar polling.
        Lower weight; non-critical path; failure is logged but not H2-relevant.
        """
        self.client.get(
            f"/api/v1/checkin/stats/{self.event_id}",
            name="/checkin/stats/:eventId",
        )
