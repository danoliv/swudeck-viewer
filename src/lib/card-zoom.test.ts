import { describe, it, expect } from 'vitest';
import { computeZoomSize, computeZoomPosition } from './card-zoom';

const VIEWPORT = { width: 1200, height: 800 };

describe('computeZoomSize', () => {
  it('scales a portrait card to the max height, keeping the aspect ratio', () => {
    const size = computeZoomSize(0.7, VIEWPORT, { maxWidth: 400, maxHeight: 500 });
    expect(size.height).toBe(500);
    expect(size.width).toBeCloseTo(350);
  });

  it('scales a landscape card (leader/base) to the max width instead', () => {
    const size = computeZoomSize(1.4, VIEWPORT, { maxWidth: 400, maxHeight: 500 });
    expect(size.width).toBe(400);
    expect(size.height).toBeCloseTo(400 / 1.4);
  });

  it('never exceeds the viewport minus the margin', () => {
    const size = computeZoomSize(0.7, { width: 1200, height: 300 }, { maxWidth: 400, maxHeight: 500 }, 10);
    expect(size.height).toBe(280);
  });

  it('falls back to a standard card ratio when the aspect is unknown', () => {
    const size = computeZoomSize(0, VIEWPORT, { maxWidth: 400, maxHeight: 500 });
    expect(size.width / size.height).toBeCloseTo(0.7);
  });
});

describe('computeZoomPosition', () => {
  const size = { width: 300, height: 420 };

  it('places the preview to the right of the pointer, vertically centred on it', () => {
    expect(computeZoomPosition({ x: 100, y: 400 }, VIEWPORT, size, 16)).toEqual({ left: 116, top: 190 });
  });

  it('flips to the left of the pointer when there is no room on the right', () => {
    const pos = computeZoomPosition({ x: 1100, y: 400 }, VIEWPORT, size, 16);
    expect(pos.left).toBe(1100 - 16 - 300);
  });

  it('keeps the preview inside the viewport vertically', () => {
    expect(computeZoomPosition({ x: 100, y: 10 }, VIEWPORT, size, 16).top).toBe(8);
    expect(computeZoomPosition({ x: 100, y: 790 }, VIEWPORT, size, 16).top).toBe(800 - 420 - 8);
  });
});
