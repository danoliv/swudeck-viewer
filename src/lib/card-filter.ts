/**
 * src/lib/card-filter.ts
 * Pure card search/filter + leader/base pool logic for the deck builder.
 *
 * Operates on CardData[] already loaded via loadCardSet/preloadSets
 * (src/lib/cards.ts). No DOM dependencies.
 */

import type { CardData } from './cards';

// ─── CardFilter ───────────────────────────────────────────────────────────────

/**
 * Filter criteria for the "Add cards to your deck" browser.
 * Every field is optional; an unset/empty field is not applied. Within a
 * field, matches are OR'd (e.g. `types: ['Unit', 'Event']` matches either);
 * across fields, matches are AND'd.
 */
export interface CardFilter {
  search?: string;
  types?: string[];
  arenas?: string[];
  aspects?: string[];
  keywords?: string[];
  traits?: string[];
  sets?: string[];
  /**
   * When set, only include cards whose Aspects are a subset of this list —
   * i.e. cards that incur no aspect resource penalty for a given leader+base.
   * Cards with no Aspects (neutral) always pass, even when this is `[]`.
   */
  noPenaltyAspects?: string[];
}

function overlaps(values: string[] | undefined, wanted: string[]): boolean {
  if (!wanted.length) return true;
  if (!Array.isArray(values) || !values.length) return false;
  return values.some((v) => wanted.includes(v));
}

/**
 * Aspect filter buttons, grouped: the 4 resource-cost aspects, then the 2
 * alignment aspects. Selections within a group are OR'd (e.g. Vigilance or
 * Command); selections across groups are AND'd (e.g. (Vigilance or Command)
 * and Villainy) — so picking Villainy narrows down rather than adding more
 * results.
 */
export const ASPECT_GROUPS: readonly string[][] = [
  ['Vigilance', 'Command', 'Aggression', 'Cunning'],
  ['Heroism', 'Villainy'],
];

/** The alignment group (Heroism/Villainy) — most cards have neither, hence the NEUTRAL_ALIGNMENT option below. */
const ALIGNMENT_GROUP = ASPECT_GROUPS[1];

/** Pseudo-value for the alignment group: matches cards with neither Heroism nor Villainy. */
export const NEUTRAL_ALIGNMENT = 'None';

function matchesAspectGroups(values: string[] | undefined, wanted: string[]): boolean {
  return ASPECT_GROUPS.every((group) => {
    const groupWanted = wanted.filter((v) => group.includes(v));
    if (group === ALIGNMENT_GROUP && wanted.includes(NEUTRAL_ALIGNMENT)) {
      const isNeutral = !overlaps(values, group);
      return groupWanted.length ? isNeutral || overlaps(values, groupWanted) : isNeutral;
    }
    return overlaps(values, groupWanted);
  });
}

function isSubsetOf(values: string[] | undefined, allowed: string[]): boolean {
  if (!Array.isArray(values) || !values.length) return true;
  return values.every((v) => allowed.includes(v));
}

/**
 * Filter a card pool against the given criteria.
 * Adding a new filter dimension is one new field on CardFilter plus one
 * predicate here — no changes needed at call sites.
 */
export function filterCards(cards: CardData[], filter: CardFilter): CardData[] {
  const search = filter.search?.trim().toLowerCase();
  const types = filter.types ?? [];
  const arenas = filter.arenas ?? [];
  const aspects = filter.aspects ?? [];
  const keywords = filter.keywords ?? [];
  const traits = filter.traits ?? [];
  const sets = filter.sets ?? [];
  const noPenaltyAspects = filter.noPenaltyAspects;

  return cards.filter((card) => {
    if (search && !String(card.Name ?? '').toLowerCase().includes(search)) return false;
    if (types.length && !types.includes(String(card.Type ?? ''))) return false;
    if (!overlaps(card.Arenas, arenas)) return false;
    if (!matchesAspectGroups(card.Aspects, aspects)) return false;
    if (!overlaps(card.Keywords as string[] | undefined, keywords)) return false;
    if (!overlaps(card.Traits, traits)) return false;
    if (sets.length && !sets.includes(String(card.Set ?? ''))) return false;
    if (noPenaltyAspects && !isSubsetOf(card.Aspects, noPenaltyAspects)) return false;
    return true;
  });
}

// ─── Leader / Base pools ──────────────────────────────────────────────────────

/** All Leader cards in the given pool. */
export function getLeaders(cards: CardData[]): CardData[] {
  return cards.filter((card) => card.Type === 'Leader');
}

