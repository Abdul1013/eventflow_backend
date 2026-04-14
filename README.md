# EventFlow

A full-stack event management platform 

---

## Overview

EventFlow manages event creation, ticket sales, seat allocation, and QR-based check-in for large-scale events. It consists of a Node.js/Express API, two React web portals (admin + attendee), a React Native staff mobile app, and a Python microservice for intelligent seat allocation.

---

## Monorepo Structure

```
eventflow/
├── apps/
│   ├── api/              # Node.js 20 + Express 5 + TypeScript + Prisma
│   ├── web-admin/        # React 18 + Vite — admin portal
│   ├── web-attendee/     # React 18 + Vite — attendee web app
│   ├── mobile/           # React Native 0.73 + Expo SDK 50 — staff QR scanner
│   └── sao-engine/       # Python 3.12 + FastAPI — seat allocation microservice
├── packages/
│   ├── ui/               # Shared React component library (shadcn/ui + Tailwind)
│   ├── types/            # Shared TypeScript types (API contracts)
│   └── validators/       # Shared Zod schemas
├── docker-compose.yml    # Local PostgreSQL 16 + Redis 7
└── pnpm-workspace.yaml
```

---

## Prerequisites

- **Node.js** 20+
- **pnpm** 9+
- **Docker** (for local PostgreSQL + Redis)
- **Python** 3.12+ (for SAO engine only)

---

## Quick Start

```bash
# 1. Clone and install
git clone <repo-url>
cd eventflow_backend
pnpm install

# 2. Start local services
docker-compose up -d

# 3. Copy environment variables
cp apps/api/.env.example apps/api/.env
# Fill in JWT secrets, Redis URL, etc.

# 4. Run database migrations
pnpm --filter @eventflow/api prisma:migrate
pnpm --filter @eventflow/api exec prisma generate


# 5. Start the API
pnpm --filter @eventflow/api dev

# 6. Start a web app (in a separate terminal)
pnpm --filter @eventflow/web-admin dev
pnpm --filter @eventflow/web-attendee dev
pnpm --filter @eventflow/mobile start

```

---

## Environment Variables

Create `apps/api/.env` from the following template:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/eventflow
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=<min-32-chars>
JWT_REFRESH_SECRET=<min-32-chars-different>
HMAC_SECRET=<min-32-chars>
RESEND_API_KEY=re_...
CLOUDINARY_URL=cloudinary://...
SAO_ENGINE_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5174
ADMIN_URL=http://localhost:5173
PORT=3000
NODE_ENV=development
```

---

## Development Tools

### API Documentation (Swagger UI)

When running in development (`NODE_ENV !== 'production'`), interactive API docs are available at:

- **Swagger UI** → `http://localhost:3001/api/docs`
- **OpenAPI JSON** → `http://localhost:3001/api/docs.json`

The spec covers all 37 endpoints across Auth, Events, Tickets, Check-in, Admin, and Venues. Use the **Authorize** button to paste a Bearer token from `POST /auth/login`.

---

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm --filter @eventflow/api dev` | Start API in watch mode |
| `pnpm --filter @eventflow/api test` | Run API integration tests (Vitest + Supertest) |
| `pnpm --filter @eventflow/api test:coverage` | Run tests with coverage report |
| `pnpm --filter @eventflow/api db:migrate` | Apply Prisma migrations |
| `pnpm --filter @eventflow/api db:generate` | Regenerate Prisma client |
| `pnpm --filter @eventflow/web-admin dev` | Start admin portal (port 5173) |
| `pnpm --filter @eventflow/web-attendee dev` | Start attendee portal (port 5174) |
| `pnpm --filter @eventflow/mobile test` | Run mobile unit tests |
`pnpm --filter @eventflow/api exec prisma studio`
`/Users/user/IT/eventflow_backend/node_modules/vite/bin/vite.js`

---

## Running Load Tests

Requires Python 3.12+ and Locust. Run against a local instance with Docker services up.

```bash
cd apps/api/tests/load
pip install locust

# Seed test data (2,500 QR tokens + attendee accounts)
python fixtures/seed_tokens.py --count 2500

# H2 — Sustained concurrency (2,500 virtual users, 5 min ramp)
locust -f locustfile.py --headless -u 2500 -r 50 --run-time 5m \
  --host http://localhost:3001 --html results/h2_report.html

# H3 — QR error-rate validation (10,000 scans, 100 forged tokens)
python h3_error_rate.py --total 10000 --forged 100

