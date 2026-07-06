import { env } from '../config/env.js';
import { logger } from './logger.js';

// ─── Key-case transformers ────────────────────────────────────────────────────

function toSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function toCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function transformKeys<T>(obj: unknown, fn: (k: string) => string): T {
  if (Array.isArray(obj)) {
    return obj.map((item) => transformKeys(item, fn)) as T;
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
        fn(k),
        transformKeys(v, fn),
      ]),
    ) as T;
  }
  return obj as T;
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

// Render free-tier services hibernate after ~15 min idle. The first request
// to a sleeping service hits the edge with 502/503 while the container spins
// up. Retry with backoff so admins don't see cold-start failures. Also retry on
// 429 rate-limit responses, honoring Retry-After when provided.
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const RETRY_DELAYS_MS = [3_000, 8_000, 15_000];
const MAX_RETRY_AFTER_MS = 60_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;

  const trimmed = value.trim();
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1_000, MAX_RETRY_AFTER_MS);
  }

  const date = Date.parse(trimmed);
  if (!Number.isNaN(date)) {
    return Math.min(Math.max(0, date - Date.now()), MAX_RETRY_AFTER_MS);
  }

  return null;
}

async function saoPost<TOut>(path: string, body: unknown): Promise<TOut> {
  const url = `${env.SAO_ENGINE_URL}/api/v1${path}`;
  const payload = JSON.stringify(transformKeys(body, toSnake));

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Secret': env.SAO_ENGINE_SECRET,
      },
      body: payload,
      signal: AbortSignal.timeout(45_000),
    });

    if (response.ok) {
      const json: unknown = await response.json();
      return transformKeys<TOut>(json, toCamel);
    }

    const isRetryable = RETRYABLE_STATUSES.has(response.status);
    const canRetry = isRetryable && attempt < RETRY_DELAYS_MS.length;

    if (!canRetry) {
      const text = await response.text();
      throw new Error(`SAO Engine error ${response.status}: ${text}`);
    }

    const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
    const delay = retryAfterMs ?? RETRY_DELAYS_MS[attempt]!;

    logger.warn(
      {
        status: response.status,
        attempt: attempt + 1,
        delayMs: delay,
        path,
        retryAfterMs,
      },
      'SAO Engine retryable response; retrying',
    );
    await sleep(delay);
  }

  // Unreachable — the loop returns or throws
  throw new Error('SAO Engine: exhausted retries');
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface SaoSeat {
  id: string;
  rowLabel: string;
  seatNumber: string;
  section?: string | null;
  xCoord: number;
  yCoord: number;
  isAccessible: boolean;
}

export interface SaoAttendee {
  userId: string;
  ticketId: string;
  groupId?: string | null;
  groupSize?: number;
  needsAccessible?: boolean;
}

export interface SaoAllocationRequest {
  eventId: string;
  seats: SaoSeat[];
  attendees: SaoAttendee[];
  algorithm?: 'kmeans_greedy' | 'manual_baseline';
}

export interface SaoSeatAssignment {
  ticketId: string;
  userId: string;
  seatId: string;
  rowLabel: string;
  seatNumber: string;
  section?: string | null;
}

export interface SaoAllocationResult {
  eventId: string;
  algorithmUsed: string;
  assignments: SaoSeatAssignment[];
  utilizationRate: number;
  adjacencyScore: number;
  seatsAssigned: number;
  seatsTotal: number;
  seatsAccessibleUsed: number;
  unassignedTicketIds: string[];
  durationMs: number;
}

export interface SaoComparisonResult {
  eventId: string;
  saoUtilizationRate: number;
  baselineUtilizationRate: number;
  saoAdjacencyScore: number;
  baselineAdjacencyScore: number;
  improvementPercentage: number;
  hypothesisH1Passed: boolean;
}

// ─── Client ───────────────────────────────────────────────────────────────────

export const saoClient = {
  async run(req: SaoAllocationRequest): Promise<SaoAllocationResult> {
    return saoPost<SaoAllocationResult>('/run', req);
  },

  async compare(req: SaoAllocationRequest): Promise<SaoComparisonResult> {
    return saoPost<SaoComparisonResult>('/compare', req);
  },
};
