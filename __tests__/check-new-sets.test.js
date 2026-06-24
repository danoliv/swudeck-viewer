// @vitest-environment node
const { isExpansionSet, mergeSets, parseReleaseDate } = require('../scripts/check-new-sets.js');

describe('isExpansionSet', () => {
  test('accepts a real expansion set', () => {
    expect(isExpansionSet({ setId: 'ASH', fullName: 'Ashes of the Empire', releaseDate: '7/27/26' })).toBe(true);
  });

  test('rejects sets with a parentSetId', () => {
    expect(isExpansionSet({ setId: 'PTWI', fullName: 'Twilight of the Republic - Prerelease Promos', releaseDate: '11/1/24', parentSetId: 'TWI' })).toBe(false);
  });

  test('rejects sets without a release date', () => {
    expect(isExpansionSet({ setId: 'SS1', fullName: 'Store Showdown - 1' })).toBe(false);
  });

  test.each([
    ['2026 Promos'],
    ['2025 Judge Promos'],
    ['Store Showdown - 2 (Judge)'],
    ['2025 Gift Box'],
    ['Gamegenic'],
    ['2024 Conventions Exclusives'],
  ])('rejects non-expansion product: %s', (fullName) => {
    expect(isExpansionSet({ setId: 'X', fullName, releaseDate: '1/1/25' })).toBe(false);
  });
});

describe('parseReleaseDate', () => {
  test('parses M/D/YY into a Date', () => {
    const d = parseReleaseDate('7/27/26');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6); // 0-indexed
    expect(d.getDate()).toBe(27);
  });
});

describe('mergeSets', () => {
  const allEntries = [
    { setId: 'SOR', fullName: 'Spark of Rebellion', releaseDate: '3/8/24' },
    { setId: 'SHD', fullName: 'Shadows of the Galaxy', releaseDate: '7/12/24' },
    { setId: 'ASH', fullName: 'Ashes of the Empire', releaseDate: '7/27/26' },
    { setId: 'P26', fullName: '2026 Promos' }, // no releaseDate, excluded
  ];

  test('returns no additions when nothing new', () => {
    const { merged, added } = mergeSets(['SOR', 'SHD', 'ASH'], allEntries);
    expect(added).toEqual([]);
    expect(merged).toEqual(['SOR', 'SHD', 'ASH']);
  });

  test('appends new expansion sets in release-date order', () => {
    const { merged, added } = mergeSets(['SOR'], allEntries);
    expect(added).toEqual(['SHD', 'ASH']);
    expect(merged).toEqual(['SOR', 'SHD', 'ASH']);
  });

  test('never adds non-expansion products', () => {
    const { added } = mergeSets([], allEntries);
    expect(added).not.toContain('P26');
  });
});
