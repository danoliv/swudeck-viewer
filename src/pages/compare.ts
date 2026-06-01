/**
 * src/pages/compare.ts
 * DOM orchestration for the Deck Comparison page.
 *
 * All pure logic lives in src/lib/. No inline onclick= attributes.
 */

import { fetchWithRetry, fetchUsingExternalProxy } from '../lib/api';
import { getDeckIdFromUrl, setQueryParam, setQueryParams } from '../lib/url';
import { fetchCardData, buildComparisonCardHTML } from '../lib/cards';
import { buildDeckCardCounts, deckInfoHTML } from '../lib/deck-info';
import { analyzeDeckDifferences } from '../lib/compare';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeckApiData {
  deck: Array<{ id: string; count?: number }>;
  sideboard?: Array<{ id: string; count?: number }>;
  metadata?: { name?: string };
  error?: string;
}

// ─── State ────────────────────────────────────────────────────────────────────

let deck1Data: DeckApiData | null = null;
let deck2Data: DeckApiData | null = null;

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

// ─── Load deck ────────────────────────────────────────────────────────────────

async function loadDeck(deckNumber: 1 | 2): Promise<void> {
  const urlInput = (el<HTMLInputElement>(`deck${deckNumber}Url`)?.value ?? '').trim();
  const errorDiv = el(`error${deckNumber}`);
  const loading = el(`loading${deckNumber}`);
  const deckInfo = el(`deck${deckNumber}Info`);

  if (errorDiv) errorDiv.textContent = '';
  if (deckInfo) deckInfo.style.display = 'none';
  if (loading) loading.style.display = 'inline';

  try {
    if (!urlInput) throw new Error('No deck URL or ID provided');

    const deckId = getDeckIdFromUrl(urlInput);
    if (!deckId) throw new Error('Invalid SWUDB URL - Could not extract deck ID');

    const targetUrl = `https://swudb.com/api/getDeckJson/${deckId}`;
    const hostname = window.location?.hostname ?? '';
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';
    const preferDirect = localStorage.getItem('useDirectFetch') === 'true';

    const deckData = (
      isLocal || preferDirect
        ? await fetchWithRetry(targetUrl, 3, true)
        : await fetchUsingExternalProxy(targetUrl, 3, true)
    ) as DeckApiData;

    if (!deckData) throw new Error('Server returned empty response');
    if (deckData.error) throw new Error(`API Error: ${deckData.error}`);
    if (!deckData.deck) throw new Error('Invalid deck data format received from server');

    if (deckNumber === 1) deck1Data = deckData;
    else deck2Data = deckData;

    if (deckInfo) {
      deckInfo.innerHTML = deckInfoHTML(deckData);
      deckInfo.style.display = 'block';
    }

    setQueryParam(`deck${deckNumber}`, deckId);

    if (deck1Data && deck2Data) await compareDecks();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (errorDiv) errorDiv.textContent = `Error: ${msg}. Please verify the deck URL is correct.`;
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

// ─── Compare decks ────────────────────────────────────────────────────────────

async function compareDecks(): Promise<void> {
  if (!deck1Data || !deck2Data) return;

  const resultsDiv = el('comparisonResults');
  if (!resultsDiv) return;
  resultsDiv.style.display = 'block';

  const deck1Cards = buildDeckCardCounts(deck1Data);
  const deck2Cards = buildDeckCardCounts(deck2Data);
  const { deck1Only, deck2Only, differentCounts, sameCards } = analyzeDeckDifferences(deck1Cards, deck2Cards);

  const deck1Name = deck1Data.metadata?.name ?? 'Deck 1';
  const deck2Name = deck2Data.metadata?.name ?? 'Deck 2';

  let html = `<h2>Deck Comparison: ${deck1Name} vs ${deck2Name}</h2>`;

  html += `
    <div class="summary-stats">
      <div class="stat-card"><div class="stat-number">${deck1Only.length}</div><div class="stat-label">Only in ${deck1Name}</div></div>
      <div class="stat-card"><div class="stat-number">${deck2Only.length}</div><div class="stat-label">Only in ${deck2Name}</div></div>
      <div class="stat-card"><div class="stat-number">${differentCounts.length}</div><div class="stat-label">Different Counts</div></div>
      <div class="stat-card"><div class="stat-number">${sameCards.length}</div><div class="stat-label">Same Cards</div></div>
    </div>`;

  const renderSection = async (
    title: string,
    cards: Array<{ id: string; [k: string]: unknown }>,
    cssClass: string,
    getArgs: (c: typeof cards[0]) => [number, number, number, number],
  ): Promise<string> => {
    if (cards.length === 0) return '';
    const cardHtmlParts = await Promise.all(
      cards.map(async (card) => {
        const data = await fetchCardData(card.id);
        const [c1m, c2m, c1s, c2s] = getArgs(card);
        return buildComparisonCardHTML(card.id, data, c1m, c2m, cssClass, deck1Name, deck2Name, c1s, c2s);
      }),
    );
    return `
      <div class="comparison-section">
        <div class="comparison-header">${title} (${cards.length} cards)</div>
        <div class="comparison-content"><div class="card-grid">${cardHtmlParts.join('')}</div></div>
      </div>`;
  };

  html += await renderSection(
    `Only in ${deck1Name}`, deck1Only, 'deck1-only',
    (c) => [(c as { main: number }).main, 0, (c as { sideboard: number }).sideboard, 0],
  );
  html += await renderSection(
    `Only in ${deck2Name}`, deck2Only, 'deck2-only',
    (c) => [0, (c as { main: number }).main, 0, (c as { sideboard: number }).sideboard],
  );
  html += await renderSection(
    'Different Counts', differentCounts, 'different-count',
    (c) => {
      const x = c as { deck1Main: number; deck2Main: number; deck1Sideboard: number; deck2Sideboard: number };
      return [x.deck1Main, x.deck2Main, x.deck1Sideboard, x.deck2Sideboard];
    },
  );
  html += await renderSection(
    'Same Cards', sameCards, 'same-card',
    (c) => {
      const x = c as { main: number; sideboard: number };
      return [x.main, x.main, x.sideboard, x.sideboard];
    },
  );

  resultsDiv.innerHTML = html;
}

// ─── Reverse deck order ───────────────────────────────────────────────────────

async function reverseDeckOrder(): Promise<void> {
  if (!deck1Data || !deck2Data) {
    alert('Both decks must be loaded to reverse order');
    return;
  }

  [deck1Data, deck2Data] = [deck2Data, deck1Data];

  const url1 = el<HTMLInputElement>('deck1Url')?.value ?? '';
  const url2 = el<HTMLInputElement>('deck2Url')?.value ?? '';
  const id1 = getDeckIdFromUrl(url1);
  const id2 = getDeckIdFromUrl(url2);

  setQueryParams({ deck1: id2, deck2: id1 });

  const inp1 = el<HTMLInputElement>('deck1Url');
  const inp2 = el<HTMLInputElement>('deck2Url');
  if (inp1) inp1.value = url2;
  if (inp2) inp2.value = url1;

  const info1 = el('deck1Info');
  const info2 = el('deck2Info');
  if (info1 && info2) {
    const tmp = info1.innerHTML;
    info1.innerHTML = info2.innerHTML;
    info2.innerHTML = tmp;
  }

  await compareDecks();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init(): void {
  el('loadDeck1Btn')?.addEventListener('click', () => void loadDeck(1));
  el('loadDeck2Btn')?.addEventListener('click', () => void loadDeck(2));
  el('reverseDeckBtn')?.addEventListener('click', () => void reverseDeckOrder());

  el<HTMLInputElement>('deck1Url')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void loadDeck(1);
  });
  el<HTMLInputElement>('deck2Url')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void loadDeck(2);
  });

  const params = new URLSearchParams(window.location.search);
  const deck1Id = params.get('deck1');
  const deck2Id = params.get('deck2');

  if (deck1Id) {
    const inp = el<HTMLInputElement>('deck1Url');
    if (inp) inp.value = `https://swudb.com/deck/${deck1Id}`;
    void loadDeck(1);
  }
  if (deck2Id) {
    const inp = el<HTMLInputElement>('deck2Url');
    if (inp) inp.value = `https://swudb.com/deck/${deck2Id}`;
    void loadDeck(2);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

