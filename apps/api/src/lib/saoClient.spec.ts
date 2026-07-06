import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { saoClient } from './saoClient.js';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
  fetchMock.mockReset();
});

describe('saoClient', () => {
  it('retries on 429 and honors Retry-After header', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: () => '1' },
        text: async () => 'Too Many Requests',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          event_id: 'event-1',
          algorithm_used: 'kmeans_greedy',
          assignments: [],
          utilization_rate: 0,
          adjacency_score: 0,
          seats_assigned: 0,
          seats_total: 0,
          seats_accessible_used: 0,
          unassigned_ticket_ids: [],
          duration_ms: 0,
        }),
      });

    const result = await saoClient.run({
      eventId: 'event-1',
      seats: [],
      attendees: [],
    });

    expect(result.eventId).toBe('event-1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
