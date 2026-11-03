import type { Format } from './legal';

export interface CardStats {
  deckCount: number;
  winRate: number;
  inclusionRate: number;
}

interface FormatStats {
  metaId: number;
  metaName: string;
  deckCount: number;
  cards: Record<string, CardStats>;
}

interface LeaderStats {
  generatedAt: string;
  leaderId: string;
  premier?: FormatStats;
  eternal?: FormatStats;
}

const statsCache = new Map<string, LeaderStats | null>();
const loadingPromises = new Map<string, Promise<LeaderStats | null>>();

export async function loadLeaderStats(leaderId: string): Promise<LeaderStats | null> {
  if (statsCache.has(leaderId)) return statsCache.get(leaderId) ?? null;
  if (loadingPromises.has(leaderId)) return loadingPromises.get(leaderId)!;

  const promise = (async (): Promise<LeaderStats | null> => {
    try {
      const response = await fetch(`data/stats/${leaderId}.json`);
      if (!response.ok) {
        statsCache.set(leaderId, null);
        return null;
      }
      const data = (await response.json()) as LeaderStats;
      statsCache.set(leaderId, data);
      return data;
    } catch {
      statsCache.set(leaderId, null);
      return null;
    } finally {
      loadingPromises.delete(leaderId);
    }
  })();

  loadingPromises.set(leaderId, promise);
  return promise;
}

/**
 * Whether stats exist for this leader+format, for sort-option visibility. The minimum-deck threshold lives only in
 * `scripts/fetch-swubase.js` (MIN_DECK_COUNT): a format key is written to the file only when it passes it.
 */
export function hasLeaderStats(leaderId: string | undefined, format: Format | undefined): boolean {
  if (!leaderId || !format) return false;
  const leaderStats = statsCache.get(leaderId);
  if (!leaderStats) return false;
  const formatStats = leaderStats[format];
  return Boolean(formatStats);
}

export function getCardStats(
  leaderId: string | undefined,
  format: Format | undefined,
  cardId: string,
): CardStats | null {
  if (!leaderId || !format) return null;
  const leaderStats = statsCache.get(leaderId);
  if (!leaderStats) return null;
  const formatStats = leaderStats[format];
  if (!formatStats) return null;
  return formatStats.cards[cardId] ?? null;
}
