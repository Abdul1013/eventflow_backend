"""
Shared configuration for the EventFlow load test suite.

All values can be overridden via environment variables before running locust
or the seed / cleanup scripts.
"""

import os
from dataclasses import dataclass


@dataclass
class LoadTestConfig:
    #  API target
    api_base_url: str = os.getenv("LOAD_TEST_API_URL", "http://localhost:3001")

    #  Infrastructure 
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379")
    database_url: str = os.getenv("DATABASE_URL", "")

    #  Signing secrets (must match the running API) 
    hmac_secret: str = os.getenv("HMAC_SECRET", "")
    jwt_access_secret: str = os.getenv("JWT_ACCESS_SECRET", "")

    #  Load shape
    total_tokens: int = 2500           # VUs and pre-seeded QR tokens
    ramp_up_seconds: int = 60          # 0 → 2 500 VUs over 60 s
    hold_seconds: int = 300            # hold at 2 500 VUs for 5 minutes

    #  H2 / H3 pass criteria 
    p99_target_ms: float = 7000.0      # H2: POST /checkin/scan p99 ≤ 7 000 ms
    error_rate_target: float = 0.005   # H3: 5xx error rate ≤ 0.5 %

    #  Seeded credential 
    # Password used for every loadtest attendee user; seed sets emailVerified=True.
    attendee_password: str = "LoadTest1!"


# Convenience singleton — import directly where needed.
config = LoadTestConfig()


# Paths relative to this file — used by seed, cleanup, and user modules.
LOAD_TEST_DIR = os.path.dirname(os.path.abspath(__file__))
FIXTURES_DIR = os.path.join(LOAD_TEST_DIR, "fixtures")
RESULTS_DIR = os.path.join(LOAD_TEST_DIR, "results")
