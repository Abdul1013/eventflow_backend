# syntax=docker/dockerfile:1.7

# ─── Builder ──────────────────────────────────────────────────────────────────
FROM node:20-slim AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

# Copy workspace manifests first for better layer caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc* ./
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/
COPY packages/validators/package.json ./packages/validators/

# Copy the Prisma schema *before* install, so the postinstall hook
# (`prisma generate`) can find it.
COPY apps/api/prisma ./apps/api/prisma

RUN pnpm install --frozen-lockfile

# Copy source and build
COPY apps/api ./apps/api
COPY packages ./packages
COPY tsconfig.base.json ./
RUN pnpm --filter @eventflow/api build

# ─── Runtime ──────────────────────────────────────────────────────────────────
# We deliberately do NOT use `pnpm deploy --prod` here. With pnpm's symlinked
# layout, `deploy` relocates @prisma/client without preserving the generated
# `.prisma/client` artifact path, breaking the Node module resolver at runtime.
# Copying the entire workspace tree preserves every symlink as-is. The cost is
# ~150 MB of devDeps in the final image, which is fine for free-tier Render.
FROM node:20-slim AS runner
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production

WORKDIR /repo
COPY --from=builder /repo /repo

WORKDIR /repo/apps/api
EXPOSE 3001
# Run pending migrations before starting the server (idempotent).
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/server.js"]
