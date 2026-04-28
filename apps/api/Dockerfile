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

RUN pnpm install --frozen-lockfile

# Copy source
COPY apps/api ./apps/api
COPY packages ./packages
COPY tsconfig.base.json ./

# Generate Prisma client + build TS
RUN pnpm --filter @eventflow/api exec prisma generate
RUN pnpm --filter @eventflow/api build

# Produce a self-contained deploy bundle (prod deps only)
RUN pnpm --filter @eventflow/api deploy --prod --legacy /deploy

# ─── Runtime ──────────────────────────────────────────────────────────────────
FROM node:20-slim AS runner
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /deploy/node_modules ./node_modules
COPY --from=builder /deploy/package.json ./package.json
COPY --from=builder /repo/apps/api/dist ./dist
COPY --from=builder /repo/apps/api/prisma ./prisma

EXPOSE 3001
CMD ["node", "dist/server.js"]