/** All Base cards in the given pool. */
export function getBases(cards: CardData[]): CardData[] {
  return cards.filter((card) => card.Type === 'Base');
}

/**
 * Bases grouped the way swudb's "Choose a base" step does:
 * - random: generic bases with no Aspects (any leader can use these)
 * - ability: bases with Aspects and ability text
 * - vanilla: bases with Aspects and no ability text
 * All bases are included regardless of the leader's aspects.
 */
export interface BaseGroups {
  random: CardData[];
  ability: CardData[];
  vanilla: CardData[];
}

function hasAbilityText(card: CardData): boolean {
  return Boolean(String(card.FrontText ?? '').trim() || String(card.BackText ?? '').trim());
}

// ─── sortCards ────────────────────────────────────────────────────────────────

/** Sort key shared by the deck/sideboard/browser sort bars and the leader/base pickers. */
export type CardSortKey = 'type' | 'set' | 'cost' | 'aspect' | 'name' | 'popularity' | 'winrate';

/** Ascending ('asc') or reversed ('desc') order for a `CardSortKey`. */
export type SortDirection = 'asc' | 'desc';

/**
 * Looks up the current leader/format-relative stats for a card, for the
 * 'popularity'/'winrate' sort keys. Returns `null`/`undefined` when no
 * stats are available for that card (it sorts as if unranked).
 */
export type StatsLookup = (cardId: string) => { inclusionRate?: number; winRate?: number } | null | undefined;

/** Deck-list type-category order: Ground Units, Space Units, Event, Upgrade, then other types alphabetically, "Unknown" last. */
export const TYPE_CATEGORY_ORDER = ['Ground Units', 'Space Units', 'Event', 'Upgrade'];

/** Categorize a card the way the deck-list groups it — splits Units into Ground/Space Units. */
export function cardTypeCategory(card: CardData): string {
  const type = String(card.Type ?? 'Unknown');
  if (type === 'Unit') {
    const arenas = (card.Arenas as string[] | undefined) ?? [];
    return arenas.includes('Space') && !arenas.includes('Ground') ? 'Space Units' : 'Ground Units';
  }
  return type;
}

function cardSet(card: CardData): string {
  return String(card.Set ?? String(card.id ?? '').split('_')[0] ?? '');
}

function cardNumber(card: CardData): number {
  const raw = String(card.Number ?? String(card.id ?? '').split('_')[1] ?? '');
  const match = raw.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}

function compareByName(a: CardData, b: CardData): number {
  return String(a.Name ?? '').localeCompare(String(b.Name ?? ''));
}

function compareBySet(a: CardData, b: CardData, setOrder: string[]): number {
  const setA = cardSet(a);
  const setB = cardSet(b);
  if (setA !== setB) {
    const ia = setOrder.indexOf(setA);
    const ib = setOrder.indexOf(setB);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return setA.localeCompare(setB);
  }
  return cardNumber(a) - cardNumber(b);
}

function compareByCostOnly(a: CardData, b: CardData): number {
  const costA = a.Cost === undefined || a.Cost === '' ? Infinity : Number(a.Cost);
  const costB = b.Cost === undefined || b.Cost === '' ? Infinity : Number(b.Cost);
  return costA === costB ? 0 : costA - costB;
}

function compareByAspectOnly(a: CardData, b: CardData): number {
  const aspectA = a.Aspects?.[0] ?? '';
  const aspectB = b.Aspects?.[0] ?? '';
  if (aspectA === aspectB) return 0;
  if (!aspectA) return 1;
  if (!aspectB) return -1;
  return aspectA.localeCompare(aspectB);
}

function compareByTypeOnly(a: CardData, b: CardData): number {
  const catA = cardTypeCategory(a);
  const catB = cardTypeCategory(b);
  if (catA === catB) return 0;
  const ia = TYPE_CATEGORY_ORDER.indexOf(catA);
  const ib = TYPE_CATEGORY_ORDER.indexOf(catB);
  if (ia !== -1 && ib !== -1) return ia - ib;
  if (ia !== -1) return -1;
  if (ib !== -1) return 1;
  if (catA === 'Unknown') return 1;
  if (catB === 'Unknown') return -1;
  return catA.localeCompare(catB);
}

/**
 * Fixed secondary-sort priority chain shared by the deck/sideboard/browser
 * sort bars: whichever of these is chosen as the primary key, the rest are
 * applied (in this order) as tiebreakers.
 */
const SORT_PRIORITY: CardSortKey[] = ['cost', 'name', 'aspect', 'type'];

