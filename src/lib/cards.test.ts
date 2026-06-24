import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadCardSet,
  fetchCardData,
  buildCardHTML,
  buildBuilderRowHTML,
  buildDeckRowHTML,
  buildCardDetailHTML,
  buildComparisonCardHTML,
  clearCardCache,
  resolveCardArtUrl,
  formatCardId,
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

const mockVariantSetResponse = {
  data: [
    {
      Number: '172',
      Name: 'Krayt Dragon',
      Type: 'Unit',
      FrontArt: 'https://cdn.swu-db.com/images/cards/SHD/172.png',
    },
    {
      Number: '172F',
      Name: 'Krayt Dragon',
      Type: 'Unit',
      FrontArt: 'https://cdn.swu-db.com/images/cards/SHD/172F.png',
      VariantType: 'Foil',
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

  it('keeps normal cards addressable when foil variants share the same numeric part', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce(JSON.stringify(mockVariantSetResponse));
    const result = await loadCardSet('SHD');
    expect(result['172'].FrontArt).toBe('https://cdn.swu-db.com/images/cards/SHD/172.png');
    expect(result['172F'].FrontArt).toBe('https://cdn.swu-db.com/images/cards/SHD/172F.png');
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

  it('prefers the normal card entry for a base card ID when a foil variant also exists', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce(JSON.stringify(mockVariantSetResponse));
    const cardData = await fetchCardData('SHD_172');
    expect(cardData.FrontArt).toBe('https://cdn.swu-db.com/images/cards/SHD/172.png');
  });

  it('can still resolve an exact foil variant card ID', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce(JSON.stringify(mockVariantSetResponse));
    const cardData = await fetchCardData('SHD_172F');
    expect(cardData.FrontArt).toBe('https://cdn.swu-db.com/images/cards/SHD/172F.png');
    expect(cardData.id).toBe('SHD_172F');
  });
});

describe('resolveCardArtUrl', () => {
  it('normalizes foil art URLs to the base card image URL', () => {
    expect(resolveCardArtUrl('https://cdn.swu-db.com/images/cards/SHD/172F.png'))
      .toBe('https://cdn.swu-db.com/images/cards/SHD/172.png');
  });

  it('leaves normal art URLs unchanged', () => {
    expect(resolveCardArtUrl('https://cdn.swu-db.com/images/cards/SHD/172.png'))
      .toBe('https://cdn.swu-db.com/images/cards/SHD/172.png');
  });
});

// ─── formatCardId ─────────────────────────────────────────────────────────────

