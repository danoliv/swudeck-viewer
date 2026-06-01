/**
 * src/pages/index.ts
 * DOM orchestration for the main Deck Viewer page.
 *
 * Thin layer: all pure logic lives in src/lib/.
 * No inline onclick= attributes — uses addEventListener + event delegation.
 */

import { fetchWithRetry, fetchUsingExternalProxy } from '../lib/api';
import { getDeckIdFromUrl } from '../lib/url';
import { loadSets } from '../lib/sets';
import { fetchCardData, buildCardHTML, clearCardCache } from '../lib/cards';
import { groupCards, createDefaultRegistry, type CardEntry } from '../lib/deck';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecentDeck {
  url: string;
  name: string;
  leaderArt: string | null;
  baseAspect: string;
  date: string;
}

interface DeckApiData {
  deck: Array<{ id: string; count?: number }>;
  sideboard?: Array<{ id: string; count?: number }>;
  metadata?: { name?: string };
  leader?: { id: string; FrontArt?: string };
  secondleader?: { id: string };
  base?: { id: string };
  error?: string;
}

// ─── State ────────────────────────────────────────────────────────────────────

const MAX_RECENT_DECKS = 8;
let recentDecks: RecentDeck[] = JSON.parse(localStorage.getItem('recentDecks') ?? '[]');
let selectedDecks: string[] = [];
let currentDeckCards: CardEntry[] = [];

const setOrder = loadSets();
const registry = createDefaultRegistry(setOrder);

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function showLoading(visible: boolean): void {
  const span = el('loading');
  if (span) span.style.display = visible ? 'inline' : 'none';
}

function showError(msg: string): void {
  const div = el('error');
  if (div) div.textContent = msg;
}

function clearOutput(): void {
  const out = el('output');
  if (out) out.innerHTML = '';
}

// ─── Recent decks ─────────────────────────────────────────────────────────────

function updateRecentDecksUI(): void {
  const container = el('recentDecks');
  if (!container) return;

  if (recentDecks.length === 0) {
    container.style.display = 'none';
    return;
  }

  let html = '<div class="recent-decks-title">Recent Decks:</div>';
  html += '<div class="quick-compare-section" style="margin-bottom: 15px; padding: 10px; background: #e8f4fd; border-radius: 4px;">';
  html += '<strong>Quick Compare:</strong> Select two decks to compare them instantly. ';
  html += '<button data-action="quick-compare" style="background: #0066cc; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer;">Compare Selected</button>';
  html += '</div>';
  html += '<div class="recent-decks-list">';

  for (const deck of recentDecks) {
    const leaderImg = deck.leaderArt
      ? `<img src="${deck.leaderArt}" alt="Leader" onerror="this.style.display='none'">`
      : '';
    html += `<div class="recent-deck-container" style="position: relative;">
      <button data-action="load-deck-from-url" data-url="${deck.url}" class="recent-deck-btn">
        <div class="aspect ${deck.baseAspect} recent-deck-base-bg"></div>
        <div class="recent-deck-name"><span>${deck.name || 'Unnamed Deck'}</span></div>
        ${leaderImg}
      </button>
      <input type="checkbox" data-action="toggle-deck-selection" data-url="${deck.url}"
             class="deck-checkbox"
             style="position: absolute; top: 8px; left: 8px; z-index: 10; width: 16px; height: 16px; cursor: pointer;">
    </div>`;
  }

  html += '</div>';
  container.innerHTML = html;
  container.style.display = 'block';
}

async function addToRecentDecks(url: string, deckData: DeckApiData): Promise<void> {
  const dateStr = new Date().toLocaleDateString();
  const leaderArt = deckData.leader?.FrontArt
    ?? (deckData.leader ? `https://cdn.swu-db.com/images/cards/${deckData.leader.id.replace('_', '/')}.png` : null);

  let baseAspect = 'Command';
  if (deckData.base?.id) {
    try {
      const baseCardData = await fetchCardData(deckData.base.id);
      const aspects = baseCardData?.Aspects as string[] | undefined;
      if (Array.isArray(aspects) && aspects.length > 0) baseAspect = aspects[0];
    } catch {
      // ignore
    }
  }

  recentDecks = recentDecks.filter((d) => d.url !== url);
  recentDecks.unshift({
    url,
    name: deckData.metadata?.name ?? 'Unnamed Deck',
    leaderArt,
    baseAspect,
    date: dateStr,
  });
  if (recentDecks.length > MAX_RECENT_DECKS) {
    recentDecks = recentDecks.slice(0, MAX_RECENT_DECKS);
  }

  localStorage.setItem('recentDecks', JSON.stringify(recentDecks));
  updateRecentDecksUI();
}

// ─── Deck selection (quick compare) ──────────────────────────────────────────

