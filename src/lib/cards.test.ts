import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadCardSet,
  fetchCardData,
  buildCardHTML,
  buildComparisonCardHTML,
  clearCardCache,
} from './cards';
import type { CardData } from './cards';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockSetResponse = {
  data: [
    {
      Number: '1',
      Name: 'Test Card',
      Type: 'Unit',
      Aspects: ['Command'],
      Traits: ['IMPERIAL'],
      Arenas: ['Ground'],
      Cost: '2',
      Power: '2',
      HP: '2',
      FrontArt: 'https://example.com/card.png',
    },
    {
      Number: '2',
      Name: 'Test Card 2',
      Type: 'Event',
      Aspects: ['Aggression'],
      Traits: [],
      Arenas: [],
      Cost: '1',
    },
  ],
};

const card1 = mockSetResponse.data[0] as CardData;

beforeEach(() => {
  (fetch as ReturnType<typeof vi.fn>).resetMocks();
  vi.clearAllMocks();
  clearCardCache();
});

// ─── loadCardSet ──────────────────────────────────────────────────────────────

describe('loadCardSet', () => {
  it('loads and caches set data indexed by card number', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce(JSON.stringify(mockSetResponse));
    const result = await loadCardSet('SOR');
    expect(fetch).toHaveBeenCalledWith('data/sor.json');
    expect(result[1]).toBeDefined();
    expect(result[1].Name).toBe('Test Card');
  });

  it('returns cached data on subsequent calls without extra fetch', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce(JSON.stringify(mockSetResponse));
    await loadCardSet('SOR');
    await loadCardSet('SOR');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('indexes cards by their numeric Number', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce(JSON.stringify(mockSetResponse));
    const result = await loadCardSet('SOR');
    expect(result[1].Number).toBe('1');
    expect(result[2].Number).toBe('2');
  });

  it('throws on HTTP error', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce('Not found', { status: 404 });
    await expect(loadCardSet('NOTFOUND')).rejects.toThrow('Failed to load NOTFOUND data: 404');
  });

  it('throws on network error', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectOnce(new Error('Network error'));
    await expect(loadCardSet('INVALID')).rejects.toThrow();
  });
});

// ─── fetchCardData ────────────────────────────────────────────────────────────

describe('fetchCardData', () => {
  it('fetches card data by compound ID', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce(JSON.stringify(mockSetResponse));
    const cardData = await fetchCardData('SOR_1');
    expect(cardData.id).toBe('SOR_1');
    expect(cardData.Name).toBe('Test Card');
    expect(cardData.Type).toBe('Unit');
  });

  it('attaches the card ID to the returned data', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce(JSON.stringify(mockSetResponse));
    const cardData = await fetchCardData('SOR_1');
    expect(cardData.id).toBe('SOR_1');
  });

  it('returns a stub for a card number not in the set', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce(JSON.stringify(mockSetResponse));
    const cardData = await fetchCardData('SOR_999');
    expect(cardData.id).toBe('SOR_999');
    expect(cardData.Name).toBe('SOR_999');
    expect(cardData.Type).toBe('Unknown');
  });

  it('returns a stub on network error', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectOnce(new Error('Network error'));
    const cardData = await fetchCardData('SOR_1');
    expect(cardData.id).toBe('SOR_1');
    expect(cardData.Type).toBe('Unknown');
  });

  it('calls fetch with the correct path', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce(JSON.stringify(mockSetResponse));
    await fetchCardData('SOR_1');
    expect(fetch).toHaveBeenCalledWith('data/sor.json');
  });
});

// ─── buildCardHTML ────────────────────────────────────────────────────────────

