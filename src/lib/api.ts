/**
 * src/lib/api.ts
 * CORS-aware fetch helpers for calling the SWUDB API.
 *
 * Rationale: free CORS proxies are unreliable. On localhost we try a direct
 * fetch first; on prod-style origins we iterate over a proxy list.
 * See doc/CORS_FIX.md for background.
 */

export const PROXY = 'https://api.allorigins.win/raw?url=';
export const TIMEOUT_MS = 10_000;

// Ordered list of CORS proxies to attempt. `null` means direct fetch.
const PROXY_LIST: Array<string | null> = [
  'https://api.codetabs.com/v1/proxy?quest=',
  'https://thingproxy.freeboard.io/fetch/',
  'https://cors.bridged.cc/',
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
  'https://api.allorigins.win/get?url=',
];

function isLocalHost(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '';
}

function buildProxyUrl(proxy: string | null, targetUrl: string): string {
  if (!proxy) return targetUrl;
  if (proxy.includes('allorigins')) return `${proxy}${encodeURIComponent(targetUrl)}`;
  if (proxy.includes('codetabs')) return `${proxy}${targetUrl}`;
  if (proxy.includes('corsproxy.io')) return `${proxy}${encodeURIComponent(targetUrl)}`;
  if (proxy.includes('bridged.cc')) return `${proxy}${targetUrl}`;
  if (proxy.endsWith('/fetch/') || proxy.endsWith('/')) return `${proxy}${targetUrl}`;
  return `${proxy}${encodeURIComponent(targetUrl)}`;
}

function withCacheBust(url: string, bypass: boolean): string {
  if (!bypass) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}_t=${Date.now()}`;
}

async function parseResponse(response: Response, proxy: string | null, target: string): Promise<unknown> {
  // AllOrigins /get endpoint wraps the response in { status, contents }
  if (proxy && proxy.includes('allorigins') && target.includes('/get?url=')) {
    const wrapper = await response.json() as { contents?: string };
    if (wrapper?.contents) {
      try { return JSON.parse(wrapper.contents); } catch { return wrapper.contents; }
    }
    throw new Error('AllOrigins returned an unexpected wrapper');
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const json = await response.json() as { contents?: string };
    // AllOrigins /raw may still return a JSON wrapper in some responses
    if (json && typeof (json as Record<string, unknown>).contents === 'string') {
      try { return JSON.parse((json as { contents: string }).contents); } catch { return (json as { contents: string }).contents; }
    }
    return json;
  }

  const text = await response.text();
  try { return JSON.parse(text); } catch { return text; }
}

/**
 * Fetch `targetUrl` through the AllOrigins /raw proxy with retry.
 * Used for simple one-proxy scenarios.
 */
export async function fetchUsingExternalProxy(
  targetUrl: string,
  retries = 3,
  bypassCache = false,
): Promise<unknown> {
  const build = (u: string) => `${PROXY}${encodeURIComponent(u)}`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const url = withCacheBust(targetUrl, bypassCache);
      const response = await fetch(build(url), { signal: controller.signal, cache: 'no-cache' });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`Proxy HTTP ${response.status}`);

      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const wrapper = await response.json() as { contents?: string };
        if (wrapper && typeof wrapper.contents === 'string') {
          try { return JSON.parse(wrapper.contents); } catch { return wrapper.contents; }
        }
        return wrapper;
      }

      const text = await response.text();
      try { return JSON.parse(text); } catch { return text; }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn('fetchUsingExternalProxy attempt failed:', lastError.message);
      await new Promise<void>((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }

  throw new Error(`Proxy fetch failed: ${lastError?.message ?? 'unknown'}`);
}

/**
 * Fetch `url` with automatic proxy fallback.
 *
 * On localhost: tries direct fetch first, then CORS proxies.
 * On other origins: tries CORS proxies only.
 */
export async function fetchWithRetry(
  url: string,
  retries = 3,
  bypassCache = false,
): Promise<unknown> {
  const proxies: Array<string | null> = [
    ...(isLocalHost() ? [null] : []),
    ...PROXY_LIST,
  ];

  let lastError: Error | null = null;

  for (const proxy of proxies) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        console.info(`fetchWithRetry: attempt ${attempt + 1}/${retries} using proxy=${proxy ?? 'direct'}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const target = buildProxyUrl(proxy, withCacheBust(url, bypassCache));
        const response = await fetch(target, {
          signal: controller.signal,
          cache: bypassCache ? 'no-cache' : 'default',
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP error from ${proxy ?? 'direct'} fetch: ${response.status}`);
        }

        return await parseResponse(response, proxy, target);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const msg = lastError.message;
        if (/Failed to fetch|NetworkError|CORS|Access-Control-Allow-Origin/.test(msg)) {
          console.warn(`fetchWithRetry failed (proxy=${proxy ?? 'direct'}): likely CORS/network`, msg);
        } else {
          console.warn(`fetchWithRetry failed (proxy=${proxy ?? 'direct'}):`, msg);
        }
        if (attempt === retries - 1) break;
        await new Promise<void>((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }

  throw new Error(`All attempts failed: ${lastError?.message ?? 'unknown'}`);
}