function handleDeckSelection(url: string, checkbox: HTMLInputElement): void {
  const container = checkbox.closest('.recent-deck-container') as HTMLElement | null;

  if (checkbox.checked) {
    if (selectedDecks.length < 2) {
      selectedDecks.push(url);
      container?.classList.add('selected');
    } else {
      checkbox.checked = false;
      alert('You can only select 2 decks for comparison. Uncheck another deck first.');
    }
  } else {
    selectedDecks = selectedDecks.filter((d) => d !== url);
    container?.classList.remove('selected');
  }

  updateCompareButton();
}

function updateCompareButton(): void {
  const btn = document.querySelector<HTMLButtonElement>('[data-action="quick-compare"]');
  if (!btn) return;
  if (selectedDecks.length === 2) {
    btn.textContent = 'Compare Selected (2)';
    btn.style.background = '#00a651';
  } else {
    btn.textContent = `Compare Selected (${selectedDecks.length}/2)`;
    btn.style.background = '#0066cc';
  }
}

function handleQuickCompare(): void {
  if (selectedDecks.length !== 2) {
    alert('Please select exactly 2 decks to compare.');
    return;
  }

  const deck1Id = selectedDecks[0].split('/').pop();
  const deck2Id = selectedDecks[1].split('/').pop();
  window.open(`${import.meta.env.BASE_URL}compare.html?deck1=${deck1Id}&deck2=${deck2Id}`, '_blank');

  selectedDecks = [];
  document.querySelectorAll<HTMLInputElement>('.deck-checkbox').forEach((cb) => {
    cb.checked = false;
    (cb.closest('.recent-deck-container') as HTMLElement | null)?.classList.remove('selected');
  });
  updateCompareButton();
}

// ─── Sorting / rendering ──────────────────────────────────────────────────────

async function displaySortedCards(sortType = 'set'): Promise<string> {
  if (currentDeckCards.length === 0) return '';

  const strategy = registry.get(sortType);
  if (!strategy) {
    console.warn(`Sort strategy "${sortType}" not found, falling back to "set".`);
    return displaySortedCards('set');
  }

  const groups: Record<string, CardEntry[]> = {};
  for (const card of currentDeckCards) {
    const key = strategy.groupBy(card);
    if (!groups[key]) groups[key] = [];
    groups[key].push(card);
  }

  const sortedKeys = strategy.sortGroups(Object.keys(groups), groups);

  let html = '<div class="cards-grid">';
  for (const key of sortedKeys) {
    const grp = strategy.sortWithinGroup(groups[key], setOrder);
    html += `<div class="set-section">`;
    html += `<div class="set-title">${strategy.formatTitle(key)}</div>`;
    html += `<div class="card-grid">`;
    for (const card of grp) {
      html += buildCardHTML(card.id, card.data, card.count, card.sideboardCount);
    }
    html += '</div></div>';
  }
  html += '</div>';
  return html;
}

async function resortCards(type: string, btn?: HTMLButtonElement): Promise<void> {
  document.querySelectorAll<HTMLButtonElement>('.sort-button').forEach((b) => b.classList.remove('active'));
  btn?.classList.add('active');

  const output = el('output');
  if (!output) return;

  const cardsHtml = await displaySortedCards(type);
  const headerEnd = output.innerHTML.indexOf('<div class="cards-grid">');
  if (headerEnd >= 0) {
    output.innerHTML = output.innerHTML.slice(0, headerEnd) + cardsHtml;
  } else {
    output.innerHTML += cardsHtml;
  }
}

// ─── Display deck ─────────────────────────────────────────────────────────────

async function displayDeck(deckData: DeckApiData, grouped: ReturnType<typeof groupCards>): Promise<void> {
  const deckUrl = el<HTMLInputElement>('deckUrl')?.value.trim() ?? '';
  let html = `<h2><a href="${deckUrl}" target="_blank" style="color: inherit; text-decoration: none; border-bottom: 1px dotted #666;">${deckData.metadata?.name ?? 'Unnamed Deck'}</a></h2>`;

  html += `
    <div class="sort-controls">
      <span class="sort-label">Group by:</span>
      <button class="sort-button active" data-action="resort" data-sort-type="set">Set &amp; Number</button>
      <button class="sort-button" data-action="resort" data-sort-type="cost">Cost</button>
      <button class="sort-button" data-action="resort" data-sort-type="aspect">Aspect</button>
      <button class="sort-button" data-action="resort" data-sort-type="type">Card Type</button>
      <button class="sort-button" data-action="resort" data-sort-type="trait">Traits</button>
    </div>`;

  if (deckData.leader || deckData.secondleader || deckData.base) {
    html += '<div class="deck-header"><div class="section-title">Leaders &amp; Base</div>';
    if (deckData.leader) html += buildCardHTML(deckData.leader.id, await fetchCardData(deckData.leader.id));
    if (deckData.secondleader) html += buildCardHTML(deckData.secondleader.id, await fetchCardData(deckData.secondleader.id));
    if (deckData.base) html += buildCardHTML(deckData.base.id, await fetchCardData(deckData.base.id));
    html += '</div>';
  }

  const cardMap = new Map<string, CardEntry>();

  for (const cards of Object.values(grouped)) {
    for (const card of cards) {
      const data = await fetchCardData(card.id);
      cardMap.set(card.id, { id: card.id, count: card.count, sideboardCount: 0, data });
    }
  }

  if (Array.isArray(deckData.sideboard) && deckData.sideboard.length > 0) {
    const groupedSide = groupCards(deckData.sideboard, setOrder);
    for (const cards of Object.values(groupedSide)) {
      for (const card of cards) {
        const existing = cardMap.get(card.id);
        if (existing) {
          existing.sideboardCount = card.count;
        } else {
          const data = await fetchCardData(card.id);
          cardMap.set(card.id, { id: card.id, count: 0, sideboardCount: card.count, data });
        }
      }
    }
  }

  currentDeckCards = Array.from(cardMap.values());
  html += await displaySortedCards('set');

  const output = el('output');
  if (output) output.innerHTML = html;
}

