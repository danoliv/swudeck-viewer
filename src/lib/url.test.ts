import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getDeckIdFromUrl,
  getQueryParam,
  setQueryParam,
  setQueryParams,
} from './url';

// ─── getDeckIdFromUrl ─────────────────────────────────────────────────────────

describe('getDeckIdFromUrl', () => {
  it('extracts deck ID from a full SWUDB URL', () => {
    expect(getDeckIdFromUrl('https://swudb.com/deck/123')).toBe('123');
    expect(getDeckIdFromUrl('https://swudb.com/deck/456')).toBe('456');
    expect(getDeckIdFromUrl('https://swudb.com/deck/abc123')).toBe('abc123');
  });

  it('handles URLs with trailing slashes', () => {
    expect(getDeckIdFromUrl('https://swudb.com/deck/123/')).toBe('123');
  });

  it('returns the string itself for plain IDs (no slashes)', () => {
    expect(getDeckIdFromUrl('my-deck-123')).toBe('my-deck-123');
  });

  it('returns null for null input', () => {
    expect(getDeckIdFromUrl(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(getDeckIdFromUrl('')).toBeNull();
  });

  it('extracts ID from complex paths', () => {
    expect(getDeckIdFromUrl('https://swudb.com/api/deck/test-deck-456')).toBe('test-deck-456');
  });

  it('falls back to naive split on non-URL strings', () => {
    expect(getDeckIdFromUrl('not-a-url/deck/789')).toBe('789');
  });
});

// ─── getQueryParam ────────────────────────────────────────────────────────────

describe('getQueryParam', () => {
  beforeEach(() => {
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      search: '?deck=abc&page=2',
      href: 'http://localhost/?deck=abc&page=2',
      hostname: 'localhost',
      pathname: '/',
      toString() { return this.href; },
    } as unknown as Location);
  });

  it('returns the value of an existing param', () => {
    expect(getQueryParam('deck')).toBe('abc');
    expect(getQueryParam('page')).toBe('2');
  });

  it('returns null for a missing param', () => {
    expect(getQueryParam('missing')).toBeNull();
  });
});

// ─── setQueryParam ────────────────────────────────────────────────────────────

describe('setQueryParam', () => {
  let pushState: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    pushState = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      search: '',
      href: 'http://localhost/',
      hostname: 'localhost',
      pathname: '/',
      toString() { return this.href; },
    } as unknown as Location);
    vi.spyOn(window, 'history', 'get').mockReturnValue({ pushState } as unknown as History);
  });

  it('calls history.pushState with the new URL', () => {
    setQueryParam('deck', '123');
    expect(pushState).toHaveBeenCalledOnce();
    const [, , newUrl] = pushState.mock.calls[0] as [unknown, unknown, string];
    expect(newUrl).toContain('deck=123');
  });

  it('removes the param when value is null', () => {
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      search: '?deck=old',
      href: 'http://localhost/?deck=old',
      hostname: 'localhost',
      pathname: '/',
      toString() { return this.href; },
    } as unknown as Location);

    setQueryParam('deck', null);
    const [, , newUrl] = pushState.mock.calls[0] as [unknown, unknown, string];
    expect(newUrl).not.toContain('deck');
  });

  it('does not throw', () => {
    expect(() => setQueryParam('x', 'y')).not.toThrow();
  });
});

// ─── setQueryParams ───────────────────────────────────────────────────────────

describe('setQueryParams', () => {
  let pushState: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    pushState = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      search: '?a=1',
      href: 'http://localhost/?a=1',
      hostname: 'localhost',
      pathname: '/',
      toString() { return this.href; },
    } as unknown as Location);
    vi.spyOn(window, 'history', 'get').mockReturnValue({ pushState } as unknown as History);
  });

  it('sets multiple params in one pushState call', () => {
    setQueryParams({ deck: 'abc', view: 'grid' });
    expect(pushState).toHaveBeenCalledOnce();
    const [, , newUrl] = pushState.mock.calls[0] as [unknown, unknown, string];
    expect(newUrl).toContain('deck=abc');
    expect(newUrl).toContain('view=grid');
  });

  it('removes params set to null', () => {
    setQueryParams({ a: null });
    const [, , newUrl] = pushState.mock.calls[0] as [unknown, unknown, string];
    expect(newUrl).not.toContain('a=');
  });
});

