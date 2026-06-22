/**
 * src/pages/builder.ts
 * DOM orchestration for the Deck Builder page.
 *
 * Thin layer: all pure logic lives in src/lib/ (builder-state, card-filter,
 * deck, cards). Deck state is encoded entirely in the `?d=` URL query param
 * (see src/lib/builder-state.ts) — no backend.
 *
 * No inline onclick= attributes — uses addEventListener + event delegation.
 */

import { getQueryParam, setQueryParam } from '../lib/url';
import { loadSets } from '../lib/sets';
import { loadCardSet, buildCardHTML, buildBuilderRowHTML, buildDeckRowHTML, formatCardId, type CardData } from '../lib/cards';
import { createDefaultRegistry, type CardEntry } from '../lib/deck';
import {
  createEmptyDeck,
  decodeDeckState,
  encodeDeckState,
  setFormat,
  setLeader,
  setBase,
  setCardCount,
  getTotalCount,
  moveToSideboard,
  moveToDeck,
} from '../lib/builder-state';
import { loadLegalData, filterLegalCards, type Format, type LegalData } from '../lib/legal';
import { parseSwudbDeckId, fetchSwudbDeck, mapSwudbToDeckData, parseMeleeDecklist, detectFormat } from '../lib/import';
import {
  filterCards,
  getLeaders,
  getBases,
  categorizeBases,
  sortCards,
  combineAspects,
  cardTypeCategory,
  TYPE_CATEGORY_ORDER,
  type CardFilter,
  type CardSortKey,
  type SortDirection,
} from '../lib/card-filter';
import type { DeckData, DeckCard } from '../lib/types';
import { loadLeaderStats, getCardStats } from '../lib/stats';
import { isBackendEnabled } from '../lib/supabase';
import { getCurrentUser, onAuthChange, type User } from '../lib/auth';
import { saveDeck, updateDeck as updateSavedDeck, getDeckBySlug, copyDeckToMyAccount, type DeckRow } from '../lib/decks-api';
import { resolveShareTarget } from '../lib/share-target';

// ─── State ────────────────────────────────────────────────────────────────────

const ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning', 'Villainy', 'Heroism'];
const BASE_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning'];
const NON_POOL_TYPES = ['Leader', 'Base'];

const setOrder = loadSets();
const registry = createDefaultRegistry(setOrder);

const BROWSER_PAGE_SIZE = 50;

/** Group key for a deck-list entry — splits Units into Ground/Space sections. */
function deckSectionKey(entry: CardEntry): string {
  return cardTypeCategory(entry.data ?? {});
}

/**
 * Order deck-list section keys: TYPE_CATEGORY_ORDER first, then remaining keys
 * alphabetically, "Unknown" last. Pass `reverse` to flip the whole order (the
 * "Type" sort bar option's descending direction).
 */
function sortDeckSectionKeys(keys: string[], reverse = false): string[] {
  const ordered = TYPE_CATEGORY_ORDER.filter((k) => keys.includes(k));
  const rest = keys
    .filter((k) => !TYPE_CATEGORY_ORDER.includes(k) && k !== 'Unknown')
    .sort((a, b) => a.localeCompare(b));
  const unknown = keys.includes('Unknown') ? ['Unknown'] : [];
  const result = [...ordered, ...rest, ...unknown];
  return reverse ? result.reverse() : result;
}

/** Sort-bar options shared by the deck, sideboard, and card-browser sort bars. */
const SORT_OPTIONS: Array<{ key: CardSortKey; label: string }> = [
  { key: 'type', label: 'Type' },
  { key: 'set', label: 'Set' },
  { key: 'cost', label: 'Cost' },
  { key: 'aspect', label: 'Affinity' },
  { key: 'name', label: 'Name' },
];

/** A row of clickable sort-key labels; the active one shows an ascending/descending arrow. */
function renderSortBar(scope: 'deck' | 'sideboard' | 'browser', sortKey: CardSortKey, dir: SortDirection): string {
  let html = '<div class="sort-controls"><span class="sort-label">Sort:</span>';
  for (const { key, label } of SORT_OPTIONS) {
    const active = key === sortKey;
    const arrow = active ? (dir === 'asc' ? ' &#9650;' : ' &#9660;') : '';
    html += `<button type="button" data-action="sort-toggle" data-scope="${scope}" data-sort="${key}" class="sort-button${active ? ' active' : ''}">${label}${arrow}</button>`;
  }
  html += '</div>';
  return html;
}

/** Reorder CardEntry[] by the underlying card data, for non-"type" sort keys. */
function sortEntries(entries: CardEntry[], sortKey: CardSortKey, dir: SortDirection): CardEntry[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  return sortCards(entries.map((e) => e.data), sortKey, setOrder, dir).map((d) => byId.get(d.id as string)!);
}

/**
 * Render the card rows for one deck-list zone (main deck or sideboard).
 * - sort = 'type': grouped sections (Ground Units, Space Units, Event,
 *   Upgrade, ...), section order reversed for 'desc'.
 * - any other sort key: a single flat list of rows.
 */
function renderEntryRows(entries: CardEntry[], sortKey: CardSortKey, dir: SortDirection, zone: 'deck' | 'sideboard'): string {
  if (!entries.length) return '';

  if (sortKey === 'type') {
    const strategy = registry.get('type');
    const groups: Record<string, CardEntry[]> = {};
    for (const entry of entries) {
      const key = deckSectionKey(entry);
      (groups[key] ??= []).push(entry);
    }

    const sortedKeys = sortDeckSectionKeys(Object.keys(groups), dir === 'desc');
    let html = '';
    for (const key of sortedKeys) {
      const grp = strategy ? strategy.sortWithinGroup(groups[key], setOrder) : groups[key];
      const total = grp.reduce((sum, e) => sum + (zone === 'sideboard' ? e.sideboardCount : e.count), 0);
      html += `<div class="set-section"><div class="set-title">${key} (${total})</div><div class="card-rows">`;
      for (const entry of grp) {
        const expanded = expandedCards.has(`${zone}:${entry.id}`);
        const stats = getCardStats(deck.leader?.id, deck.metadata?.format, entry.id);
        html += buildDeckRowHTML(entry.id, entry.data, entry.count, entry.sideboardCount, zone, expanded, stats);
      }
      html += '</div></div>';
    }
    return html;
  }

  let html = '<div class="card-rows">';
  for (const entry of sortEntries(entries, sortKey, dir)) {
    const expanded = expandedCards.has(`${zone}:${entry.id}`);
    const stats = getCardStats(deck.leader?.id, deck.metadata?.format, entry.id);
    html += buildDeckRowHTML(entry.id, entry.data, entry.count, entry.sideboardCount, zone, expanded, stats);
  }
  html += '</div>';
  return html;
}

