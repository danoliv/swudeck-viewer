/**
 * src/lib/card-zoom.ts
 * Hover preview: while the pointer is over a small card image (e.g. a "Best alternatives"
 * thumbnail) a large copy of it floats next to the cursor.
 *
 * `computeZoomSize` / `computeZoomPosition` are pure (unit-tested); `initCardZoom` is the thin
 * DOM layer, using event delegation so it keeps working when the page re-renders its HTML.
 */

export interface Viewport {
  width: number;
  height: number;
}
export interface Size {
  width: number;
  height: number;
}
export interface Point {
  x: number;
  y: number;
}

const DEFAULT_ASPECT = 0.7; // portrait SWU card
const EDGE_MARGIN = 8;
const POINTER_GAP = 16;

/** Size of the preview: as large as the limits (and the viewport) allow, keeping `aspect` (width/height). */
export function computeZoomSize(
  aspect: number,
  viewport: Viewport,
  max: { maxWidth: number; maxHeight: number },
  margin = EDGE_MARGIN,
): Size {
  const ratio = aspect > 0 ? aspect : DEFAULT_ASPECT;
  const maxWidth = Math.min(max.maxWidth, viewport.width - margin * 2);
  const maxHeight = Math.min(max.maxHeight, viewport.height - margin * 2);
  const height = Math.min(maxHeight, maxWidth / ratio);
  return { width: height * ratio, height };
}

/** Top-left of the preview: right of the pointer (left if it would overflow), clamped vertically. */
export function computeZoomPosition(
  pointer: Point,
  viewport: Viewport,
  size: Size,
  gap = POINTER_GAP,
  margin = EDGE_MARGIN,
): { left: number; top: number } {
  const fitsRight = pointer.x + gap + size.width <= viewport.width - margin;
  const left = fitsRight ? pointer.x + gap : Math.max(margin, pointer.x - gap - size.width);
  const top = Math.min(Math.max(pointer.y - size.height / 2, margin), viewport.height - size.height - margin);
  return { left, top };
}

/** Selector of the thumbnails that get a hover preview. */
const ZOOM_TARGET = '.alternative-card-image img';

let initialised = false;

/** Wire the hover preview for every matching thumbnail in the document (idempotent). */
export function initCardZoom(): void {
  if (initialised || typeof document === 'undefined') return;
  initialised = true;

  const preview = document.createElement('img');
  preview.className = 'card-zoom-preview';
  preview.alt = '';
  preview.hidden = true;
  document.body.appendChild(preview);

  let active: HTMLImageElement | null = null;

  const place = (e: MouseEvent): void => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const aspect = active && active.naturalHeight ? active.naturalWidth / active.naturalHeight : 0;
    const size = computeZoomSize(aspect, viewport, { maxWidth: 420, maxHeight: 600 });
    const { left, top } = computeZoomPosition({ x: e.clientX, y: e.clientY }, viewport, size);
    preview.style.width = `${size.width}px`;
    preview.style.height = `${size.height}px`;
    preview.style.left = `${left}px`;
    preview.style.top = `${top}px`;
  };

  const hide = (): void => {
    active = null;
    preview.hidden = true;
    preview.removeAttribute('src');
  };

  document.addEventListener('mouseover', (e) => {
    const img = (e.target as Element | null)?.closest?.(ZOOM_TARGET) as HTMLImageElement | null;
    if (!img || img === active || !img.currentSrc) return;
    active = img;
    preview.src = img.currentSrc;
    preview.hidden = false;
    place(e);
  });

  document.addEventListener('mousemove', (e) => {
    if (active) place(e);
  });

  document.addEventListener('mouseout', (e) => {
    const img = (e.target as Element | null)?.closest?.(ZOOM_TARGET);
    if (img && img === active && !img.contains(e.relatedTarget as Node | null)) hide();
  });

  // The thumbnail can disappear under the cursor on re-render (e.g. "Swap in") without a mouseout.
  document.addEventListener('click', hide, true);
}
