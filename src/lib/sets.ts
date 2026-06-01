/**
 * src/lib/sets.ts
 * Single source of truth for SWU set codes and their canonical order.
 *
 * Order matters: it drives card sorting in the deck viewer, preload order
 * in the card module, and iteration in fetch-sets.
 */

import setCodes from './sets.json';

export const SETS: readonly string[] = [...setCodes] as const;

/**
 * Return the ordered list of set codes.
 * Returning a new array each call keeps the source constant immutable.
 */
export function loadSets(): string[] {
  return [...SETS];
}
