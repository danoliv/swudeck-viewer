/**
 * src/lib/deck.ts
 * Pure card-grouping and sort-strategy logic — zero DOM dependencies.
 *
 * All sorting/grouping logic lives here so it can be unit-tested independently
 * of the page layer. DOM orchestration belongs in src/pages/viewer.ts.
 */

import type { CardData } from './cards';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RawDeckCard {
  id: string;
  count?: number;
}

/** Enriched card entry used while rendering the deck grid. */
export interface CardEntry {
  id: string;
  count: number;
  sideboardCount: number;
  data: CardData;
}

export interface GroupedCards {
  [set: string]: Array<{ id: string; number: number; count: number }>;
}

// ─── groupCards ───────────────────────────────────────────────────────────────

/**
 * Group raw deck cards by set and sort each group by card number.
 * Returns an object whose keys are in `setOrder` first, then any remaining sets.
 */
export function groupCards(
  cards: RawDeckCard[],
  setOrder: string[] = [],
): GroupedCards {
  if (!Array.isArray(cards)) return {};

  const sets: GroupedCards = {};

  for (const card of cards) {
    if (!card?.id) continue;
    const [set, num] = card.id.split('_');
    if (!set) continue;
    if (!sets[set]) sets[set] = [];
    sets[set].push({ id: card.id, number: parseInt(num, 10) || 0, count: card.count ?? 1 });
  }

  // Sort within each set by card number
  for (const set of Object.keys(sets)) {
    sets[set].sort((a, b) => a.number - b.number);
  }

  // Re-order keys: canonical set order first, then any remaining
  const ordered: GroupedCards = {};
  for (const s of setOrder) {
    if (sets[s]) ordered[s] = sets[s];
  }
  for (const s of Object.keys(sets)) {
    if (!ordered[s]) ordered[s] = sets[s];
  }

  return ordered;
}

// ─── Sort strategy types ──────────────────────────────────────────────────────

export interface SortStrategy {
  groupBy(card: CardEntry): string;
  sortGroups(keys: string[], groups: Record<string, CardEntry[]>): string[];
  sortWithinGroup(cards: CardEntry[], setOrder?: string[]): CardEntry[];
  formatTitle(key: string): string;
}

// ─── BaseSortStrategy ─────────────────────────────────────────────────────────

export class BaseSortStrategy implements SortStrategy {
  groupBy(_card: CardEntry): string {
    throw new Error('groupBy must be implemented');
  }

  sortGroups(keys: string[], _groups: Record<string, CardEntry[]>): string[] {
    return [...keys].sort((a, b) => a.localeCompare(b));
  }

  sortWithinGroup(cards: CardEntry[], setOrder: string[] = []): CardEntry[] {
    return [...cards].sort((a, b) => {
      const [setA, numA] = (a.id ?? '').split('_');
      const [setB, numB] = (b.id ?? '').split('_');
      const nA = parseInt(numA, 10) || 0;
      const nB = parseInt(numB, 10) || 0;

      if (setA === setB) return nA - nB;

      if (setOrder.length) {
        const ia = setOrder.indexOf(setA);
        const ib = setOrder.indexOf(setB);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
      }

      return (setA ?? '').localeCompare(setB ?? '');
    });
  }

  formatTitle(key: string): string {
    return key;
  }
}

// ─── SetSortStrategy ──────────────────────────────────────────────────────────

export class SetSortStrategy extends BaseSortStrategy {
  constructor(private readonly setOrder: string[] = []) {
    super();
  }

  groupBy(card: CardEntry): string {
    return (card.id ?? '').split('_')[0] || 'UNKNOWN';
  }

  sortGroups(keys: string[], _groups: Record<string, CardEntry[]>): string[] {
    if (this.setOrder.length) {
      const ordered: string[] = [];
      for (const k of this.setOrder) {
        if (keys.includes(k)) ordered.push(k);
      }
      for (const k of keys) {
        if (!ordered.includes(k)) ordered.push(k);
      }
      return ordered;
    }
    return [...keys].sort();
  }
}

