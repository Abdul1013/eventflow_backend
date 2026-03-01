"""
EventFlow — H3 Dedicated Error Rate Test
=========================================

Sends exactly 10 000 scan requests to POST /api/v1/checkin/scan and
measures whether forged HMAC tokens are correctly rejected without any
5xx responses.

Request breakdown
─────────────────
  9 900  valid pre-seeded tokens   (from fixtures/tokens.json, looped)
     50  forged tokens             (correct structure, wrong HMAC)
     50  duplicate tokens          (first 50 valid tokens re-submitted)
  ──────
  10 000  total

The 50 forged tokens are planted in Redis under their own key before the
test begins.  If the API skips HMAC verification and goes straight to a
Redis lookup, it would find those keys and incorrectly return VALID.
Correct behaviour: HMAC is verified *before* the Redis lookup, so the
server returns INVALID_TOKEN (HTTP 200) — never a 5xx crash.

Pass criteria (H3)
──────────────────
  5xx error rate ≤ 0.5 %
  HMAC false-positive rate = 0 %  (no forged token accepted)

Usage
─────
  python h3_error_rate.py

Environment variables (same as load test suite)
────────────────────────────────────────────────
  LOAD_TEST_API_URL    API base URL          (default http://localhost:3001)
  REDIS_URL            Redis connection URL  (default redis://localhost:6379)
  HMAC_SECRET          Must match running API  (required)
  LOAD_TEST_STAFF_TOKEN Override staff JWT    (falls back to event_info.json)
"""

import asyncio
import base64
import json
import os
import random
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import httpx
import redis.asyncio as aioredis

# ── Locate shared config (run from any directory) ────────────────────────────
sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import LoadTestConfig, FIXTURES_DIR, RESULTS_DIR  # noqa: E402

# ── Constants ─────────────────────────────────────────────────────────────────

CONCURRENCY    = 100      # max simultaneous HTTP requests
VALID_COUNT    = 9_900    # pre-seeded token requests
FORGED_COUNT   = 50       # wrong-HMAC token requests
DUPLICATE_COUNT = 50      # re-submitted (already-consumed) token requests
TOTAL_REQUESTS = VALID_COUNT + FORGED_COUNT + DUPLICATE_COUNT  # 10 000


# ── Result record ─────────────────────────────────────────────────────────────

@dataclass
class ScanResult:
    token_type:  str   # 'valid' | 'forged' | 'duplicate'
    http_status: int   # 0 = network error
    result_code: str   # VALID | ALREADY_USED | INVALID_TOKEN | ERROR
    is_5xx:      bool


# ── Token helpers ─────────────────────────────────────────────────────────────

def _generate_forged_token(ticket_id: str) -> str:
    """
    Build a base64url token with the correct three-part structure
    (ticketId.timestamp.hmac_hex) but an entirely wrong HMAC value.

    This mimics what a real token looks like so the API's parser doesn't
    reject it on format grounds — only the HMAC verification step should
    catch it.
    """
    timestamp   = str(int(time.time() * 1000))
    wrong_hmac  = "deadbeef" * 8  # 64 hex chars — looks like a SHA-256 digest
    raw         = f"{ticket_id}.{timestamp}.{wrong_hmac}"
    return base64.urlsafe_b64encode(raw.encode("utf-8")).rstrip(b"=").decode("ascii")


async def _plant_forged_tokens(
    redis_client: aioredis.Redis,
    forged_pairs: list[tuple[str, str]],
) -> None:
    """
    Write forged tokens into Redis under the same key namespace the API uses
    (qr:{token}) with the associated ticketId as the value.

    If the API incorrectly skips HMAC validation and goes straight to
    Redis, it would find these entries and issue a VALID response — exposing
    a critical security bug.  Correct behaviour is that HMAC is checked
    first, so these keys are never reached.
    """
    pipe = redis_client.pipeline()
    for token, ticket_id in forged_pairs:
        pipe.set(f"qr:{token}", ticket_id, ex=86_400)
    await pipe.execute()


async def _remove_forged_tokens(
    redis_client: aioredis.Redis,
    forged_pairs: list[tuple[str, str]],
) -> None:
    """Delete the planted forged keys — cleanup after the test."""
    pipe = redis_client.pipeline()
    for token, _ in forged_pairs:
        pipe.delete(f"qr:{token}")
    await pipe.execute()


# ── HTTP task ─────────────────────────────────────────────────────────────────

