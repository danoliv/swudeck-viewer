/**
 * Resolve which deck source to load from a URL's search params.
 * `?id=<slug>` (persistent, backend-saved) takes precedence over
 * `?d=<encoded>` (instant URL-encoded state).
 */
export type ShareTarget =
  | { kind: 'slug'; slug: string }
  | { kind: 'encoded'; encoded: string }
  | { kind: 'none' };

export function resolveShareTarget(params: URLSearchParams): ShareTarget {
  const slug = params.get('id');
  if (slug) return { kind: 'slug', slug };
  const encoded = params.get('d');
  if (encoded) return { kind: 'encoded', encoded };
  return { kind: 'none' };
}
