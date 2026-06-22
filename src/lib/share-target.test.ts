import { resolveShareTarget } from './share-target';

describe('resolveShareTarget', () => {
  it('returns none when params are empty', () => {
    expect(resolveShareTarget(new URLSearchParams(''))).toEqual({ kind: 'none' });
  });

  it('returns slug when ?id= is present', () => {
    expect(resolveShareTarget(new URLSearchParams('id=abc123'))).toEqual({ kind: 'slug', slug: 'abc123' });
  });

  it('returns encoded when only ?d= is present', () => {
    expect(resolveShareTarget(new URLSearchParams('d=xyz'))).toEqual({ kind: 'encoded', encoded: 'xyz' });
  });

  it('?id= takes precedence over ?d=', () => {
    expect(resolveShareTarget(new URLSearchParams('id=slug1&d=enc1'))).toEqual({
      kind: 'slug',
      slug: 'slug1',
    });
  });
});
