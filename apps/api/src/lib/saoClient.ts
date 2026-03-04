import { env } from '../config/env.js';

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

async function saoPost<TOut>(path: string, body: unknown): Promise<TOut> {
  const response = await fetch(`${env.SAO_ENGINE_URL}/api/v1${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Secret': env.SAO_ENGINE_SECRET,
    },
    body: JSON.stringify(transformKeys(body, toSnake)),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SAO Engine error ${response.status}: ${text}`);
  }

  const json: unknown = await response.json();
  return transformKeys<TOut>(json, toCamel);
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
