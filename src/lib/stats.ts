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

const DECK_COUNT_THRESHOLD = 50;

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

export function getCardStats(
  leaderId: string | undefined,
  format: Format | undefined,
  cardId: string,
): CardStats | null {
  if (!leaderId || !format) return null;
  const leaderStats = statsCache.get(leaderId);
  if (!leaderStats) return null;
  const formatStats = leaderStats[format];
  if (!formatStats || formatStats.deckCount < DECK_COUNT_THRESHOLD) return null;
  return formatStats.cards[cardId] ?? null;
}