describe('buildCardHTML', () => {
  it('generates HTML containing the card ID and name', () => {
    const html = buildCardHTML('SOR_001', card1, 1);
    expect(html).toContain('SOR 001');
    expect(html).toContain('Test Card');
    expect(html).toContain('Deck: 1');
  });

  it('includes aspects', () => {
    const html = buildCardHTML('SOR_001', card1);
    expect(html).toContain('aspects');
    expect(html).toContain('Command');
  });

  it('omits aspects section when Aspects is empty', () => {
    const html = buildCardHTML('SOR_001', { ...card1, Aspects: [] });
    expect(html).not.toContain('class="aspects"');
  });

  it('displays Cost, Power, and HP stats', () => {
    const html = buildCardHTML('SOR_001', card1);
    expect(html).toContain('Cost');
    expect(html).toContain('Power');
    expect(html).toContain('HP');
    expect(html).toContain('>2<');
  });

  it('shows both deck and sideboard counts', () => {
    const html = buildCardHTML('SOR_001', card1, 2, 1);
    expect(html).toContain('Deck: 2');
    expect(html).toContain('Side: 1');
  });

  it('shows only sideboard count when main count is 0', () => {
    const html = buildCardHTML('SOR_001', card1, 0, 2);
    expect(html).toContain('Side: 2');
    expect(html).not.toContain('Deck:');
  });

  it('renders flip button and back art for double-sided cards', () => {
    const html = buildCardHTML('SOR_001', { ...card1, DoubleSided: true, BackArt: 'https://example.com/back.png' });
    expect(html).toContain('flip-button');
    expect(html).toContain('Flip Card');
    expect(html).toContain('card-back');
  });

  it('renders a placeholder when FrontArt is missing', () => {
    const html = buildCardHTML('SOR_001', { ...card1, FrontArt: undefined });
    expect(html).toContain('card-placeholder');
    expect(html).toContain('SOR_001');
  });

  it('applies additional CSS classes to the card wrapper', () => {
    const html = buildCardHTML('SOR_001', card1, 1, 0, 'highlighted');
    expect(html).toContain('class="card highlighted"');
  });
});

// ─── buildComparisonCardHTML ──────────────────────────────────────────────────

describe('buildComparisonCardHTML', () => {
  it('generates comparison HTML with counts from both decks', () => {
    const html = buildComparisonCardHTML('SOR_001', card1, 2, 1, 'both');
    expect(html).toContain('Test Card');
    expect(html).toContain('Deck 1: 2');
    expect(html).toContain('Deck 2: 1');
  });

  it('applies comparison type as a CSS class', () => {
    const html = buildComparisonCardHTML('SOR_001', card1, 2, 0, 'deck1-only');
    expect(html).toContain('class="card deck1-only"');
  });

  it('uses custom deck names', () => {
    const html = buildComparisonCardHTML('SOR_001', card1, 2, 1, 'both', 'My Deck', 'Other Deck');
    expect(html).toContain('My Deck: 2');
    expect(html).toContain('Other Deck: 1');
  });

  it('shows sideboard counts in comparison', () => {
    const html = buildComparisonCardHTML('SOR_001', card1, 2, 1, 'both', 'Deck 1', 'Deck 2', 1, 1);
    expect(html).toContain('(1 side)');
  });

  it('shows only deck 1 when deck 2 count is 0', () => {
    const html = buildComparisonCardHTML('SOR_001', card1, 2, 0);
    expect(html).toContain('Deck 1: 2');
    expect(html).not.toContain('Deck 2');
  });

  it('shows only deck 2 when deck 1 count is 0', () => {
    const html = buildComparisonCardHTML('SOR_001', card1, 0, 3);
    expect(html).toContain('Deck 2: 3');
    expect(html).not.toContain('Deck 1');
  });
});

// ─── clearCardCache ───────────────────────────────────────────────────────────

describe('clearCardCache', () => {
  it('forces a re-fetch after clearing', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce(JSON.stringify(mockSetResponse));
    await loadCardSet('SOR');

    clearCardCache();

    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce(JSON.stringify(mockSetResponse));
    await loadCardSet('SOR');

    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