// ─── CostSortStrategy ─────────────────────────────────────────────────────────

export class CostSortStrategy extends BaseSortStrategy {
  groupBy(card: CardEntry): string {
    const cost = card.data?.Cost;
    if (cost === undefined || cost === null || cost === '') return 'Cost: Unknown';
    return `Cost: ${String(cost)}`;
  }

  sortGroups(keys: string[], _groups: Record<string, CardEntry[]>): string[] {
    const numeric: Array<{ key: string; value: number }> = [];
    const unknown: string[] = [];

    for (const k of keys) {
      const match = k.match(/^Cost: (.+)$/);
      if (match) {
        const value = match[1];
        if (value === 'Unknown') {
          unknown.push(k);
        } else {
          numeric.push({ key: k, value: Number(value) });
        }
      } else {
        unknown.push(k);
      }
    }

    numeric.sort((a, b) => a.value - b.value);
    return [...numeric.map((x) => x.key), ...unknown];
  }
}

// ─── AspectSortStrategy ───────────────────────────────────────────────────────

export class AspectSortStrategy extends BaseSortStrategy {
  groupBy(card: CardEntry): string {
    const aspects = card.data?.Aspects as string[] | undefined;
    return Array.isArray(aspects) && aspects.length ? String(aspects[0]) : 'Unknown';
  }

  sortGroups(keys: string[], _groups: Record<string, CardEntry[]>): string[] {
    const known = keys.filter((k) => k !== 'Unknown').sort((a, b) => a.localeCompare(b));
    const unknown = keys.includes('Unknown') ? ['Unknown'] : [];
    return [...known, ...unknown];
  }
}

// ─── TypeSortStrategy ─────────────────────────────────────────────────────────

export class TypeSortStrategy extends BaseSortStrategy {
  groupBy(card: CardEntry): string {
    return String(card.data?.Type ?? 'Unknown');
  }

  sortGroups(keys: string[], _groups: Record<string, CardEntry[]>): string[] {
    const known = keys.filter((k) => k !== 'Unknown').sort((a, b) => a.localeCompare(b));
    const unknown = keys.includes('Unknown') ? ['Unknown'] : [];
    return [...known, ...unknown];
  }
}

// ─── TraitSortStrategy ────────────────────────────────────────────────────────

export class TraitSortStrategy extends BaseSortStrategy {
  groupBy(card: CardEntry): string {
    const traits = card.data?.Traits as string[] | undefined;
    return Array.isArray(traits) && traits.length ? String(traits[0]) : 'Unknown';
  }

  sortGroups(keys: string[], _groups: Record<string, CardEntry[]>): string[] {
    const known = keys.filter((k) => k !== 'Unknown').sort((a, b) => a.localeCompare(b));
    const unknown = keys.includes('Unknown') ? ['Unknown'] : [];
    return [...known, ...unknown];
  }
}

// ─── CardSortRegistry ─────────────────────────────────────────────────────────

export class CardSortRegistry {
  private readonly strategies = new Map<string, SortStrategy>();

  register(name: string, strategy: SortStrategy): void {
    this.strategies.set(name, strategy);
  }

  get(name: string): SortStrategy | null {
    return this.strategies.get(name) ?? null;
  }

  has(name: string): boolean {
    return this.strategies.has(name);
  }

  getAll(): string[] {
    return Array.from(this.strategies.keys());
  }
}

/** Create a registry pre-loaded with all default strategies. */
export function createDefaultRegistry(setOrder: string[] = []): CardSortRegistry {
  const registry = new CardSortRegistry();
  registry.register('set', new SetSortStrategy(setOrder));
  registry.register('cost', new CostSortStrategy());
  registry.register('aspect', new AspectSortStrategy());
  registry.register('type', new TypeSortStrategy());
  registry.register('trait', new TraitSortStrategy());
  return registry;
}