async def _send_scan(
    client:     httpx.AsyncClient,
    token:      str,
    token_type: str,
    semaphore:  asyncio.Semaphore,
) -> ScanResult:
    async with semaphore:
        try:
            resp = await client.post(
                "/api/v1/checkin/scan",
                json={"token": token, "deviceInfo": "H3Test/1.0"},
            )
        except Exception:
            return ScanResult(token_type, 0, "NETWORK_ERROR", True)

        if resp.status_code >= 500:
            return ScanResult(token_type, resp.status_code, "SERVER_ERROR", True)

        try:
            result_code = resp.json().get("data", {}).get("result", "UNKNOWN")
        except Exception:
            result_code = "PARSE_ERROR"

        return ScanResult(token_type, resp.status_code, result_code, False)


# ── Report helpers ────────────────────────────────────────────────────────────

def _row(label: str, value: str) -> str:
    inner = f"  {label:<26}{value:<16}"   # 2 + 26 + 16 = 44
    return f"║{inner}║"


_SEP = "╠════════════════════════════════════════════╣"
_TOP = "╔════════════════════════════════════════════╗"
_BOT = "╚════════════════════════════════════════════╝"
_HDR = "║      EventFlow H3 Security Report          ║"


def _build_report(
    *,
    total:          int,
    elapsed_s:      float,
    valid_accepted: int,
    valid_fn:       int,
    forged_tn:      int,
    forged_fp:      int,
    dup_already_used: int,
    dup_valid:      int,
    total_5xx:      int,
    error_rate:     float,
    h3_passed:      bool,
    security_ok:    bool,
) -> str:
    h3_label  = "YES ✓" if h3_passed  else "NO  ✗"
    sec_label = "OK  ✓" if security_ok else "BREACH ✗"

    lines = [
        _TOP,
        _HDR,
        _SEP,
        _row("Total requests:",    f"{total:,}"),
        _row("Duration:",          f"{elapsed_s:.1f} s"),
        _SEP,
        _row("Valid scans:",       f"{VALID_COUNT:,}"),
        _row("  Accepted:",        f"{valid_accepted:,}"),
        _row("  Rejected (FN):",   f"{valid_fn:,}"),
        _SEP,
        _row("Forged scans:",      f"{FORGED_COUNT:,}"),
        _row("  Rejected (TN):",   f"{forged_tn:,}"),
        _row("  Accepted (FP!):",  f"{forged_fp:,}"),
        _SEP,
        _row("Duplicate scans:",   f"{DUPLICATE_COUNT:,}"),
        _row("  Already-used:",    f"{dup_already_used:,}"),
        _row("  Accepted again:",  f"{dup_valid:,}"),
        _SEP,
        _row("5xx errors:",        f"{total_5xx} ({error_rate * 100:.3f}%)"),
        _row("Error target:",      "0.5%"),
        _row("HMAC security:",     sec_label),
        _row("H3 PASSED:",         h3_label),
        _BOT,
    ]
    return "\n".join(lines)


# ── Main ──────────────────────────────────────────────────────────────────────

