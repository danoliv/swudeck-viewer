/**
 * src/lib/url.ts
 * URL parsing and query-string helpers (pure, no side effects except history push).
 */

/**
 * Extract the deck ID from a full SWUDB URL or a plain ID string.
 * Returns `null` for empty / falsy input.
 */
export function getDeckIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || null;
  } catch {
    // Fallback: naive split for non-URL strings like "deck/123"
    return url.split('/').pop() || null;
  }
}

/**
 * Read a single query parameter from `window.location.search`.
 * Returns `null` if not found or if window is unavailable.
 */
export function getQueryParam(name: string): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  } catch {
    return null;
  }
}

/**
 * Set (or remove) a single query parameter, pushing a new history entry.
 * Pass `null` / `undefined` to remove the key.
 */
export function setQueryParam(name: string, value: string | null | undefined): void {
  const u = new URL(window.location.toString());
  if (value === null || value === undefined) {
    u.searchParams.delete(name);
  } else {
    u.searchParams.set(name, value);
  }
  window.history.pushState({}, '', u.toString());
}

/**
 * Batch-set (or remove) multiple query parameters in a single history push.
 */
export function setQueryParams(obj: Record<string, string | null | undefined>): void {
  const u = new URL(window.location.toString());
  Object.keys(obj).forEach((k) => {
    const v = obj[k];
    if (v === null || v === undefined) {
      u.searchParams.delete(k);
    } else {
      u.searchParams.set(k, v);
    }
  });
  window.history.pushState({}, '', u.toString());
}

