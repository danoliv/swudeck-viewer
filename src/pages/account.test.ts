import { describe, it, expect, vi } from 'vitest';
import { getReturnUrl } from './account';

function mockLocation(origin: string, search: string) {
  vi.spyOn(window, 'location', 'get').mockReturnValue({ origin, search } as Location);
}

describe('getReturnUrl', () => {
  it('returns undefined when ?return= is absent', () => {
    mockLocation('https://example.com', '');
    expect(getReturnUrl()).toBeUndefined();
  });

  it('returns the resolved URL for a same-origin absolute return value', () => {
    mockLocation('https://example.com', '?return=https%3A%2F%2Fexample.com%2Fbuilder.html%3Fid%3Dabc');
    expect(getReturnUrl()).toBe('https://example.com/builder.html?id=abc');
  });

  it('returns the resolved URL for a same-origin relative return value', () => {
    mockLocation('https://example.com', '?return=%2Fbuilder.html%3Fid%3Dabc');
    expect(getReturnUrl()).toBe('https://example.com/builder.html?id=abc');
  });

  it('rejects a cross-origin return value', () => {
    mockLocation('https://example.com', '?return=https%3A%2F%2Fattacker.example%2Fphish');
    expect(getReturnUrl()).toBeUndefined();
  });

  it('rejects a protocol-relative return value pointing elsewhere', () => {
    mockLocation('https://example.com', '?return=' + encodeURIComponent('//attacker.example/phish'));
    expect(getReturnUrl()).toBeUndefined();
  });
});