/** localStorage key for the in-progress deck, used to recover it after navigating away and back without a `?d=` link. */
const BUILDER_STORAGE_KEY = 'builderDeck';

/** Restore deck state from the `?d=` URL param, falling back to the last autosaved deck. */
function loadInitialDeck(): DeckData {
  const fromUrl = getQueryParam('d');
  if (fromUrl) return decodeDeckState(fromUrl);

  const saved = localStorage.getItem(BUILDER_STORAGE_KEY);
  return saved ? decodeDeckState(saved) : createEmptyDeck();
}

let deck: DeckData = loadInitialDeck();

/**
 * If the URL has `?id=<slug>` (takes precedence over `?d=`), fetch the saved
 * deck from the backend and adopt it as the working deck. No-op if the
 * backend isn't configured or the URL has no `?id=`.
 */
async function loadFromShareTarget(): Promise<void> {
  if (!isBackendEnabled()) return;
  const target = resolveShareTarget(new URLSearchParams(window.location.search));
  if (target.kind !== 'slug') return;

  try {
    const row = await getDeckBySlug(target.slug);
    if (!row) {
      loadError = 'Deck not found.';
      return;
    }
    deck = row.data;
    savedDeckMeta = { id: row.id, slug: row.slug, ownerId: row.owner_id, visibility: row.visibility };
  } catch (err) {
    loadError = `Failed to load saved deck: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * If a "Save to my account" copy was queued before sign-in (see
 * handleSaveToMyAccount), and the user is now signed in and viewing the
 * same shared deck, perform the copy and adopt the new copy as the
 * working deck.
 */
async function applyPendingCopyIfAny(): Promise<void> {
  if (!currentUser || !savedDeckMeta) return;
  const pendingSlug = localStorage.getItem(PENDING_COPY_KEY);
  if (!pendingSlug || pendingSlug !== savedDeckMeta.slug) return;
  localStorage.removeItem(PENDING_COPY_KEY);

  try {
    const row = await copyDeckToMyAccount(pendingSlug);
    deck = row.data;
    savedDeckMeta = { id: row.id, slug: row.slug, ownerId: row.owner_id, visibility: row.visibility };
    setQueryParam('id', row.slug);
    saveStatus = 'Saved to your account.';
  } catch (err) {
    saveError = `Failed to save to your account: ${err instanceof Error ? err.message : String(err)}`;
  }
}
let rawCards: CardData[] = [];
let allCards: CardData[] = [];
let legalData: LegalData = { premier: { sets: [], bannedCards: [] }, eternal: { bannedCards: [] } };
let filter: CardFilter = {};
let browserSort: CardSortKey = 'cost';
let browserSortDir: SortDirection = 'asc';
let browserPage = 1;

/** Which multi-select filter dropdown (if any) is currently open. */
let openFilterDropdown: 'keywords' | 'traits' | null = null;

let deckSort: CardSortKey = 'cost';
let deckSortDir: SortDirection = 'asc';
let sideboardSort: CardSortKey = 'cost';
let sideboardSortDir: SortDirection = 'asc';

/** Card rows with an open inline detail panel, keyed by `${zone}:${cardId}`. */
const expandedCards = new Set<string>();

let leaderFilter: CardFilter = {};
let leaderSort: CardSortKey = 'set';
let baseFilter: CardFilter = {};
let baseSort: CardSortKey = 'set';

// ─── Backend save state ───────────────────────────────────────────────────────

let currentUser: User | null = null;
/** Set once a deck has been saved/loaded from the backend; null for local-only decks. */
let savedDeckMeta: { id: string; slug: string; ownerId: string; visibility: DeckRow['visibility'] } | null = null;
let saveInProgress = false;
let saveStatus: string | null = null;
let saveError: string | null = null;
/** Set when `?id=<slug>` doesn't resolve to a deck (deleted, private, or typo'd). */
let loadError: string | null = null;

/** localStorage key: a slug queued for copy-to-account once the user signs in (must survive the magic-link/OAuth redirect possibly opening in a new tab — sessionStorage wouldn't). */
const PENDING_COPY_KEY = 'pendingCopySlug';

// ─── Import state ─────────────────────────────────────────────────────────────

let importSwudbValue = '';
let importMeleeValue = '';
let importLoading = false;
let importError: string | null = null;
let importStatus: string | null = null;

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Card pool ────────────────────────────────────────────────────────────────

/** Load every set, dedupe variants, and assign canonical "SET_NNN" IDs. */
async function loadAllCards(): Promise<CardData[]> {
  const cardsById = new Map<string, CardData>();

  for (const set of setOrder) {
    const index = await loadCardSet(set);
    for (const card of Object.values(index)) {
      if (card.VariantType && card.VariantType !== 'Normal') continue;

      const id = formatCardId(set, card.Number ?? '');
      if (!cardsById.has(id)) cardsById.set(id, { ...card, id });
    }
  }

  return Array.from(cardsById.values());
}

function findCard(cardId: string): CardData {
  return allCards.find((c) => c.id === cardId) ?? { id: cardId, Name: cardId };
}

function cardAspects(deckCard: DeckCard | undefined): string[] | undefined {
  return deckCard ? (findCard(deckCard.id).Aspects as string[] | undefined) : undefined;
}

function uniqueFieldValues(field: 'Keywords' | 'Traits'): string[] {
  const values = new Set<string>();
  for (const card of allCards) {
    const arr = card[field] as string[] | undefined;
    if (Array.isArray(arr)) for (const v of arr) values.add(v);
  }
  return Array.from(values).sort();
}

// ─── Leader stats ─────────────────────────────────────────────────────────────

async function fetchAndApplyLeaderStats(leaderId: string): Promise<void> {
  await loadLeaderStats(leaderId);
  if (deck.leader?.id === leaderId) render();
}

// ─── State persistence ────────────────────────────────────────────────────────

function persistDeck(): void {
  const encoded = encodeDeckState(deck);
  setQueryParam('d', encoded);
  localStorage.setItem(BUILDER_STORAGE_KEY, encoded);
}

// ─── Backend save controls ────────────────────────────────────────────────────

function renderSaveControls(): string {
  if (!isBackendEnabled()) return '';

  const isOwner = !savedDeckMeta || (currentUser != null && currentUser.id === savedDeckMeta.ownerId);
  let html = '';

  if (currentUser && isOwner) {
    const label = saveInProgress ? 'Saving…' : savedDeckMeta ? 'Update deck' : 'Save deck';
    html += `<div class="deck-save-row">
      <button type="button" data-action="save-deck"${saveInProgress ? ' disabled' : ''}>${label}</button>`;
    if (savedDeckMeta) {
      html += `<button type="button" data-action="copy-share-link">Copy share link</button>`;
    }
    html += '</div>';
  } else if (savedDeckMeta && !isOwner) {
    html += `<div class="deck-save-row">
      <button type="button" data-action="save-to-account"${saveInProgress ? ' disabled' : ''}>${saveInProgress ? 'Saving…' : 'Save to my account'}</button>
    </div>`;
  }

  if (saveError) {
    html += `<div class="import-error">${escapeAttr(saveError)}
      <button type="button" data-action="dismiss-save-status">&times;</button></div>`;
  } else if (saveStatus) {
    html += `<div class="import-status">${escapeAttr(saveStatus)}
      <button type="button" data-action="dismiss-save-status">&times;</button></div>`;
  }

  return html;
}

async function handleSaveDeck(): Promise<void> {
  if (saveInProgress) return;
  saveInProgress = true;
  saveError = null;
  saveStatus = null;
  const left = el('builderLeft');
  if (left) left.innerHTML = renderLeft();

  try {
    const name = deck.metadata?.name?.trim() || 'Untitled deck';
    if (savedDeckMeta) {
      const row = await updateSavedDeck(savedDeckMeta.id, { name, data: deck });
      savedDeckMeta = { id: row.id, slug: row.slug, ownerId: row.owner_id, visibility: row.visibility };
    } else {
      const row = await saveDeck({ name, data: deck, visibility: 'unlisted' });
      savedDeckMeta = { id: row.id, slug: row.slug, ownerId: row.owner_id, visibility: row.visibility };
      setQueryParam('id', row.slug);
    }
    saveStatus = 'Saved.';
  } catch (err) {
    saveError = `Failed to save: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    saveInProgress = false;
    const leftAfter = el('builderLeft');
    if (leftAfter) leftAfter.innerHTML = renderLeft();
  }
}