# Cleanup seeded data after tests
python fixtures/cleanup_tokens.py
```

Results are written to `apps/api/tests/load/results/` (gitignored).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | Node.js 20, Express 5, TypeScript, Prisma |
| Database | PostgreSQL 16 |
| Cache / Token Store | Redis 7 |
| Seat Allocation | Python 3.12, FastAPI, scikit-learn |
| Admin Web | React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui |
| Attendee Web | React 18, Vite, TypeScript, Tailwind CSS |
| Mobile (Staff) | React Native 0.73, Expo SDK 50 |
| Auth | JWT (15 min access) + refresh token rotation (7 days) |
| Testing | Vitest, Supertest, Locust |
| CI/CD | GitHub Actions |

---

## Architecture

### System Overview

```
┌─────────────────┐   ┌─────────────────┐   ┌──────────────────┐
│   Web Admin     │   │  Attendee Web   │   │  Staff Mobile    │
│  React + Vite   │   │  React + Vite   │   │  React Native    │
│   Port 5173     │   │   Port 5174     │   │  Expo SDK 50     │
└────────┬────────┘   └────────┬────────┘   └────────┬─────────┘
         │                     │  HTTPS / REST        │
         └─────────────────────┼──────────────────────┘
                               │
                  ┌────────────▼────────────┐
                  │      Node.js API        │
                  │  Express 5 + TypeScript │
                  │    Prisma ORM           │
                  │      Port 3001          │
                  └──────┬──────────┬───────┘
                         │          │
               ┌──────────▼──┐  ┌───▼──────────┐
               │ PostgreSQL  │  │   Redis 7    │
               │     16      │  │ tokens +     │
               │  (primary   │  │ cache + rate │
               │    store)   │  │  limiting    │
               └─────────────┘  └──────────────┘
                         │ HTTP (on-demand)
                  ┌──────▼──────────────────┐
                  │     SAO Engine          │
                  │  Python 3.12 + FastAPI  │
                  │  Greedy seat allocator  │
                  │      Port 8000          │
                  └─────────────────────────┘
```

### API Module Pattern

Every feature module follows a strict layered pattern:

```
modules/auth/
├── auth.routes.ts      # Router — route definitions only
├── auth.controller.ts  # Parse req/res, call service, respond
├── auth.service.ts     # Business logic, throws AppError
├── auth.dto.ts         # Zod validation schemas
└── auth.test.ts        # Integration tests
```

### Authentication Flow

1. `POST /api/v1/auth/login` → returns JWT access token (15 min) + sets HttpOnly refresh cookie (7 days)
2. Access token sent as `Authorization: Bearer <token>` on protected requests
3. `POST /api/v1/auth/refresh` → rotates refresh token; returns new access token
4. Refresh tokens stored hashed in Redis for instant revocation

### Error Response Shape

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password"
  }
}
```

### Success Response Shape

```json
{
  "success": true,
  "data": { "..." },
  "meta": { "page": 1, "total": 42, "limit": 20 }
}
```

---

## Academic Research Hypotheses

| ID | Hypothesis | How to Reproduce | Pass Criterion |
|----|-----------|-----------------|----------------|
| H1 | Hybrid greedy seat allocation improves space yield vs manual assignment | `POST /api/v1/events/:id/allocate/compare` → inspect `utilisationGain` field | ≥ 15% utilisation increase |
| H2 | Async event-driven architecture sustains high concurrency without degradation | Run Locust suite: `locust -f locustfile.py -u 2500 -r 50 --run-time 5m` | P99 latency ≤ 7.0 s @ 2,500 VUs |
| H3 | HMAC-signed QR tokens reduce check-in fraud/error rate | Run `python h3_error_rate.py --total 10000 --forged 100`; inspect `errorRate` | Error rate ≤ 0.5% across 10,000 scans |

All three hypotheses are validated programmatically. Results are reproducible from the `apps/api/tests/load/` directory (see [Running Load Tests](#running-load-tests)).

---

## Security

- Passwords: bcrypt, 12 salt rounds
- JWT secrets: never logged or exposed in responses
- Refresh tokens: stored hashed; rotation on every use
- QR tokens: HMAC-SHA256, one-time-use, TTL-expired in Redis
- Input validation: Zod on every endpoint (body, params, query)
- RBAC: three roles (ADMIN, STAFF, ATTENDEE) enforced via middleware
- Rate limiting: 100 req/15 min public; 20 req/min auth endpoints
- CORS: strict allowlist — no wildcard origins in production

---

## Deployment

| Service | Platform |
|---------|----------|
| Node.js API | Railway |
| Python SAO engine | Railway (2nd service) |
| PostgreSQL | Railway managed |
| Redis | Upstash free tier |
| Admin Web | Vercel |
| Attendee Web | Vercel (2nd project) |
| Mobile | Expo EAS (Android APK) |

---

## Known Limitations (V1.0)

| # | Limitation | Planned Resolution |
|---|-----------|-------------------|
| 1 | **No payment integration** — ticket purchase is free in V1; price field is stored but not charged | Paystack / Stripe gateway in V2 |
| 2 | **Load tests are local only** — Locust targets `localhost`; Railway free tier cannot sustain 2,500 VUs | Dedicated load-test environment or k6 cloud |
| 3 | **SAO engine uses synthetic preference data** — seat preferences are generated during seeding, not sourced from real attendee history | Collect real preference signals in production |
| 4 | **iOS distribution requires Apple Developer account** — staff mobile app ships as Android APK via Expo EAS; iOS build is untested | Enrol in Apple Developer Program for TestFlight |
| 5 | **Email delivery is optional** — `RESEND_API_KEY` is not required; missing key silently skips all transactional emails | Mark as required in production deploy checklist |