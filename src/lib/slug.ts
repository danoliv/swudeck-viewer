const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const SLUG_LENGTH = 10;

/** Generate a random base-62 slug suitable for use as a URL-safe deck share ID. */
export function generateSlug(length = SLUG_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CHARS[b % CHARS.length]).join('');
}
