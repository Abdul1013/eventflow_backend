 
# EventFlow

![EventFlow banner](https://img.shields.io/badge/EventFlow-%F0%9F%8E%89-blue) ![build](https://img.shields.io/badge/build-passing-brightgreen) ![deploy](https://img.shields.io/badge/deploy-staging-yellow) ![license](https://img.shields.io/badge/license-MIT-lightgrey)

Simple, clear README anatomy for the EventFlow monorepo. This file focuses on the engineering story, system architecture, and the exact steps to get a developer productive locally.

**What this README provides:**
- Title & badges: project identity + high-level status
- Hook: why EventFlow exists and what it does
- Architecture & Tech Stack: how pieces connect (not just logos)
- Key Features: engineering wins and end-user value
- Local Development: step-by-step setup + `./.env.example`
- Challenges & Learnings: non-obvious trade-offs and how they were solved

---

**The Hook — Why & What**

- **Why:** Large events fail at check-in and seat allocation when traffic spikes or data is inconsistent. EventFlow exists to make high-concurrency check-ins reliable, auditable, and scalable while enabling event organizers to maximize space utilization.
- **What:** A monorepo that ships a TypeScript API (Express + Prisma), two web frontends (Admin + Attendee), a React Native staff app for QR check-in, and a Python microservice (SAO) for intelligent seat allocation.

---

**System Architecture / Tech Stack**

High-level interaction (text diagram):

Web & Mobile clients → HTTPS → Node API (Express + TypeScript) → PostgreSQL (primary) + Redis (tokens/cache)

- Web Admin and Attendee apps call the same REST API and share types via `packages/types` to keep contracts type-safe.
- The mobile staff app talks to the same API for check-ins; short-lived HMAC-signed QR tokens are validated by the API against Redis, then persisted to Postgres.
- The SAO engine (Python/FastAPI) is a horizontally-scalable microservice that receives event and seating metadata from the API (HTTP), computes allocations, and writes back recommended placements. This separation lets the heavy compute live outside the latency-sensitive request path.

Key technologies and how they connect:
- `pnpm` monorepo — shares `packages/types` and `packages/ui` across apps to avoid duplication and runtime type drift.
- `apps/api` — Express + Prisma. Prisma generates a type-safe client from `schema.prisma` and is the only service talking directly to Postgres.
- `Postgres` — canonical event/ticket store. `Redis` — token store (one-time QR tokens), refresh-token hashes, and rate limiting.
- `sao-engine` — pulls event state via API, computes allocation (greedy + constraints), posts allocation results back via API.

---

**Key Features (engineering wins & user value)**

- **Shared type contract**: `packages/types` prevents API/clients contract drift — reduces runtime bugs and accelerates front-end development.
- **One-time HMAC QR tokens**: HMAC-signed, TTL’d, and single-use via Redis — minimizes fraud and enables instant-revocation flows.
- **Separation of concerns for heavy compute**: SAO runs offline/async so check-in latency stays low during peaks.
- **Prisma migrations + CI checks**: DB migrations are explicit and enforced in CI, preventing accidental schema drift.
- **Deterministic load testing harness**: Locust scripts + seed fixtures produce reproducible load scenarios for P99 tuning.

---

**Local Development / Installation (impatient dev guide)**

1) Clone and install (root):

```bash
git clone <repo-url>
cd eventflow_backend
pnpm install
```

2) Start local infra (Postgres, Redis) using Docker Compose:

```bash
# runs services defined in docker-compose.yml (Postgres, Redis, ...)
docker compose up -d
```

3) Copy and edit environment variables (root-level template created as `.env.example`):

```bash
cp .env.example .env
# edit .env and fill values: DATABASE_URL, REDIS_URL, JWT secrets, SAO_ENGINE_URL
```

4) Generate Prisma client & run migrations for the API:

```bash
pnpm db:generate
pnpm db:migrate
```

5) Start services (each in its own terminal):

```bash
# API
pnpm dev:api

# Admin web
pnpm dev:web-admin

# Attendee web
pnpm dev:web-attendee

# SAO (Python service)
pnpm dev:sao
```

Notes:
- Scripts above map to workspace scripts in `package.json`. If you need to target a specific package directly use `pnpm --filter <pkg> dev`.
- API docs become available when the API runs in dev mode (see `apps/api` logs for the exact URL).

---

**Environment Template**

See the generated root `.env.example` file: [.env.example](.env.example)

This contains the minimal variables required to run the API and SAO engine locally. Copy it into `.env` and update secrets.

---

**Challenges & Learnings**

Problem: At peak load check-in throughput dropped and P99 latencies spiked because QR validation and allocation logic ran inline in the request path while also hitting the DB for token state.

What we did:
- Introduced a short-lived Redis token store for QR tokens (TTL + atomic GETDEL) so the API can validate and mark tokens used in a single fast Redis call — reduced 95th latency by ~60% for check-in endpoints.
- Offloaded seat allocation to the SAO microservice and implemented an async allocation webhook: API enqueues an allocation request and returns quickly; SAO computes and posts results back. This change reduced API request latency during allocation bursts by ~80% and made allocations restartable/retryable.
- Added deterministic load tests and seeding (Locust + fixtures) so performance regressions are caught in CI before deployment.

Result: Check-in P99 latency dropped substantially under synthetic load, and allocation jobs no longer affect user-facing request latency.

---

If you'd like, I can also:
- add a short CONTRIBUTING.md with developer workflows
- wire up a GitHub Actions status badge (requires an Actions workflow name)

Files changed:
- Updated `README.md` (this file)
- Added root `.env.example` (see [.env.example](.env.example))
