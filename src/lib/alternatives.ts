/**
 * src/lib/alternatives.ts
 * Pure logic for suggesting "better" alternatives to a given card, for the
 * deck builder's card-detail panel. A candidate qualifies if it shares the
 * same cost, Type, and Arenas (a Ground unit is never a real swap for a
 * Space unit), carries at least all of the card's Keywords (e.g. a
 * Sentinel/Piloting unit only compares against other Sentinel+Piloting
 * units, though a candidate may carry extra keywords on top — a suggested
 * swap never loses a keyword the deck was relying on), and beats the card
 * at something: more effective Power for the same HP, more HP for the same
 * effective Power, a higher popularity (inclusion rate), or a higher win
 * rate (the latter two require leader+format stats).
 *
 * Raid is treated specially: it's folded into "effective Power" (base Power
 * + Raid bonus while attacking) rather than required as a keyword, so raw
 * Power can substitute for it and vice versa — a 1/1 with Raid 1, a 2/1
 * with no Raid, and a 1/1 with Raid 2 all present the same effective
 * attacking threat and can swap for one another.
 */

import type { CardData } from './cards';
import type { CardStats } from './stats';

export interface CardAlternative {
  card: CardData;
  reasons: string[];
}

export type StatsLookup = (cardId: string) => CardStats | null | undefined;

function toNumber(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = typeof value === 'number' ? value : parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Keywords whose effect is folded into another comparable stat instead of being required verbatim. */
const SUBSTITUTABLE_KEYWORDS = new Set(['raid']);

function keywordSet(card: CardData): Set<string> {
  return new Set(
    ((card.Keywords as string[] | undefined) ?? [])
      .map((k) => k.toLowerCase())
      .filter((k) => !SUBSTITUTABLE_KEYWORDS.has(k)),
  );
}

/** Raid N grants +N/+0 while attacking; extracted from the card text since Keywords only lists the name. */
function raidBonus(card: CardData): number {
  const match = String(card.FrontText ?? '').match(/raid\s+(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
}

/** Whether `candidate` carries every keyword in `required` (extra keywords on `candidate` are fine). */
function hasAllKeywords(required: Set<string>, candidate: Set<string>): boolean {
  for (const k of required) if (!candidate.has(k)) return false;
  return true;
}

function arenaSet(card: CardData): Set<string> {
  return new Set(((card.Arenas as string[] | undefined) ?? []).map((a) => a.toLowerCase()));
}

/** Arena must match exactly — a Ground unit is never a usable swap for a Space unit, or vice versa. */
function sameArenas(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const arena of a) if (!b.has(arena)) return false;
  return true;
}

/**
 * Find and rank alternatives to `cardData` (id `cardId`) from `pool`.
 * Ranked by number of qualifying reasons (most-improved first), then by name.
 */
export function findAlternatives(
  cardId: string,
  cardData: CardData,
  pool: CardData[],
  statsLookup?: StatsLookup,
): CardAlternative[] {
  const cost = toNumber(cardData.Cost);
  const type = cardData.Type;
  if (cost === undefined || !type) return [];

  const power = toNumber(cardData.Power);
  const hp = toNumber(cardData.HP);
  const raid = raidBonus(cardData);
  const effectivePower = power !== undefined ? power + raid : undefined;
  const baseStats = statsLookup?.(cardId) ?? null;
  const keywords = keywordSet(cardData);
  const arenas = arenaSet(cardData);

  const results: CardAlternative[] = [];

  for (const candidate of pool) {
    if (!candidate.id || candidate.id === cardId) continue;
    if (candidate.Type !== type) continue;
    if (toNumber(candidate.Cost) !== cost) continue;
    if (!sameArenas(arenas, arenaSet(candidate))) continue;
    if (!hasAllKeywords(keywords, keywordSet(candidate))) continue;

    const reasons: string[] = [];
    const candPower = toNumber(candidate.Power);
    const candHP = toNumber(candidate.HP);
    const candRaid = raidBonus(candidate);
    const candEffectivePower = candPower !== undefined ? candPower + candRaid : undefined;
    const raidInvolved = raid > 0 || candRaid > 0;

    if (effectivePower !== undefined && hp !== undefined && candEffectivePower !== undefined && candHP !== undefined) {
      if (candEffectivePower > effectivePower && candHP === hp) {
        reasons.push(
          raidInvolved
            ? `More effective Power incl. Raid (${candEffectivePower} vs ${effectivePower})`
            : `More Power (${candEffectivePower} vs ${effectivePower})`,
        );
      }
      if (candHP > hp && candEffectivePower === effectivePower) reasons.push(`More HP (${candHP} vs ${hp})`);
    }

    const candStats = statsLookup?.(candidate.id) ?? null;
    if (baseStats && candStats) {
      if (candStats.inclusionRate > baseStats.inclusionRate) {
        reasons.push(`Higher popularity (${Math.round(candStats.inclusionRate)}% vs ${Math.round(baseStats.inclusionRate)}%)`);
      }
      if (candStats.winRate > baseStats.winRate) {
        reasons.push(`Higher win rate (${Math.round(candStats.winRate)}% vs ${Math.round(baseStats.winRate)}%)`);
      }
    }

    if (reasons.length) results.push({ card: candidate, reasons });
  }

  results.sort((a, b) => {
    if (b.reasons.length !== a.reasons.length) return b.reasons.length - a.reasons.length;
    return String(a.card.Name ?? '').localeCompare(String(b.card.Name ?? ''));
  });

  return results;
}
