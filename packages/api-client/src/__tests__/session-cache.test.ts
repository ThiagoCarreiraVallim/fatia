import { describe, expect, it, vi } from 'vitest';
import { invalidateSessionLists } from '../workout/session-cache';

describe('invalidateSessionLists', () => {
  it('marks both the session list and the history as stale', () => {
    const qc = { invalidateQueries: vi.fn() };
    invalidateSessionLists(qc);
    expect(qc.invalidateQueries.mock.calls).toEqual([
      [{ queryKey: ['workout', 'sessions'] }],
      [{ queryKey: ['workout', 'history'] }],
    ]);
  });
});
