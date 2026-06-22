import { generateSlug } from './slug';

const BASE62 = /^[0-9A-Za-z]+$/;

describe('generateSlug', () => {
  it('returns 10 chars by default', () => {
    expect(generateSlug()).toHaveLength(10);
  });

  it('respects a custom length', () => {
    expect(generateSlug(8)).toHaveLength(8);
  });

  it('contains only base-62 chars', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateSlug()).toMatch(BASE62);
    }
  });

  it('produces unique values', () => {
    const slugs = Array.from({ length: 100 }, () => generateSlug());
    expect(new Set(slugs).size).toBe(100);
  });
});
