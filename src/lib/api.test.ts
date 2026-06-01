import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { fetchUsingExternalProxy, fetchWithRetry, PROXY, TIMEOUT_MS } from './api';

// jest-fetch-mock is enabled globally via test-setup.js
// `fetch` is available as a mock.

beforeEach(() => {
  // Ensure we always appear to be on localhost so direct-fetch runs first.
  vi.spyOn(window, 'location', 'get').mockReturnValue({
    hostname: 'localhost',
    search: '',
    href: 'http://localhost/',
    pathname: '/',
    toString() { return this.href; },
  } as unknown as Location);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── constants ────────────────────────────────────────────────────────────────

describe('constants', () => {
  it('PROXY points to allorigins raw endpoint', () => {
    expect(PROXY).toContain('allorigins.win/raw');
  });

  it('TIMEOUT_MS is a positive number', () => {
    expect(TIMEOUT_MS).toBeGreaterThan(0);
  });
});

// ─── fetchUsingExternalProxy ──────────────────────────────────────────────────

describe('fetchUsingExternalProxy', () => {
  it('fetches JSON directly when content-type is json', async () => {
    const mockData = { test: 'data' };
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce(JSON.stringify(mockData), {
      headers: { 'content-type': 'application/json' },
    });

    const result = await fetchUsingExternalProxy('https://example.com/api');

    expect(fetch).toHaveBeenCalled();
    expect(result).toEqual(mockData);
  });

  it('unwraps AllOrigins JSON wrapper containing `contents`', async () => {
    const wrapper = { contents: JSON.stringify({ data: 'value' }) };
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce(JSON.stringify(wrapper), {
      headers: { 'content-type': 'application/json' },
    });

    const result = await fetchUsingExternalProxy('https://example.com/api');
    expect(result).toEqual({ data: 'value' });
  });

  it('retries on network failure then succeeds', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectOnce(new Error('Network error'));
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce(JSON.stringify({ success: true }), {
      headers: { 'content-type': 'application/json' },
    });

    const result = await fetchUsingExternalProxy('https://example.com/api');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ success: true });
  });

  it('throws after exhausting all retries', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockReject(new Error('Failed'));
    await expect(fetchUsingExternalProxy('https://example.com/api', 2)).rejects.toThrow('Proxy fetch failed');
  });

  it('handles plain-text response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce('plain text', {
      headers: { 'content-type': 'text/plain' },
    });

    const result = await fetchUsingExternalProxy('https://example.com/api');
    expect(result).toBe('plain text');
  });

  it('adds cache-bust parameter when bypassCache=true', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce(JSON.stringify({}));

    await fetchUsingExternalProxy('https://example.com/api?param=value', 3, true);

    const callUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    // The target URL is encoded inside the proxy URL — _t= should appear
    expect(callUrl).toContain('_t%3D');
  });
});

// ─── fetchWithRetry ───────────────────────────────────────────────────────────

describe('fetchWithRetry', () => {
  it('fetches successfully returning JSON', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce(JSON.stringify({ data: 'test' }), {
      headers: { 'content-type': 'application/json' },
    });

    const result = await fetchWithRetry('https://example.com/api');
    expect(result).toEqual({ data: 'test' });
  });

  it('tries direct fetch first on localhost', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce(JSON.stringify({ local: true }));

    await fetchWithRetry('https://example.com/api');

    expect(fetch).toHaveBeenCalledWith(
      'https://example.com/api',
      expect.any(Object),
    );
  });

  it('falls through to proxy on localhost direct-fetch failure', async () => {
    // Direct fetch fails; proxy succeeds
    (fetch as ReturnType<typeof vi.fn>).mockRejectOnce(new Error('Network error'));
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce(JSON.stringify({ proxied: true }));

    const result = await fetchWithRetry('https://example.com/api', 1);
    expect(result).toBeDefined();
  });

  it('handles AllOrigins /get wrapper on non-localhost', async () => {
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      hostname: 'production.com',
      search: '',
      href: 'http://production.com/',
      pathname: '/',
      toString() { return this.href; },
    } as unknown as Location);

    const wrapper = { contents: JSON.stringify({ data: 'wrapped' }) };
    (fetch as ReturnType<typeof vi.fn>).mockResponseOnce(JSON.stringify(wrapper), {
      headers: { 'content-type': 'application/json' },
    });

    const result = await fetchWithRetry('https://example.com/api', 1);
    expect(result).toBeDefined();
  });
});