/** Cards with no stats sort as if their rate were below 0 — always last in ascending order. */
function statRate(statsLookup: StatsLookup | undefined, card: CardData, field: 'inclusionRate' | 'winRate'): number {
  const stats = statsLookup?.(String(card.id ?? ''));
  const value = stats?.[field];
  return typeof value === 'number' ? value : -1;
}

function compareByPopularityOnly(a: CardData, b: CardData, statsLookup: StatsLookup | undefined): number {
  return statRate(statsLookup, a, 'inclusionRate') - statRate(statsLookup, b, 'inclusionRate');
}

function compareByWinRateOnly(a: CardData, b: CardData, statsLookup: StatsLookup | undefined): number {
  return statRate(statsLookup, a, 'winRate') - statRate(statsLookup, b, 'winRate');
}

function compareSingle(key: CardSortKey, a: CardData, b: CardData, statsLookup?: StatsLookup): number {
  switch (key) {
    case 'cost': return compareByCostOnly(a, b);
    case 'aspect': return compareByAspectOnly(a, b);
    case 'type': return compareByTypeOnly(a, b);
    case 'popularity': return compareByPopularityOnly(a, b, statsLookup);
    case 'winrate': return compareByWinRateOnly(a, b, statsLookup);
    case 'name':
    default: return compareByName(a, b);
  }
}

/** Compare by `primary`, then by the remaining `SORT_PRIORITY` keys (in order) as tiebreakers. */
function compareWithPriority(primary: CardSortKey, a: CardData, b: CardData, statsLookup?: StatsLookup): number {
  for (const key of [primary, ...SORT_PRIORITY.filter((k) => k !== primary)]) {
    const result = compareSingle(key, a, b, statsLookup);
    if (result !== 0) return result;
  }
  return 0;
}

/**
 * Reorder a card pool for the deck/sideboard/browser sort bars and leader/base
 * pickers, without mutating the input.
 * - 'type': Ground Units, Space Units, Event, Upgrade, then other types
 *   alphabetically ("Unknown" last); ties broken by Cost, then Name, then Affinity.
 * - 'set': canonical set order (via `setOrder`), then card number within a set.
 * - 'cost': ascending Cost (blank/missing last); ties broken by Name, then Affinity, then Type.
 * - 'aspect': alphabetical by the first Aspect (cards with no Aspects last); ties broken by
 *   Cost, then Name, then Type.
 * - 'name': alphabetical by Name; ties broken by Cost, then Affinity, then Type.
 * - 'popularity': ascending inclusion rate from `statsLookup` (cards with no stats last);
 *   ties broken by Cost, then Name, then Affinity, then Type.
 * - 'winrate': ascending win rate from `statsLookup` (cards with no stats last); same tiebreakers.
 *
 * Whichever key is primary, the remaining keys among cost/name/affinity/type are applied
 * as tiebreakers in that fixed priority order. `direction: 'desc'` reverses the result.
 */
export function sortCards(
  cards: CardData[],
  sortBy: CardSortKey,
  setOrder: string[] = [],
  direction: SortDirection = 'asc',
  statsLookup?: StatsLookup,
): CardData[] {
  const sorted = [...cards];

  switch (sortBy) {
    case 'type':
    case 'cost':
    case 'aspect':
    case 'name':
    case 'popularity':
    case 'winrate':
      sorted.sort((a, b) => compareWithPriority(sortBy, a, b, statsLookup));
      break;
    case 'set':
    default:
      sorted.sort((a, b) => compareBySet(a, b, setOrder));
      break;
  }

  return direction === 'desc' ? sorted.reverse() : sorted;
}

export function categorizeBases(bases: CardData[]): BaseGroups {
  const groups: BaseGroups = { random: [], ability: [], vanilla: [] };

  for (const base of bases) {
    const aspects = base.Aspects ?? [];
    if (!aspects.length) {
      groups.random.push(base);
      continue;
    }

    if (hasAbilityText(base)) {
      groups.ability.push(base);
    } else {
      groups.vanilla.push(base);
    }
  }

  return groups;
}

// ─── combineAspects ───────────────────────────────────────────────────────────

/**
 * Union of one or more cards' `Aspects` lists, deduped, preserving first-seen order.
 * Used to preselect the card browser's aspect filter from the chosen leader + base.
 * Returns `undefined` if every list is empty/undefined.
 */
export function combineAspects(...aspectLists: Array<string[] | undefined>): string[] | undefined {
  const combined = new Set<string>();
  for (const list of aspectLists) {
    for (const a of list ?? []) combined.add(a);
  }
  return combined.size ? Array.from(combined) : undefined;
}