async def main() -> None:
    cfg = LoadTestConfig()

    # ── Validate prerequisites ────────────────────────────────────────────────
    missing = []
    if not cfg.hmac_secret:
        missing.append("HMAC_SECRET")
    if missing:
        sys.exit(f"[H3] Missing required env vars: {', '.join(missing)}")

    tokens_path = Path(FIXTURES_DIR) / "tokens.json"
    info_path   = Path(FIXTURES_DIR) / "event_info.json"

    for p in (tokens_path, info_path):
        if not p.exists():
            sys.exit(
                f"[H3] {p.name} not found — run: python fixtures/seed_load_data.py"
            )

    raw_tokens: list[dict] = json.loads(tokens_path.read_text())
    event_info: dict       = json.loads(info_path.read_text())

    staff_token = (
        os.getenv("LOAD_TEST_STAFF_TOKEN")
        or event_info.get("staffToken", "")
    )
    if not staff_token:
        sys.exit(
            "[H3] No staff token — set LOAD_TEST_STAFF_TOKEN or re-run seed_load_data.py"
        )

    # ── Build request list ────────────────────────────────────────────────────
    # 9 900 valid tokens (loop over seeded set if fewer than 9 900)
    valid_tokens: list[str] = [
        raw_tokens[i % len(raw_tokens)]["token"]
        for i in range(VALID_COUNT)
    ]

    # 50 forged tokens — correct structure, wrong HMAC
    forged_pairs: list[tuple[str, str]] = [
        (
            _generate_forged_token(raw_tokens[i % len(raw_tokens)]["ticketId"]),
            raw_tokens[i % len(raw_tokens)]["ticketId"],
        )
        for i in range(FORGED_COUNT)
    ]
    forged_tokens: list[str] = [t for t, _ in forged_pairs]

    # 50 duplicate tokens — same as the first 50 valid tokens
    # One of the concurrent requests will get VALID; the re-send gets ALREADY_USED.
    duplicate_tokens: list[str] = [
        raw_tokens[i % len(raw_tokens)]["token"]
        for i in range(DUPLICATE_COUNT)
    ]

    all_requests: list[tuple[str, str]] = (
        [(t, "valid")     for t in valid_tokens]
        + [(t, "forged")  for t in forged_tokens]
        + [(t, "duplicate") for t in duplicate_tokens]
    )
    random.shuffle(all_requests)   # interleave types for realism

    # ── Plant forged tokens in Redis ──────────────────────────────────────────
    redis_client = await aioredis.from_url(cfg.redis_url, decode_responses=True)
    print(f"[H3] Planting {FORGED_COUNT} forged tokens in Redis …")
    await _plant_forged_tokens(redis_client, forged_pairs)

    # ── Fire all requests ─────────────────────────────────────────────────────
    print(
        f"[H3] Sending {TOTAL_REQUESTS:,} scan requests "
        f"(concurrency={CONCURRENCY}) …"
    )
    semaphore = asyncio.Semaphore(CONCURRENCY)

    async with httpx.AsyncClient(
        base_url=cfg.api_base_url,
        headers={"Authorization": f"Bearer {staff_token}"},
        timeout=30.0,
    ) as client:
        tasks = [
            _send_scan(client, token, token_type, semaphore)
            for token, token_type in all_requests
        ]
        t0      = time.perf_counter()
        results = await asyncio.gather(*tasks)
        elapsed = time.perf_counter() - t0

    # ── Cleanup planted tokens ────────────────────────────────────────────────
    print(f"[H3] Removing planted forged tokens from Redis …")
    await _remove_forged_tokens(redis_client, forged_pairs)
    await redis_client.aclose()

    # ── Tally results ─────────────────────────────────────────────────────────
    valid_results     = [r for r in results if r.token_type == "valid"]
    forged_results    = [r for r in results if r.token_type == "forged"]
    duplicate_results = [r for r in results if r.token_type == "duplicate"]

    # Valid tokens: VALID or ALREADY_USED = correct; INVALID_TOKEN = false negative
    valid_accepted = sum(
        1 for r in valid_results
        if r.result_code in ("VALID", "ALREADY_USED")
    )
    valid_fn = sum(
        1 for r in valid_results
        if r.result_code == "INVALID_TOKEN"
    )

    # Forged tokens: INVALID_TOKEN = true negative; VALID/ALREADY_USED = false positive (breach!)
    forged_tn = sum(
        1 for r in forged_results
        if r.result_code == "INVALID_TOKEN"
    )
    forged_fp = sum(
        1 for r in forged_results
        if r.result_code in ("VALID", "ALREADY_USED")
    )

    # Duplicate tokens
    dup_already_used = sum(
        1 for r in duplicate_results
        if r.result_code == "ALREADY_USED"
    )
    dup_valid = sum(
        1 for r in duplicate_results
        if r.result_code == "VALID"
    )

    total_5xx  = sum(1 for r in results if r.is_5xx)
    error_rate = total_5xx / len(results)

    h3_passed   = error_rate  <= cfg.error_rate_target
    security_ok = forged_fp   == 0

    # ── Build and print report ────────────────────────────────────────────────
    report = _build_report(
        total            = len(results),
        elapsed_s        = elapsed,
        valid_accepted   = valid_accepted,
        valid_fn         = valid_fn,
        forged_tn        = forged_tn,
        forged_fp        = forged_fp,
        dup_already_used = dup_already_used,
        dup_valid        = dup_valid,
        total_5xx        = total_5xx,
        error_rate       = error_rate,
        h3_passed        = h3_passed,
        security_ok      = security_ok,
    )

    print()
    print(report)

    # ── Persist report ────────────────────────────────────────────────────────
    results_dir = Path(RESULTS_DIR)
    results_dir.mkdir(exist_ok=True)
    ts          = int(time.time())
    report_path = results_dir / f"h3_report_{ts}.txt"

    with open(report_path, "w") as fh:
        fh.write(report)
        fh.write(
            f"\n\nRaw stats: total={len(results)}, elapsed={elapsed:.1f}s, "
            f"valid_accepted={valid_accepted}, valid_fn={valid_fn}, "
            f"forged_tn={forged_tn}, forged_fp={forged_fp}, "
            f"dup_already_used={dup_already_used}, dup_valid={dup_valid}, "
            f"5xx={total_5xx} ({error_rate * 100:.3f}%)\n"
        )

    print(f"\n[H3] Report written to {report_path}")

    if not security_ok:
        print(
            f"\n[H3] ⚠  SECURITY BREACH: {forged_fp} forged token(s) accepted! "
            "HMAC validation is not working correctly."
        )
        sys.exit(2)

    if not h3_passed:
        print(
            f"\n[H3] ✗  H3 FAILED: 5xx error rate {error_rate * 100:.3f}% "
            f"exceeds {cfg.error_rate_target * 100}% threshold."
        )
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
