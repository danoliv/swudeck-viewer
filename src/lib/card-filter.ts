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
    if (!overlaps(card.Aspects, aspects)) return false;
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
export type CardSortKey = 'type' | 'set' | 'cost' | 'aspect' | 'name';

/** Ascending ('asc') or reversed ('desc') order for a `CardSortKey`. */
export type SortDirection = 'asc' | 'desc';

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

function compareByCost(a: CardData, b: CardData): number {
  const costA = a.Cost === undefined || a.Cost === '' ? Infinity : Number(a.Cost);
  const costB = b.Cost === undefined || b.Cost === '' ? Infinity : Number(b.Cost);
  return costA !== costB ? costA - costB : compareByName(a, b);
}

function compareByAspect(a: CardData, b: CardData): number {
  const aspectA = a.Aspects?.[0] ?? '';
  const aspectB = b.Aspects?.[0] ?? '';
  if (aspectA !== aspectB) {
    if (!aspectA) return 1;
    if (!aspectB) return -1;
    return aspectA.localeCompare(aspectB);
  }
  return compareByName(a, b);
}

function compareByType(a: CardData, b: CardData): number {
  const catA = cardTypeCategory(a);
  const catB = cardTypeCategory(b);
  if (catA !== catB) {
    const ia = TYPE_CATEGORY_ORDER.indexOf(catA);
    const ib = TYPE_CATEGORY_ORDER.indexOf(catB);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    if (catA === 'Unknown') return 1;
    if (catB === 'Unknown') return -1;
    return catA.localeCompare(catB);
  }
  return compareByCost(a, b);
}

/**
 * Reorder a card pool for the deck/sideboard/browser sort bars and leader/base
 * pickers, without mutating the input.
 * - 'type': Ground Units, Space Units, Event, Upgrade, then other types
 *   alphabetically ("Unknown" last); ties broken by Cost then Name.
 * - 'set': canonical set order (via `setOrder`), then card number within a set.
 * - 'cost': ascending Cost, blank/missing Cost last, ties broken by Name.
 * - 'aspect': alphabetical by the first Aspect, cards with no Aspects last, ties by Name.
 * - 'name': alphabetical by Name.
 *
 * `direction: 'desc'` reverses the resulting order.
 */
export function sortCards(
  cards: CardData[],
  sortBy: CardSortKey,
  setOrder: string[] = [],
  direction: SortDirection = 'asc',
): CardData[] {
  const sorted = [...cards];

  switch (sortBy) {
    case 'type':
      sorted.sort(compareByType);
      break;
    case 'cost':
      sorted.sort(compareByCost);
      break;
    case 'aspect':
      sorted.sort(compareByAspect);
      break;
    case 'name':
      sorted.sort(compareByName);
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