/**
 * Copy a shared deck into the current user's account. If logged out,
 * stashes the slug and redirects to sign in, returning to this exact URL
 * afterward (see applyPendingCopyIfAny, called from init()).
 */
async function handleSaveToMyAccount(): Promise<void> {
  if (!savedDeckMeta || saveInProgress) return;

  if (!currentUser) {
    localStorage.setItem(PENDING_COPY_KEY, savedDeckMeta.slug);
    window.location.href = `${import.meta.env.BASE_URL}account.html?return=${encodeURIComponent(window.location.href)}`;
    return;
  }

  saveInProgress = true;
  saveError = null;
  saveStatus = null;
  const left = el('builderLeft');
  if (left) left.innerHTML = renderLeft();

  try {
    const row = await copyDeckToMyAccount(savedDeckMeta.slug);
    deck = row.data;
    savedDeckMeta = { id: row.id, slug: row.slug, ownerId: row.owner_id, visibility: row.visibility };
    setQueryParam('id', row.slug);
    saveStatus = 'Saved to your account.';
  } catch (err) {
    saveError = `Failed to save to your account: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    saveInProgress = false;
    const leftAfter = el('builderLeft');
    if (leftAfter) leftAfter.innerHTML = renderLeft();
  }
}

function handleCopyShareLink(): void {
  if (!savedDeckMeta) return;
  const url = `${window.location.origin}${import.meta.env.BASE_URL}builder.html?id=${savedDeckMeta.slug}`;
  void navigator.clipboard.writeText(url);
  saveError = null;
  saveStatus = 'Share link copied to clipboard.';
  const left = el('builderLeft');
  if (left) left.innerHTML = renderLeft();
}

// ─── Step ─────────────────────────────────────────────────────────────────────

type Step = 'format' | 'leader' | 'base' | 'browser';

function getStep(): Step {
  if (!deck.metadata?.format) return 'format';
  if (!deck.leader) return 'leader';
  if (!deck.base) return 'base';
  return 'browser';
}

/** Recompute `allCards` (the format-legal card pool) from `rawCards`. */
function applyFormatFilter(format: Format | undefined): void {
  allCards = format ? filterLegalCards(rawCards, format, legalData) : [];
}

// ─── Format info ──────────────────────────────────────────────────────────────

const FORMAT_INFO: Record<Format, { label: string; description: string }> = {
  premier: {
    label: 'Premier',
    description: 'Standard rotation — only the most recently released sets are legal.',
  },
  eternal: {
    label: 'Eternal',
    description: 'Every set ever released is legal, aside from a short suspended-cards list.',
  },
};

// ─── Left panel: deck overview ───────────────────────────────────────────────

function renderLeft(): string {
  const name = deck.metadata?.name ?? '';
  const total = getTotalCount(deck);

  let html = '';

  if (loadError) {
    html += `<div class="import-error">${escapeAttr(loadError)}
      <button type="button" data-action="dismiss-load-error">&times;</button></div>`;
  }

  if (importStatus) {
    html += `<div class="import-status">${escapeAttr(importStatus)}
      <button type="button" data-action="dismiss-import-status">&times;</button></div>`;
  }

  html += `
    <div class="deck-name-row">
      <input type="text" id="deckName" placeholder="Unnamed Deck" value="${escapeAttr(name)}">
    </div>
    <div class="deck-total-row">
      <div class="deck-total">Total: ${total} Cards</div>
      <button type="button" data-action="new-deck" class="filter-button">New Deck</button>
    </div>
  `;

  html += renderSaveControls();

  if (deck.metadata?.format) {
    html += `<div class="format-row">Format: ${FORMAT_INFO[deck.metadata.format].label}
      <button type="button" data-action="change-format">Change format</button></div>`;
  }

  if (deck.leader || deck.base) {
    html += '<div class="deck-header">';
    if (deck.leader) {
      html += `<div>${buildCardHTML(deck.leader.id, findCard(deck.leader.id), 0, 0, 'leader-card')}
        <button type="button" data-action="change-leader">Change leader</button></div>`;
    }
    if (deck.base) {
      html += `<div>${buildCardHTML(deck.base.id, findCard(deck.base.id), 0, 0, 'base-card')}
        <button type="button" data-action="change-base">Change base</button></div>`;
    }
    html += '</div>';
  }

  html += renderDeckList();
  return html;
}

function renderDeckList(): string {
  const cardsById = new Map(allCards.map((c) => [c.id as string, c]));
  const entries = new Map<string, CardEntry>();

  for (const c of deck.deck) {
    entries.set(c.id, { id: c.id, count: c.count ?? 1, sideboardCount: 0, data: cardsById.get(c.id) ?? { id: c.id } });
  }
  for (const c of deck.sideboard ?? []) {
    const existing = entries.get(c.id);
    if (existing) {
      existing.sideboardCount = c.count ?? 1;
    } else {
      entries.set(c.id, { id: c.id, count: 0, sideboardCount: c.count ?? 1, data: cardsById.get(c.id) ?? { id: c.id } });
    }
  }

  const deckEntries: CardEntry[] = [];
  const sideboardEntries: CardEntry[] = [];
  for (const entry of entries.values()) {
    if (entry.count > 0) deckEntries.push(entry);
    if (entry.sideboardCount > 0) sideboardEntries.push(entry);
  }

  let html = '<div class="cards-grid">';

  html += renderSortBar('deck', deckSort, deckSortDir);
  if (deckEntries.length) {
    html += renderEntryRows(deckEntries, deckSort, deckSortDir, 'deck');
  } else {
    html += '<div class="deck-list-empty">No cards yet — add some from the right panel.</div>';
  }

  // Sideboard is always shown as a separate section, even when empty.
  const sideboardTotal = sideboardEntries.reduce((sum, e) => sum + e.sideboardCount, 0);
  html += `<div class="set-section sideboard-section"><div class="set-title">Sideboard (${sideboardTotal})</div>`;
  html += renderSortBar('sideboard', sideboardSort, sideboardSortDir);
  if (sideboardEntries.length) {
    html += renderEntryRows(sideboardEntries, sideboardSort, sideboardSortDir, 'sideboard');
  } else {
    html += '<div class="deck-list-empty">No cards in the sideboard.</div>';
  }
  html += '</div>';

  html += '</div>';
  return html;
}

// ─── Right panel: format picker ──────────────────────────────────────────────

function renderFormatPickerShell(): string {
  let html = '<h2>Choose a Format</h2><div class="format-picker">';
  for (const format of Object.keys(FORMAT_INFO) as Format[]) {
    const { label, description } = FORMAT_INFO[format];
    html += `
      <div class="format-option" data-action="select-format" data-format="${format}">
        <h3>${label}</h3>
        <p>${description}</p>
      </div>`;
  }
  html += '</div>';

  html += '<div class="import-panel"><h3>Or import an existing deck</h3>';

  html += `<div class="import-method">
    <label for="importSwudbInput">SWUDB deck URL or ID</label>
    <input type="text" id="importSwudbInput" placeholder="https://swudb.com/deck/..." value="${escapeAttr(importSwudbValue)}"${importLoading ? ' disabled' : ''}>
    <button type="button" data-action="import-swudb"${importLoading ? ' disabled' : ''}>${importLoading ? '<span class="spinner"></span> Importing…' : 'Import from SWUDB'}</button>
  </div>`;

  html += `<div class="import-method">
    <label for="importMeleeInput">Melee.gg decklist (paste text)</label>
    <textarea id="importMeleeInput" rows="6" placeholder="Leader: ...\nBase: ...\n3 Card Name\n..."${importLoading ? ' disabled' : ''}>${escapeAttr(importMeleeValue)}</textarea>
    <button type="button" data-action="import-melee"${importLoading ? ' disabled' : ''}>Import from Melee</button>
  </div>`;

  if (importError) {
    html += `<div class="import-error">${escapeAttr(importError)}</div>`;
  }

  html += '</div>';
  return html;
}

// ─── Right panel: leader / base pickers ──────────────────────────────────────

/** Search + aspect-filter + sort controls shared by the leader and base pickers. */
function renderPickerControls(scope: 'leader' | 'base', pickerFilter: CardFilter, sort: CardSortKey): string {
  let html = '<div class="builder-filters">';
  html += `<input type="text" data-action="picker-search" data-scope="${scope}" placeholder="Search by name..." value="${escapeAttr(pickerFilter.search ?? '')}">`;

  const aspects = scope === 'base' ? BASE_ASPECTS : ASPECTS;
  html += '<div class="filter-group aspect-filters">';
  for (const a of aspects) {
    html += `<button type="button" data-action="picker-filter-toggle" data-scope="${scope}" data-filter="aspects" data-value="${a}" class="aspect-filter-button aspect-icon-${a}${pickerFilter.aspects?.includes(a) ? ' active' : ''}" title="${a}" aria-label="${a}"></button>`;
  }
  html += '</div>';

  html += `<select data-action="picker-sort" data-scope="${scope}">`;
  html += `<option value="set"${sort === 'set' ? ' selected' : ''}>Sort: Set</option>`;
  html += `<option value="cost"${sort === 'cost' ? ' selected' : ''}>Sort: Cost</option>`;
  html += `<option value="aspect"${sort === 'aspect' ? ' selected' : ''}>Sort: Affinity</option>`;
  html += `<option value="name"${sort === 'name' ? ' selected' : ''}>Sort: Name</option>`;
  html += '</select>';

  html += '</div>';
  return html;
}

function renderLeaderPickerShell(): string {
  return `
    <h2>Choose a Leader</h2>
    ${renderPickerControls('leader', leaderFilter, leaderSort)}
    <div id="leaderResults" class="card-grid"></div>
  `;
}

function renderLeaderResults(): void {
  const results = el('leaderResults');
  if (!results) return;

  const filtered = filterCards(getLeaders(allCards), leaderFilter);
  const sorted = sortCards(filtered, leaderSort, setOrder);

  let html = '';
  for (const card of sorted) {
    html += `<div class="picker-card" data-action="select-leader" data-card-id="${card.id}">${buildCardHTML(card.id as string, card, 0)}</div>`;
  }
  results.innerHTML = html || '<div class="deck-list-empty">No leaders match these filters.</div>';
}

function renderBasePickerShell(): string {
  return `
    <h2>Choose a Base</h2>
    ${renderPickerControls('base', baseFilter, baseSort)}
    <div id="baseResults"></div>
  `;
}

function renderBaseResults(): void {
  const results = el('baseResults');
  if (!results) return;

  const filtered = filterCards(getBases(allCards), baseFilter);
  const groups = categorizeBases(filtered);

  const section = (title: string, cards: CardData[]): string => {
    const sorted = sortCards(cards, baseSort, setOrder);
    if (!sorted.length) return '';
    let html = `<div class="base-group"><h3>${title}</h3><div class="card-grid">`;
    for (const card of sorted) {
      html += `<div class="picker-card" data-action="select-base" data-card-id="${card.id}">${buildCardHTML(card.id as string, card, 0)}</div>`;
    }
    html += '</div></div>';
    return html;
  };

  const html = section('Random vanilla', groups.random) + section('Ability bases', groups.ability) + section('Vanilla bases', groups.vanilla);
  results.innerHTML = html || '<div class="deck-list-empty">No bases match these filters.</div>';
}

// ─── Right panel: card browser ───────────────────────────────────────────────

function renderBrowserShell(): string {
  return `
    <h2>Add Cards to Your Deck</h2>
    <div id="browserFilters">${renderFilters()}</div>
    <div id="browserResults" class="card-rows"></div>
    <div id="browserPagination"></div>
  `;
}

/** Render a swudb-style page bar: « ‹ 1 … n-1 n n+1 … N › » */
function renderPagination(current: number, total: number): string {
  if (total <= 1) return '';

  const pages = new Set<number>([1, total]);
  for (let p = current - 2; p <= current + 2; p++) {
    if (p >= 1 && p <= total) pages.add(p);
  }
  const sortedPages = Array.from(pages).sort((a, b) => a - b);

  const pageButton = (page: number, label: string, disabled: boolean): string =>
    `<button type="button" data-action="browser-page" data-page="${page}" class="page-button"${disabled ? ' disabled' : ''}>${label}</button>`;

  let html = '<div class="pagination">';
  html += pageButton(1, '&laquo;', current === 1);
  html += pageButton(current - 1, '&lsaquo;', current === 1);

  let prev = 0;
  for (const p of sortedPages) {
    if (prev && p - prev > 1) html += '<span class="page-ellipsis">&hellip;</span>';
    html += `<button type="button" data-action="browser-page" data-page="${p}" class="page-button${p === current ? ' active' : ''}">${p}</button>`;
    prev = p;
  }

  html += pageButton(current + 1, '&rsaquo;', current === total);
  html += pageButton(total, '&raquo;', current === total);
  html += '</div>';
  return html;
}

/** A "Keywords"/"Traits"-style filter: a toggle button showing the selection count, plus a checkbox-list panel for selecting multiple values. */
function renderFilterDropdown(key: 'keywords' | 'traits', label: string, options: string[]): string {
  const selected = filter[key] ?? [];
  const open = openFilterDropdown === key;
  const buttonLabel = selected.length ? `${label} (${selected.length})` : label;

  let html = `<div class="filter-dropdown" data-dropdown-group="${key}">`;
  html += `<button type="button" data-action="toggle-filter-dropdown" data-dropdown="${key}" class="filter-button filter-dropdown-toggle${selected.length ? ' active' : ''}">${buttonLabel} &#9662;</button>`;
  if (open) {
    html += '<div class="filter-dropdown-panel">';
    if (selected.length) {
      html += `<button type="button" data-action="clear-filter-dropdown" data-filter="${key}" class="filter-dropdown-clear">Clear</button>`;
    }
    for (const value of options) {
      const checked = selected.includes(value) ? ' checked' : '';
      html += `<label class="filter-checkbox"><input type="checkbox" data-action="filter-checkbox" data-filter="${key}" data-value="${escapeAttr(value)}"${checked}> ${value}</label>`;
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function renderFilters(): string {
  const types = ['Unit', 'Upgrade', 'Event'];
  const arenas = ['Ground', 'Space'];
  const keywords = uniqueFieldValues('Keywords');
  const traits = uniqueFieldValues('Traits');
  const allowedAspects = combineAspects(cardAspects(deck.leader), cardAspects(deck.base)) ?? [];

  let html = '<div class="builder-filters">';
  html += `<input type="text" id="cardSearch" placeholder="Search by name..." value="${escapeAttr(filter.search ?? '')}">`;

  html += '<div class="filter-group">';
  html += `<button type="button" data-action="toggle-no-penalty" class="filter-button no-penalty-button${filter.noPenaltyAspects ? ' active' : ''}" title="Show only cards with no aspect penalty for your leader/base">`;
  if (allowedAspects.length) {
    for (const a of allowedAspects) {
      html += `<span class="aspect-icon-mini aspect-icon-${a}" title="${a}"></span>`;
    }
  } else {
    html += 'No Penalty';
  }
  html += '</button>';
  for (const t of types) {
    html += `<button type="button" data-action="filter-toggle" data-filter="types" data-value="${t}" class="filter-button${filter.types?.includes(t) ? ' active' : ''}">${t}</button>`;
  }
  for (const a of arenas) {
    html += `<button type="button" data-action="filter-toggle" data-filter="arenas" data-value="${a}" class="filter-button${filter.arenas?.includes(a) ? ' active' : ''}">${a}</button>`;
  }
  html += '</div>';

  html += '<div class="filter-group aspect-filters">';
  for (const a of ASPECTS) {
    html += `<button type="button" data-action="filter-toggle" data-filter="aspects" data-value="${a}" class="aspect-filter-button aspect-icon-${a}${filter.aspects?.includes(a) ? ' active' : ''}" title="${a}" aria-label="${a}"></button>`;
  }
  html += '</div>';

  html += renderFilterDropdown('keywords', 'Keywords', keywords);
  html += renderFilterDropdown('traits', 'Traits', traits);

  html += '</div>';
  html += `<div id="browserSortBar">${renderSortBar('browser', browserSort, browserSortDir)}</div>`;
  return html;
}

function renderBrowserResults(): void {
  const results = el('browserResults');
  if (!results) return;

  const filtered = filterCards(allCards, filter).filter((c) => !NON_POOL_TYPES.includes(String(c.Type)));
  const sorted = sortCards(filtered, browserSort, setOrder, browserSortDir);
  const deckCounts = new Map(deck.deck.map((c) => [c.id, c.count ?? 1]));
  const sideboardCounts = new Map((deck.sideboard ?? []).map((c) => [c.id, c.count ?? 1]));

  const totalPages = Math.max(1, Math.ceil(sorted.length / BROWSER_PAGE_SIZE));
  browserPage = Math.min(Math.max(browserPage, 1), totalPages);
  const start = (browserPage - 1) * BROWSER_PAGE_SIZE;
  const pageCards = sorted.slice(start, start + BROWSER_PAGE_SIZE);

  let html = '';
  for (const card of pageCards) {
    const id = card.id as string;
    const expanded = expandedCards.has(`browser:${id}`);
    const stats = getCardStats(deck.leader?.id, deck.metadata?.format, id);
    html += buildBuilderRowHTML(id, card, deckCounts.get(id) ?? 0, sideboardCounts.get(id) ?? 0, expanded, stats);
  }
  results.innerHTML = html || '<div class="deck-list-empty">No cards match these filters.</div>';

  const pagination = el('browserPagination');
  if (pagination) pagination.innerHTML = renderPagination(browserPage, totalPages);
}

// ─── Render dispatch ──────────────────────────────────────────────────────────

function renderRight(): void {
  const right = el('builderRight');
  if (!right) return;

  const step = getStep();
  if (step === 'format') {
    right.innerHTML = renderFormatPickerShell();
    return;
  }
  if (step === 'leader') {
    right.innerHTML = renderLeaderPickerShell();
    renderLeaderResults();
    return;
  }
  if (step === 'base') {
    right.innerHTML = renderBasePickerShell();
    renderBaseResults();
    return;
  }

  if (filter.noPenaltyAspects === undefined) {
    filter = { ...filter, noPenaltyAspects: combineAspects(cardAspects(deck.leader), cardAspects(deck.base)) ?? [] };
  }

  right.innerHTML = renderBrowserShell();
  renderBrowserResults();
}

function render(): void {
  const left = el('builderLeft');
  if (left) left.innerHTML = renderLeft();
  renderRight();
}

/** Apply a deck mutation: persist to the URL and re-render efficiently. */
function updateDeck(next: DeckData): void {
  const prevStep = getStep();
  deck = next;
  persistDeck();

  const left = el('builderLeft');
  if (left) left.innerHTML = renderLeft();

  if (getStep() !== prevStep) {
    renderRight();
  } else if (getStep() === 'browser') {
    renderBrowserResults();
  } else {
    renderRight();
  }
}

// ─── Import handlers ────────────────────────────────────────────────────────

/** Apply an imported deck: auto-detect its format, recompute the legal card pool, and reset import UI state. */
function finishImport(imported: DeckData, unmatchedLines: string[] = []): void {
  const format = detectFormat(imported, rawCards, legalData);
  const next: DeckData = { ...imported, metadata: { ...imported.metadata, format } };

  applyFormatFilter(format);
  importSwudbValue = '';
  importMeleeValue = '';
  importError = null;
  importLoading = false;
  importStatus = unmatchedLines.length
    ? `Imported with ${unmatchedLines.length} unrecognized line(s): ${unmatchedLines.join(', ')}`
    : null;

  updateDeck(next);
}

async function handleSwudbImport(): Promise<void> {
  const deckId = parseSwudbDeckId(importSwudbValue);
  if (!deckId) {
    importError = 'Enter a valid SWUDB deck URL or ID.';
    renderRight();
    return;
  }

  importLoading = true;
  importError = null;
  renderRight();

  try {
    const apiData = await fetchSwudbDeck(deckId);
    finishImport(mapSwudbToDeckData(apiData));
  } catch (err) {
    importLoading = false;
    importError = err instanceof Error ? err.message : String(err);
    renderRight();
  }
}

function handleMeleeImport(): void {
  const text = importMeleeValue.trim();
  if (!text) {
    importError = 'Paste a decklist first.';
    renderRight();
    return;
  }

  const { deckData: imported, unmatchedLines } = parseMeleeDecklist(text, rawCards);
  if (!imported.deck.length && !imported.leader && !imported.base) {
    importError = 'Could not recognize any cards in this decklist.';
    renderRight();
    return;
  }

  finishImport(imported, unmatchedLines);
}

function rerenderFiltersPreservingScroll(): void {
  const filtersEl = el('browserFilters');
  if (!filtersEl) return;
  const panel = filtersEl.querySelector<HTMLElement>('.filter-dropdown-panel');
  const scrollTop = panel?.scrollTop ?? 0;
  filtersEl.innerHTML = renderFilters();
  const newPanel = filtersEl.querySelector<HTMLElement>('.filter-dropdown-panel');
  if (newPanel) newPanel.scrollTop = scrollTop;
}

// ─── Filter state ─────────────────────────────────────────────────────────────

function toggleArrayFilterValue(target: CardFilter, key: 'types' | 'arenas' | 'aspects' | 'keywords' | 'traits', value: string): CardFilter {
  const current = target[key] ?? [];
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  return { ...target, [key]: next.length ? next : undefined };
}

function toggleArrayFilter(key: 'types' | 'arenas' | 'aspects', value: string): void {
  filter = toggleArrayFilterValue(filter, key, value);
}

// ─── Event delegation ─────────────────────────────────────────────────────────

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const actionEl = target.closest<HTMLElement>('[data-action]');
  const action = actionEl?.dataset['action'];

  if (openFilterDropdown && action !== 'toggle-filter-dropdown' && !target.closest('.filter-dropdown-panel')) {
    openFilterDropdown = null;
    const filtersEl = el('browserFilters');
    if (filtersEl) filtersEl.innerHTML = renderFilters();
  }

  if (!actionEl) return;

  const cardId = actionEl.dataset['cardId'];

  switch (action) {
    case 'import-swudb':
      void handleSwudbImport();
      return;

    case 'import-melee':
      handleMeleeImport();
      return;

    case 'save-deck':
      void handleSaveDeck();
      return;

    case 'copy-share-link':
      handleCopyShareLink();
      return;

    case 'save-to-account':
      void handleSaveToMyAccount();
      return;

    case 'dismiss-save-status': {
      saveStatus = null;
      saveError = null;
      const left = el('builderLeft');
      if (left) left.innerHTML = renderLeft();
      return;
    }

    case 'dismiss-load-error': {
      loadError = null;
      const left = el('builderLeft');
      if (left) left.innerHTML = renderLeft();
      return;
    }

    case 'dismiss-import-status': {
      importStatus = null;
      const left = el('builderLeft');
      if (left) left.innerHTML = renderLeft();
      return;
    }

    case 'new-deck': {
      if (!window.confirm('Start a new deck? This will clear your current deck.')) return;
      applyFormatFilter(undefined);
      updateDeck(createEmptyDeck());
      return;
    }

    case 'select-format': {
      const format = actionEl.dataset['format'] as Format | undefined;
      if (!format) return;
      applyFormatFilter(format);
      updateDeck(setFormat(deck, format));
      return;
    }

    case 'change-format': {
      const next: DeckData = { deck: [], metadata: { ...deck.metadata } };
      delete next.metadata!.format;
      applyFormatFilter(undefined);
      updateDeck(next);
      return;
    }

    case 'select-leader':
      if (cardId) {
        updateDeck(setLeader(deck, cardId));
        void fetchAndApplyLeaderStats(cardId);
      }
      return;

    case 'select-base':
      if (cardId) updateDeck(setBase(deck, cardId));
      return;

    case 'change-leader': {
      const next = { ...deck };
      delete next.leader;
      updateDeck(next);
      return;
    }

    case 'change-base': {
      const next = { ...deck };
      delete next.base;
      updateDeck(next);
      return;
    }

    case 'set-count': {
      if (!cardId) return;
      const count = Number(actionEl.dataset['count'] ?? '0');
      updateDeck(setCardCount(deck, cardId, count, false));
      return;
    }

    case 'toggle-sideboard': {
      if (!cardId) return;
      const inSideboard = (deck.sideboard ?? []).some((c) => c.id === cardId);
      updateDeck(setCardCount(deck, cardId, inSideboard ? 0 : 1, true));
      return;
    }

    case 'set-sideboard-count': {
      if (!cardId) return;
      const count = Number(actionEl.dataset['count'] ?? '0');
      updateDeck(setCardCount(deck, cardId, count, true));
      return;
    }

    case 'move-to-sideboard':
      if (cardId) updateDeck(moveToSideboard(deck, cardId));
      return;

    case 'move-to-deck':
      if (cardId) updateDeck(moveToDeck(deck, cardId));
      return;

    case 'sort-toggle': {
      const scope = actionEl.dataset['scope'] as 'deck' | 'sideboard' | 'browser' | undefined;
      const sortKey = actionEl.dataset['sort'] as CardSortKey | undefined;
      if (!scope || !sortKey) return;

      const toggle = (currentKey: CardSortKey, currentDir: SortDirection): [CardSortKey, SortDirection] =>
        currentKey === sortKey ? [currentKey, currentDir === 'asc' ? 'desc' : 'asc'] : [sortKey, 'asc'];

      if (scope === 'deck') {
        [deckSort, deckSortDir] = toggle(deckSort, deckSortDir);
        const left = el('builderLeft');
        if (left) left.innerHTML = renderLeft();
      } else if (scope === 'sideboard') {
        [sideboardSort, sideboardSortDir] = toggle(sideboardSort, sideboardSortDir);
        const left = el('builderLeft');
        if (left) left.innerHTML = renderLeft();
      } else {
        [browserSort, browserSortDir] = toggle(browserSort, browserSortDir);
        browserPage = 1;
        const sortBar = el('browserSortBar');
        if (sortBar) sortBar.innerHTML = renderSortBar('browser', browserSort, browserSortDir);
        renderBrowserResults();
      }
      return;
    }

    case 'toggle-detail': {
      const zone = actionEl.dataset['zone'] as 'deck' | 'sideboard' | 'browser' | undefined;
      if (!cardId || !zone) return;

      const key = `${zone}:${cardId}`;
      if (expandedCards.has(key)) {
        expandedCards.delete(key);
      } else {
        expandedCards.add(key);
      }

      if (zone === 'browser') {
        renderBrowserResults();
      } else {
        const left = el('builderLeft');
        if (left) left.innerHTML = renderLeft();
      }
      return;
    }

    case 'toggle-filter-dropdown': {
      const key = actionEl.dataset['dropdown'] as 'keywords' | 'traits' | undefined;
      if (!key) return;
      openFilterDropdown = openFilterDropdown === key ? null : key;
      const filtersEl = el('browserFilters');
      if (filtersEl) filtersEl.innerHTML = renderFilters();
      return;
    }

    case 'clear-filter-dropdown': {
      const key = actionEl.dataset['filter'] as 'keywords' | 'traits' | undefined;
      if (!key) return;
      filter = { ...filter, [key]: undefined };
      browserPage = 1;
      rerenderFiltersPreservingScroll();
      renderBrowserResults();
      return;
    }

    case 'filter-toggle': {
      const filterKey = actionEl.dataset['filter'] as 'types' | 'arenas' | 'aspects' | undefined;
      const value = actionEl.dataset['value'];
      if (!filterKey || !value) return;
      toggleArrayFilter(filterKey, value);
      actionEl.classList.toggle('active');
      browserPage = 1;
      renderBrowserResults();
      return;
    }

    case 'toggle-no-penalty': {
      if (filter.noPenaltyAspects) {
        filter = { ...filter, noPenaltyAspects: undefined };
      } else {
        filter = { ...filter, noPenaltyAspects: combineAspects(cardAspects(deck.leader), cardAspects(deck.base)) ?? [] };
      }
      actionEl.classList.toggle('active');
      browserPage = 1;
      renderBrowserResults();
      return;
    }

    case 'browser-page': {
      const page = Number(actionEl.dataset['page'] ?? '1');
      if (!page || page === browserPage) return;
      browserPage = page;
      renderBrowserResults();
      return;
    }

    case 'picker-filter-toggle': {
      const scope = actionEl.dataset['scope'] as 'leader' | 'base' | undefined;
      const filterKey = actionEl.dataset['filter'] as 'aspects' | undefined;
      const value = actionEl.dataset['value'];
      if (!scope || !filterKey || !value) return;

      actionEl.classList.toggle('active');
      if (scope === 'leader') {
        leaderFilter = toggleArrayFilterValue(leaderFilter, filterKey, value);
        renderLeaderResults();
      } else {
        baseFilter = toggleArrayFilterValue(baseFilter, filterKey, value);
        renderBaseResults();
      }
      return;
    }
  }
});

document.addEventListener('input', (e) => {
  const target = e.target as HTMLElement;

  if (target.id === 'deckName') {
    const value = (target as HTMLInputElement).value;
    deck = { ...deck, metadata: { ...deck.metadata, name: value } };
    persistDeck();
    return;
  }

  if (target.id === 'cardSearch') {
    filter = { ...filter, search: (target as HTMLInputElement).value };
    browserPage = 1;
    renderBrowserResults();
    return;
  }

  if (target.id === 'importSwudbInput') {
    importSwudbValue = (target as HTMLInputElement).value;
    return;
  }

  if (target.id === 'importMeleeInput') {
    importMeleeValue = (target as HTMLTextAreaElement).value;
    return;
  }

  if (target.dataset['action'] === 'picker-search') {
    const scope = target.dataset['scope'];
    const value = (target as HTMLInputElement).value;

    if (scope === 'leader') {
      leaderFilter = { ...leaderFilter, search: value };
      renderLeaderResults();
    } else if (scope === 'base') {
      baseFilter = { ...baseFilter, search: value };
      renderBaseResults();
    }
  }
});

document.addEventListener('change', (e) => {
  const target = e.target as HTMLElement;
  const action = target.dataset['action'];

  if (action === 'picker-sort') {
    const scope = target.dataset['scope'];
    const value = (target as HTMLSelectElement).value as CardSortKey;

    if (scope === 'leader') {
      leaderSort = value;
      renderLeaderResults();
    } else if (scope === 'base') {
      baseSort = value;
      renderBaseResults();
    }
    return;
  }

  if (action !== 'filter-checkbox') return;

  const filterKey = target.dataset['filter'] as 'keywords' | 'traits' | undefined;
  const value = target.dataset['value'];
  if (!filterKey || !value) return;

  filter = toggleArrayFilterValue(filter, filterKey, value);
  browserPage = 1;
  rerenderFiltersPreservingScroll();
  renderBrowserResults();
});

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  const left = el('builderLeft');
  if (left) left.innerHTML = '<div class="loading">Loading card data...</div>';

  const [[cards, legal]] = await Promise.all([
    Promise.all([loadAllCards(), loadLegalData()]),
    loadFromShareTarget(),
  ]);
  rawCards = cards;
  legalData = legal;
  applyFormatFilter(deck.metadata?.format);
  localStorage.setItem(BUILDER_STORAGE_KEY, encodeDeckState(deck));
  render();

  if (deck.leader?.id) void fetchAndApplyLeaderStats(deck.leader.id);

  if (isBackendEnabled()) {
    currentUser = await getCurrentUser();
    await applyPendingCopyIfAny();
    render();
    onAuthChange((_event, session) => {
      currentUser = session?.user ?? null;
      render();
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void init());
} else {
  void init();
}