// ─── Load deck ────────────────────────────────────────────────────────────────

async function loadDeckById(deckId: string, bypassCache = false): Promise<void> {
  showError('');
  clearOutput();
  showLoading(true);

  try {
    if (!deckId) throw new Error('No deck ID provided');

    const targetUrl = `https://swudb.com/api/getDeckJson/${deckId}`;
    const hostname = window.location?.hostname ?? '';
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';
    const preferDirect = localStorage.getItem('useDirectFetch') === 'true';

    const deckData = (
      isLocal || preferDirect
        ? await fetchWithRetry(targetUrl, 3, bypassCache)
        : await fetchUsingExternalProxy(targetUrl, 3, bypassCache)
    ) as DeckApiData;

    if (!deckData) throw new Error('Server returned empty response');
    if (deckData.error) throw new Error(`API Error: ${deckData.error}`);
    if (!deckData.deck) throw new Error('Invalid deck data format received from server');

    try {
      await addToRecentDecks(`https://swudb.com/deck/${deckId}`, deckData);
    } catch {
      // non-fatal
    }

    const grouped = groupCards(deckData.deck, setOrder);
    await displayDeck(deckData, grouped);

    window.history.pushState({}, '', `?deck=${deckId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showError(`Error: ${msg}. Please verify the deck ID is correct and try again.`);
  } finally {
    showLoading(false);
  }
}

async function loadDeck(): Promise<void> {
  showError('');
  clearOutput();
  showLoading(true);

  try {
    const urlInput = el<HTMLInputElement>('deckUrl')?.value.trim() ?? '';
    if (!urlInput) throw new Error('No deck URL or ID provided');

    const deckId = getDeckIdFromUrl(urlInput);
    if (!deckId) throw new Error('Could not extract deck ID from input');

    await loadDeckById(deckId);
    window.history.pushState({}, '', `?deck=${deckId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showError(`Error: ${msg}. Please verify the deck URL is correct and try again.`);
  } finally {
    showLoading(false);
  }
}

async function loadDeckFromUrl(url: string): Promise<void> {
  const input = el<HTMLInputElement>('deckUrl');
  if (input) input.value = url;
  const deckId = getDeckIdFromUrl(url);
  if (deckId) await loadDeckById(deckId, true);
}

function clearSetCache(): void {
  clearCardCache();
  recentDecks = [];
  localStorage.removeItem('recentDecks');
  updateRecentDecksUI();
}

// ─── Event delegation ─────────────────────────────────────────────────────────

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const actionEl = target.closest<HTMLElement>('[data-action]');
  if (!actionEl) return;

  const action = actionEl.dataset['action'];

  if (action === 'resort') {
    const sortType = actionEl.dataset['sortType'] ?? 'set';
    void resortCards(sortType, actionEl as HTMLButtonElement);
    return;
  }

  if (action === 'load-deck-from-url') {
    const url = actionEl.dataset['url'];
    if (url) void loadDeckFromUrl(url);
    return;
  }

  if (action === 'quick-compare') {
    handleQuickCompare();
    return;
  }
});

document.addEventListener('change', (e) => {
  const target = e.target as HTMLElement;
  if (target.dataset['action'] === 'toggle-deck-selection') {
    const url = target.dataset['url'];
    if (url) handleDeckSelection(url, target as HTMLInputElement);
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────

function init(): void {
  // Wire up static buttons
  el('loadDeckBtn')?.addEventListener('click', () => void loadDeck());
  el('clearCacheBtn')?.addEventListener('click', () => clearSetCache());

  // Also handle Enter key in the URL input
  el<HTMLInputElement>('deckUrl')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void loadDeck();
  });

  // Check for ?deck= in URL
  const deckId = new URLSearchParams(window.location.search).get('deck');
  if (deckId) {
    const input = el<HTMLInputElement>('deckUrl');
    if (input) input.value = `https://swudb.com/deck/${deckId}`;
    void loadDeckById(deckId);
  }

  updateRecentDecksUI();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}


