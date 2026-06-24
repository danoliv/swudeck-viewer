import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadLeaderStatsManifest, getLeaderMetaStats, hasLeaderMetaStats, clearLeaderStatsCache } from './leader-stats';

const MANIFEST = {
  generatedAt: '2026-06-24T21:57:15.413Z',
  premier: {
    totalDecks: 149,
    leaders: {
      LAW_018: { deckCount: 26, popularity: 17.4, winRate: 92.7 },
    },
  },
  eternal: {
    totalDecks: 15,
    leaders: {
      JTL_005: { deckCount: 3, popularity: 20, winRate: 50 },
    },
  },
};

beforeEach(() => {
  clearLeaderStatsCache();
});

describe('hasLeaderMetaStats / getLeaderMetaStats', () => {
  it('is false before the manifest has loaded', () => {
    expect(hasLeaderMetaStats('LAW_018', 'premier')).toBe(false);
    expect(getLeaderMetaStats('LAW_018', 'premier')).toBeNull();
  });

  it('is false when leaderId or format is missing', () => {
    expect(hasLeaderMetaStats(undefined, 'premier')).toBe(false);
    expect(hasLeaderMetaStats('LAW_018', undefined)).toBe(false);
  });

  it('is true for a leader present in that format, false for one absent from it', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce(JSON.stringify(MANIFEST));
    await loadLeaderStatsManifest();

    expect(hasLeaderMetaStats('LAW_018', 'premier')).toBe(true);
    expect(hasLeaderMetaStats('LAW_018', 'eternal')).toBe(false);
    expect(hasLeaderMetaStats('JTL_005', 'eternal')).toBe(true);
    expect(getLeaderMetaStats('LAW_018', 'premier')).toEqual({ deckCount: 26, popularity: 17.4, winRate: 92.7 });
    expect(getLeaderMetaStats('SOME_OTHER', 'premier')).toBeNull();
  });

  it('only fetches once across repeated calls', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce(JSON.stringify(MANIFEST));
    await loadLeaderStatsManifest();
    await loadLeaderStatsManifest();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns null and does not throw when the fetch fails', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce('', { status: 404 });
    expect(await loadLeaderStatsManifest()).toBeNull();
    expect(hasLeaderMetaStats('LAW_018', 'premier')).toBe(false);
  });
});
