import { describe, it, expect } from 'vitest';
import { SETS, loadSets } from './sets';

describe('SETS constant', () => {
  it('is an array', () => {
    expect(Array.isArray(SETS)).toBe(true);
  });

  it('contains exactly 9 sets', () => {
    expect(SETS).toHaveLength(9);
  });

  it('contains all expected set codes', () => {
    const expected = ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'IBH', 'SEC', 'LAW', 'TS26'];
    for (const code of expected) {
      expect(SETS).toContain(code);
    }
  });

  it('does not contain empty strings, null, or undefined', () => {
    expect(SETS).not.toContain('');
    expect(SETS).not.toContain(null);
    expect(SETS).not.toContain(undefined);
  });

  it('has the correct canonical order', () => {
    expect([...SETS]).toEqual(['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'IBH', 'SEC', 'LAW', 'TS26']);
  });
});

describe('loadSets', () => {
  it('returns an array', () => {
    expect(Array.isArray(loadSets())).toBe(true);
  });

  it('returns the correct set names in canonical order', () => {
    expect(loadSets()).toEqual(['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'IBH', 'SEC', 'LAW', 'TS26']);
  });

  it('returns 9 sets', () => {
    expect(loadSets()).toHaveLength(9);
  });

  it('returns strings only with length > 0', () => {
    for (const set of loadSets()) {
      expect(typeof set).toBe('string');
      expect(set.length).toBeGreaterThan(0);
    }
  });

  it('returns the same result on multiple calls (pure)', () => {
    expect(loadSets()).toEqual(loadSets());
  });

  it('returns a new array each call (does not expose mutable internals)', () => {
    const a = loadSets();
    const b = loadSets();
    expect(a).not.toBe(b); // different references
    expect(a).toEqual(b);  // same content
  });

  it('does not include unexpected set codes', () => {
    const sets = loadSets();
    expect(sets).not.toContain('UNKNOWN');
    expect(sets).not.toContain('');
  });
});

