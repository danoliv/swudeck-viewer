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
 * Move one copy of `cardId` from the main deck to the sideboard.
 * No-op if the main deck has no copies, or the sideboard is already at the 3-copy cap.
 */
export function moveToSideboard(deck: DeckData, cardId: string): DeckData {
  const deckCount = countOf(deck, cardId, false);
  const sideboardCount = countOf(deck, cardId, true);
  if (deckCount <= 0 || sideboardCount >= MAX_COPIES) return deck;

  const next = setCardCount(deck, cardId, deckCount - 1, false);
  return setCardCount(next, cardId, sideboardCount + 1, true);
}

/**
 * Move one copy of `cardId` from the sideboard to the main deck.
 * No-op if the sideboard has no copies, or the main deck is already at the 3-copy cap.
 */
export function moveToDeck(deck: DeckData, cardId: string): DeckData {
  const deckCount = countOf(deck, cardId, false);
  const sideboardCount = countOf(deck, cardId, true);
  if (sideboardCount <= 0 || deckCount >= MAX_COPIES) return deck;

  const next = setCardCount(deck, cardId, sideboardCount - 1, true);
  return setCardCount(next, cardId, deckCount + 1, false);
}

// ─── Totals ───────────────────────────────────────────────────────────────────

/** Sum of all card counts in the main deck (leader/base not included). */
export function getTotalCount(deck: DeckData): number {
  return (deck.deck ?? []).reduce((sum: number, c: DeckCard) => sum + (c.count ?? 1), 0);
}
