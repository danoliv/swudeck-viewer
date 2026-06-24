/**
 * src/lib/leader-stats.ts
 * Leader-level popularity/win rate, loaded from the single manifest
 * `data/stats/leader-stats.json` (built by `npm run fetch-swubase`). The manifest's
 * leader lists also double as "which leaders have real tournament presence
 * in this format" — used to power the leader picker's "With Stats" filter.
 */

import type { Format } from './legal';

export interface LeaderMetaStats {
  deckCount: number;
  popularity: number;
  winRate: number;
}

interface FormatLeaderStats {
  totalDecks: number;
  leaders: Record<string, LeaderMetaStats>;
}

interface LeaderStatsManifest {
  generatedAt: string;
  premier?: FormatLeaderStats;
  eternal?: FormatLeaderStats;
}

let manifest: LeaderStatsManifest | null = null;
let loadingPromise: Promise<LeaderStatsManifest | null> | null = null;

/** Fetches and caches `data/stats/leader-stats.json`. Safe to call repeatedly — only fetches once. */
export async function loadLeaderStatsManifest(): Promise<LeaderStatsManifest | null> {
  if (manifest) return manifest;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async (): Promise<LeaderStatsManifest | null> => {
    try {
      const response = await fetch('data/stats/leader-stats.json');
      if (!response.ok) return null;
      manifest = (await response.json()) as LeaderStatsManifest;
      return manifest;
    } catch {
      return null;
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

export function getLeaderMetaStats(leaderId: string | undefined, format: Format | undefined): LeaderMetaStats | null {
  if (!leaderId || !format) return null;
  return manifest?.[format]?.leaders[leaderId] ?? null;
}

/** Whether this leader has real tournament presence in this format — drives the "With Stats" filter. */
export function hasLeaderMetaStats(leaderId: string | undefined, format: Format | undefined): boolean {
  return getLeaderMetaStats(leaderId, format) !== null;
}

/** Test-only: reset the module-level cache. */
export function clearLeaderStatsCache(): void {
  manifest = null;
  loadingPromise = null;
}
