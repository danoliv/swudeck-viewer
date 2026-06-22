import { describe, it, expect, vi } from 'vitest';
import { loadLeaderStats, getCardStats, hasLeaderStats } from './stats';

const LEADER_STATS = {
  generatedAt: '2026-06-22T00:00:00.000Z',
  leaderId: 'LAW_014',
  premier: {
    metaId: 12,
    metaName: 'A Lawless Time',
    deckCount: 63,
    cards: {
      JTL_149: { deckCount: 63, winRate: 37.1, inclusionRate: 100 },
    },
  },
};

describe('hasLeaderStats / getCardStats', () => {
  it('is false before the leader has been loaded', () => {
    expect(hasLeaderStats('LAW_999', 'premier')).toBe(false);
    expect(getCardStats('LAW_999', 'premier', 'JTL_149')).toBeNull();
  });

  it('is false when leaderId or format is missing', () => {
    expect(hasLeaderStats(undefined, 'premier')).toBe(false);
    expect(hasLeaderStats('LAW_014', undefined)).toBe(false);
  });

  it('is true for a format present on the loaded leader, false for an absent one', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce(JSON.stringify(LEADER_STATS));
    await loadLeaderStats('LAW_014');

    expect(hasLeaderStats('LAW_014', 'premier')).toBe(true);
    expect(hasLeaderStats('LAW_014', 'eternal')).toBe(false);
    expect(getCardStats('LAW_014', 'premier', 'JTL_149')).toEqual({
      deckCount: 63,
      winRate: 37.1,
      inclusionRate: 100,
    });
    expect(getCardStats('LAW_014', 'premier', 'SOME_OTHER')).toBeNull();
  });

  it('is false after a 404 (no stats for this leader)', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce('', { status: 404 });
    await loadLeaderStats('LAW_404');

    expect(hasLeaderStats('LAW_404', 'premier')).toBe(false);
  });
});
