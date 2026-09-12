/**
 * src/lib/builder-state.ts
 * Pure deck-builder state: immutable mutators + URL-safe encode/decode.
 *
 * The in-progress deck lives entirely in a URL query param (base64url JSON,
 * same shape as swudb's "Force Table" export). Every function here is pure —
 * (state, ...args) -> new state — so the deck-builder page can be a thin
 * DOM layer that calls these and re-renders.
 */

import type { DeckData, DeckCard } from './types';
import type { Format } from './legal';

// ─── Base64url helpers (UTF-8 safe) ────────────────────────────────────────────

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64url: string): string {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ─── createEmptyDeck ────────────────────────────────────────────────────────────

/** A fresh, empty deck-in-progress: no leader, no base, no cards. */
export function createEmptyDeck(): DeckData {
  return { deck: [] };
}

// ─── encodeDeckState / decodeDeckState ───────────────────────────────────────

/** Serialize deck state to a URL-safe base64 string. */
export function encodeDeckState(deck: DeckData): string {
  return toBase64Url(JSON.stringify(deck));
}

/**
 * Parse a URL-safe base64 deck state string.
 * Returns an empty deck (never throws) for null/empty/malformed input.
 */
export function decodeDeckState(encoded: string | null | undefined): DeckData {
  if (!encoded) return createEmptyDeck();

  try {
    const parsed = JSON.parse(fromBase64Url(encoded)) as Partial<DeckData>;
    return {
      deck: Array.isArray(parsed.deck) ? parsed.deck : [],
      ...(Array.isArray(parsed.sideboard) ? { sideboard: parsed.sideboard } : {}),
      ...(parsed.metadata ? { metadata: parsed.metadata } : {}),
      ...(parsed.leader ? { leader: parsed.leader } : {}),
      ...(parsed.base ? { base: parsed.base } : {}),
    };
  } catch {
    return createEmptyDeck();
  }
}

// ─── Format ───────────────────────────────────────────────────────────────────

/**
 * Return a new deck with the given format selected.
 * Resets leader/base/deck/sideboard (a format change can make any of them
 * illegal), but preserves deck metadata (name/description/author).
 */
export function setFormat(deck: DeckData, format: Format): DeckData {
  return { deck: [], metadata: { ...deck.metadata, format } };
}

// ─── Leader / Base ────────────────────────────────────────────────────────────

/** Return a new deck with the given leader card ID selected. */
export function setLeader(deck: DeckData, cardId: string): DeckData {
  return { ...deck, leader: { id: cardId, count: 1 } };
}

/** Return a new deck with the given base card ID selected. */
export function setBase(deck: DeckData, cardId: string): DeckData {
  return { ...deck, base: { id: cardId, count: 1 } };
}

// ─── Card count mutators ──────────────────────────────────────────────────────

/**
 * Return a new deck with `cardId`'s count set to `count` in the main deck
 * (or sideboard if `sideboard` is true). A count of 0 or less removes the entry.
 */
export function setCardCount(
  deck: DeckData,
  cardId: string,
  count: number,
  sideboard = false,
): DeckData {
  const key = sideboard ? 'sideboard' : 'deck';
  const list = deck[key] ?? [];

  // Unchanged count: keep the entry (and its ready flag) as is.
  const existing = list.find((c) => c.id === cardId);
  if (existing && count > 0 && (existing.count ?? 1) === count) return deck;

  const next = list.filter((c) => c.id !== cardId);
  if (count > 0) {
    next.push({ id: cardId, count });
  }

  return { ...deck, [key]: next };
}

/** Return a new deck with `cardId`'s count incremented by 1. */
export function addCard(deck: DeckData, cardId: string, sideboard = false): DeckData {
  const list = deck[sideboard ? 'sideboard' : 'deck'] ?? [];
  const existing = list.find((c) => c.id === cardId);
  const current = existing?.count ?? 0;
  return setCardCount(deck, cardId, current + 1, sideboard);
}

/** Return a new deck with `cardId`'s count decremented by 1 (floor 0). */
export function removeCard(deck: DeckData, cardId: string, sideboard = false): DeckData {
  const list = deck[sideboard ? 'sideboard' : 'deck'] ?? [];
  const existing = list.find((c) => c.id === cardId);
  const current = existing?.count ?? 0;
  return setCardCount(deck, cardId, current - 1, sideboard);
}

// ─── Main deck / sideboard moves ──────────────────────────────────────────────

const MAX_COPIES = 3;

function countOf(deck: DeckData, cardId: string, sideboard: boolean): number {
  const list = deck[sideboard ? 'sideboard' : 'deck'] ?? [];
  return list.find((c) => c.id === cardId)?.count ?? 0;
}

/**
 * Set `cardId`'s count in one zone (`'deck'` or `'sideboard'`), enforcing a combined
 * cap of `MAX_COPIES` across both zones: the requested count is clamped to
 * `[0, MAX_COPIES]`, and if that leaves the other zone's existing count over the
 * remaining allowance, the other zone is reduced down to fit (floored at 0).
 */
export function setCombinedCardCount(
  deck: DeckData,
  cardId: string,
  zone: 'deck' | 'sideboard',
  count: number,
): DeckData {
  const clamped = Math.max(0, Math.min(MAX_COPIES, count));
  const otherSideboard = zone === 'deck';
  const otherCount = countOf(deck, cardId, otherSideboard);
  const nextOtherCount = Math.min(otherCount, MAX_COPIES - clamped);

  const next = setCardCount(deck, cardId, clamped, zone === 'sideboard');
  return setCardCount(next, cardId, nextOtherCount, otherSideboard);
}

// ─── Swap ─────────────────────────────────────────────────────────────────────

/**
 * Replace `fromCardId` with `toCardId` in both the main deck and sideboard,
 * preserving whatever counts `fromCardId` had in each zone. If `toCardId`
 * already has copies in a zone, the counts are added together (capped at
 * `MAX_COPIES`). A no-op if `fromCardId` and `toCardId` are the same.
 */
export function swapCard(deck: DeckData, fromCardId: string, toCardId: string): DeckData {
  if (fromCardId === toCardId) return deck;

  const swapZone = (list: DeckCard[] = []): DeckCard[] => {
    const fromEntry = list.find((c) => c.id === fromCardId);
    if (!fromEntry) return list;

    const toEntry = list.find((c) => c.id === toCardId);
    const mergedCount = Math.min(MAX_COPIES, (toEntry?.count ?? 0) + (fromEntry.count ?? 1));
    const rest = list.filter((c) => c.id !== fromCardId && c.id !== toCardId);
    return [...rest, { id: toCardId, count: mergedCount }];
  };

  return {
    ...deck,
    deck: swapZone(deck.deck),
    sideboard: deck.sideboard ? swapZone(deck.sideboard) : deck.sideboard,
  };
}

// ─── Ready flag ───────────────────────────────────────────────────────────────

/**
 * Return a new deck with `cardId`'s `ready` mark flipped in one zone. The mark is
 * per zone (main and sideboard rows are independent) and is stored only when true.
 * A no-op when the card isn't in that zone.
 */
export function toggleCardReady(deck: DeckData, cardId: string, zone: 'deck' | 'sideboard'): DeckData {
  const list = deck[zone] ?? [];
  if (!list.some((c) => c.id === cardId)) return deck;

  const next = list.map((c) => {
    if (c.id !== cardId) return c;
    if (c.ready) {
      const { ready: _ready, ...rest } = c;
      return rest;
    }
    return { ...c, ready: true };
  });
  return { ...deck, [zone]: next };
}

/** Copies marked ready vs. all copies in one zone. */
export function countReady(deck: DeckData, zone: 'deck' | 'sideboard'): { readyCards: number; totalCards: number } {
  return (deck[zone] ?? []).reduce(
    (acc, c) => {
      const n = c.count ?? 1;
      acc.totalCards += n;
      if (c.ready) acc.readyCards += n;
      return acc;
    },
    { readyCards: 0, totalCards: 0 },
  );
}

/** Where ready rows go in a deck list, on top of the active sort. */
export type ReadyPlacement = 'off' | 'top' | 'bottom';

/**
 * Stable partition of an already-sorted list: ready items first ('top') or last
 * ('bottom'), each group keeping its input order. 'off' returns the order unchanged.
 */
export function placeReady<T extends { id: string }>(items: T[], readyIds: ReadonlySet<string>, placement: ReadyPlacement): T[] {
  if (placement === 'off') return [...items];
  const ready = items.filter((i) => readyIds.has(i.id));
  const rest = items.filter((i) => !readyIds.has(i.id));
  return placement === 'top' ? [...ready, ...rest] : [...rest, ...ready];
}

/** Toggle cycle for the deck-list button: off → top → bottom → off. */
export function nextReadyPlacement(placement: ReadyPlacement): ReadyPlacement {
  return placement === 'off' ? 'top' : placement === 'top' ? 'bottom' : 'off';
}

// ─── Totals ───────────────────────────────────────────────────────────────────

/** Sum of all card counts in the main deck (leader/base not included). */
export function getTotalCount(deck: DeckData): number {
  return (deck.deck ?? []).reduce((sum: number, c: DeckCard) => sum + (c.count ?? 1), 0);
}