describe('formatCardId', () => {
  it('zero-pads numeric card numbers to 3 digits', () => {
    expect(formatCardId('SOR', '82')).toBe('SOR_082');
    expect(formatCardId('SOR', 1)).toBe('SOR_001');
  });

  it('leaves already-padded numbers unchanged', () => {
    expect(formatCardId('JTL', '029')).toBe('JTL_029');
  });

  it('uppercases and preserves letter suffixes', () => {
    expect(formatCardId('SHD', '172f')).toBe('SHD_172F');
    expect(formatCardId('SHD', '172F')).toBe('SHD_172F');
  });

  it('falls back to the raw value when it does not match the expected shape', () => {
    expect(formatCardId('SOR', '')).toBe('SOR_');
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

  it('wires an onerror fallback to the placeholder when FrontArt is set (e.g. a pre-release set whose CDN art 404s)', () => {
    const html = buildCardHTML('SOR_001', card1);
    expect(html).toContain(`onerror="this.style.display='none';this.nextElementSibling.style.display='block'"`);
    expect(html).toContain('class="card-placeholder" style="display:none"');
  });

  it('uses the normalized non-foil art URL when foil art is provided', () => {
    const html = buildCardHTML('SHD_172', { ...card1, FrontArt: 'https://cdn.swu-db.com/images/cards/SHD/172F.png' });
    expect(html).toContain('https://cdn.swu-db.com/images/cards/SHD/172.png');
    expect(html).not.toContain('https://cdn.swu-db.com/images/cards/SHD/172F.png');
  });

  it('applies additional CSS classes to the card wrapper', () => {
    const html = buildCardHTML('SOR_001', card1, 1, 0, 'highlighted');
    expect(html).toContain('class="card highlighted"');
  });
});

// ─── buildBuilderRowHTML ──────────────────────────────────────────────────────

describe('buildBuilderRowHTML', () => {
  it('generates HTML containing the card ID and name', () => {
    const html = buildBuilderRowHTML('SOR_001', card1);
    expect(html).toContain('SOR 001');
    expect(html).toContain('Test Card');
  });

  it('includes aspect mini-icons', () => {
    const html = buildBuilderRowHTML('SOR_001', card1);
    expect(html).toContain('class="card-row-aspects"');
    expect(html).toContain('aspect-icon-mini aspect-icon-Command');
  });

  it('omits the aspects section when Aspects is empty', () => {
    const html = buildBuilderRowHTML('SOR_001', { ...card1, Aspects: [] });
    expect(html).not.toContain('class="card-row-aspects"');
  });

  it('displays a Cost badge when Cost is defined', () => {
    const html = buildBuilderRowHTML('SOR_001', card1);
    expect(html).toContain('class="stat card-row-cost" data-type="Cost"');
    expect(html).toContain('<span class="stat-value">2</span>');
  });

  it('omits the Cost badge when Cost is undefined', () => {
    const html = buildBuilderRowHTML('SOR_001', { ...card1, Cost: undefined });
    expect(html).not.toContain('card-row-cost');
  });

  it('renders 0/1/2/3 quantity buttons with data-action and data-card-id', () => {
    const html = buildBuilderRowHTML('SOR_001', card1, 2);
    expect(html).toContain('data-action="set-count"');
    expect(html).toContain('data-card-id="SOR_001"');
    expect(html).toContain('data-count="0"');
    expect(html).toContain('data-count="1"');
    expect(html).toContain('data-count="2"');
    expect(html).toContain('data-count="3"');
  });

  it('marks the button matching the current count as active', () => {
    const html = buildBuilderRowHTML('SOR_001', card1, 2);
    expect(html).toMatch(/data-count="2" class="quantity-button active"/);
    expect(html).not.toMatch(/data-count="1" class="quantity-button active"/);
  });

  it('renders no active quantity button when count is 0', () => {
    const html = buildBuilderRowHTML('SOR_001', card1, 0);
    expect(html).toMatch(/data-count="0" class="quantity-button active"/);
  });

  it('renders a sideboard toggle with data-action', () => {
    const html = buildBuilderRowHTML('SOR_001', card1);
    expect(html).toContain('data-action="toggle-sideboard"');
    expect(html).toContain('>SB<');
  });

  it('shows the sideboard count and active state when sideboardCount > 0', () => {
    const html = buildBuilderRowHTML('SOR_001', card1, 0, 2);
    expect(html).toContain('SB (2)');
    expect(html).toMatch(/sideboard-toggle active/);
  });

  it('contains no inline onclick attributes', () => {
    const html = buildBuilderRowHTML('SOR_001', card1, 1, 1);
    expect(html).not.toContain('onclick');
  });

  it('renders the card name as a toggle-detail button scoped to the "browser" zone', () => {
    const html = buildBuilderRowHTML('SOR_001', card1);
    expect(html).toContain('data-action="toggle-detail"');
    expect(html).toContain('data-zone="browser"');
  });

  it('appends the card-detail panel only when expanded is true', () => {
    const collapsed = buildBuilderRowHTML('SOR_001', card1, 0, 0, false);
    expect(collapsed).not.toContain('class="card-detail"');
    expect(collapsed).not.toContain('class="card-row expanded"');

    const expanded = buildBuilderRowHTML('SOR_001', card1, 0, 0, true);
    expect(expanded).toContain('class="card-row expanded"');
    expect(expanded).toContain('class="card-detail"');
  });
});

// ─── buildDeckRowHTML ─────────────────────────────────────────────────────────

describe('buildDeckRowHTML', () => {
  it('generates HTML containing the card ID, name, aspects, and cost', () => {
    const html = buildDeckRowHTML('SOR_001', card1, 2, 0, 'deck');
    expect(html).toContain('SOR 001');
    expect(html).toContain('Test Card');
    expect(html).toContain('class="card-row-aspects"');
    expect(html).toContain('aspect-icon-mini aspect-icon-Command');
    expect(html).toContain('class="stat card-row-cost" data-type="Cost"');
  });

  it('contains no inline onclick attributes', () => {
    const html = buildDeckRowHTML('SOR_001', card1, 2, 1, 'deck');
    expect(html).not.toContain('onclick');
  });

  it('renders the card name as a toggle-detail button scoped to the given zone', () => {
    expect(buildDeckRowHTML('SOR_001', card1, 2, 0, 'deck')).toContain('data-zone="deck"');
    expect(buildDeckRowHTML('SOR_001', card1, 0, 2, 'sideboard')).toContain('data-zone="sideboard"');
  });

  it('appends the card-detail panel only when expanded is true', () => {
    const collapsed = buildDeckRowHTML('SOR_001', card1, 2, 0, 'deck', false);
    expect(collapsed).not.toContain('class="card-detail"');
    expect(collapsed).not.toContain('class="card-row expanded"');

    const expanded = buildDeckRowHTML('SOR_001', card1, 2, 0, 'deck', true);
    expect(expanded).toContain('class="card-row expanded"');
    expect(expanded).toContain('class="card-detail"');
  });

  describe('zone: deck', () => {
    it('renders 0/1/2/3 quantity buttons reflecting the main-deck count', () => {
      const html = buildDeckRowHTML('SOR_001', card1, 2, 0, 'deck');
      expect(html).toContain('data-action="set-count"');
      expect(html).toMatch(/data-count="2" class="quantity-button active"/);
      expect(html).not.toMatch(/data-count="0" class="quantity-button active"/);
    });

    it('renders an enabled move-to-sideboard button when the deck has copies and the sideboard has room', () => {
      const html = buildDeckRowHTML('SOR_001', card1, 1, 0, 'deck');
      expect(html).toContain('data-action="move-to-sideboard"');
      expect(html).toContain('data-card-id="SOR_001"');
      expect(html).not.toMatch(/data-action="move-to-sideboard"[^>]*disabled/);
    });

    it('disables move-to-sideboard when the main-deck count is 0', () => {
      const html = buildDeckRowHTML('SOR_001', card1, 0, 0, 'deck');
      expect(html).toMatch(/data-action="move-to-sideboard"[^>]*disabled/);
    });

    it('disables move-to-sideboard when the sideboard is at the 3-copy cap', () => {
      const html = buildDeckRowHTML('SOR_001', card1, 1, 3, 'deck');
      expect(html).toMatch(/data-action="move-to-sideboard"[^>]*disabled/);
    });
  });

  describe('zone: sideboard', () => {
    it('renders 0/1/2/3 quantity buttons reflecting the sideboard count', () => {
      const html = buildDeckRowHTML('SOR_001', card1, 0, 2, 'sideboard');
      expect(html).toContain('data-action="set-sideboard-count"');
      expect(html).toMatch(/data-count="2" class="quantity-button active"/);
      expect(html).not.toMatch(/data-count="0" class="quantity-button active"/);
    });

    it('renders an enabled move-to-deck button when the sideboard has copies and the deck has room', () => {
      const html = buildDeckRowHTML('SOR_001', card1, 0, 1, 'sideboard');
      expect(html).toContain('data-action="move-to-deck"');
      expect(html).toContain('data-card-id="SOR_001"');
      expect(html).not.toMatch(/data-action="move-to-deck"[^>]*disabled/);
    });

    it('disables move-to-deck when the sideboard count is 0', () => {
      const html = buildDeckRowHTML('SOR_001', card1, 0, 0, 'sideboard');
      expect(html).toMatch(/data-action="move-to-deck"[^>]*disabled/);
    });

    it('disables move-to-deck when the main deck is at the 3-copy cap', () => {
      const html = buildDeckRowHTML('SOR_001', card1, 3, 1, 'sideboard');
      expect(html).toMatch(/data-action="move-to-deck"[^>]*disabled/);
    });
  });
});

// ─── buildCardDetailHTML ───────────────────────────────────────────────────────

describe('buildCardDetailHTML', () => {
  it('renders the card name, stats, aspects, and front image', () => {
    const html = buildCardDetailHTML('SOR_001', card1);
    expect(html).toContain('class="card-detail"');
    expect(html).toContain('class="card-detail-name"');
    expect(html).toContain('Test Card');
    expect(html).toContain('Cost: <span class="stat-value">2</span>');
    expect(html).toContain('Power: <span class="stat-value">2</span>');
    expect(html).toContain('HP: <span class="stat-value">2</span>');
    expect(html).toContain('class="aspect Command"');
    expect(html).toContain('<img src="https://example.com/card.png" alt="Test Card (Front)"');
  });

  it('renders type, arenas, and traits in the meta line', () => {
    const html = buildCardDetailHTML('SOR_001', card1);
    expect(html).toContain('class="card-detail-meta"');
    expect(html).toContain('Unit');
    expect(html).toContain('Ground');
    expect(html).toContain('IMPERIAL');
  });

  it('renders FrontText and EpicAction in card-detail-text', () => {
    const card = { ...card1, FrontText: 'Ability text here.', EpicAction: 'Epic Action: Do something.' };
    const html = buildCardDetailHTML('SOR_001', card);
    expect(html).toContain('class="card-detail-text"');
    expect(html).toContain('<p>Ability text here.</p>');
    expect(html).toContain('<p>Epic Action: Do something.</p>');
  });

  it('omits card-detail-text when there is no ability text', () => {
    const html = buildCardDetailHTML('SOR_001', card1);
    expect(html).not.toContain('class="card-detail-text"');
  });

  it('renders the Subtitle when present', () => {
    const card = { ...card1, Subtitle: 'The Mandalorian' };
    const html = buildCardDetailHTML('SOR_001', card);
    expect(html).toContain('class="card-detail-subtitle"');
    expect(html).toContain('The Mandalorian');
  });

  it('omits the subtitle span when Subtitle is absent', () => {
    const html = buildCardDetailHTML('SOR_001', card1);
    expect(html).not.toContain('class="card-detail-subtitle"');
  });

  it('renders the artist credit when Artist is present', () => {
    const card = { ...card1, Artist: 'Jane Doe' };
    const html = buildCardDetailHTML('SOR_001', card);
    expect(html).toContain('class="card-detail-artist"');
    expect(html).toContain('Illustrated by Jane Doe');
  });

  it('omits the artist credit when Artist is absent', () => {
    const html = buildCardDetailHTML('SOR_001', card1);
    expect(html).not.toContain('class="card-detail-artist"');
  });

  it('renders a placeholder when FrontArt is missing', () => {
    const card = { ...card1, FrontArt: undefined };
    const html = buildCardDetailHTML('SOR_001', card);
    expect(html).toContain('class="card-placeholder"');
    expect(html).toContain('SOR_001');
  });

  describe('double-sided cards', () => {
    const doubleSidedCard: CardData = {
      ...card1,
      DoubleSided: true,
      BackArt: 'https://example.com/card-back.png',
      BackText: 'Back side ability text.',
    };

    it('renders a flip button and back image', () => {
      const html = buildCardDetailHTML('SOR_001', doubleSidedCard);
      expect(html).toContain('class="flip-button"');
      expect(html).toContain('Flip Card');
      expect(html).toContain('class="card-back"');
      expect(html).toContain('<img src="https://example.com/card-back.png" alt="Test Card (Back)"');
    });

    it('renders back text prefixed with "Back: "', () => {
      const html = buildCardDetailHTML('SOR_001', doubleSidedCard);
      expect(html).toContain('<p>Back: Back side ability text.</p>');
    });

    it('wires the flip button to toggle .flipped on the closest .card-detail', () => {
      const html = buildCardDetailHTML('SOR_001', doubleSidedCard);
      expect(html).toContain(`onclick="this.closest('.card-detail').classList.toggle('flipped')"`);
    });
  });

  it('omits the flip button and back image for single-sided cards', () => {
    const html = buildCardDetailHTML('SOR_001', card1);
    expect(html).not.toContain('class="flip-button"');
    expect(html).not.toContain('class="card-back"');
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

