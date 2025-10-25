// Tests for sets.js module
const { loadSets } = require('../sets.js');

describe('sets.js', () => {
  describe('loadSets', () => {
    test('should return an array of set names', () => {
      const sets = loadSets();
      expect(Array.isArray(sets)).toBe(true);
    });

    test('should return the correct set names in order', () => {
      const sets = loadSets();
      const expectedSets = ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'IBH', 'SEC'];
      expect(sets).toEqual(expectedSets);
    });

    test('should return 7 sets', () => {
      const sets = loadSets();
      expect(sets).toHaveLength(7);
    });

    test('should include all expected sets', () => {
      const sets = loadSets();
      expect(sets).toContain('SOR');
      expect(sets).toContain('SHD');
      expect(sets).toContain('JTL');
      expect(sets).toContain('TWI');
      expect(sets).toContain('LOF');
      expect(sets).toContain('SEC');
      expect(sets).toContain('IBH');
    });

    test('should not include unexpected sets', () => {
      const sets = loadSets();
      expect(sets).not.toContain('UNKNOWN');
      expect(sets).not.toContain('');
      expect(sets).not.toContain(null);
      expect(sets).not.toContain(undefined);
    });

    test('should return the same result on multiple calls', () => {
      const sets1 = loadSets();
      const sets2 = loadSets();
      expect(sets1).toEqual(sets2);
    });

    test('should return strings only', () => {
      const sets = loadSets();
      sets.forEach(set => {
        expect(typeof set).toBe('string');
        expect(set.length).toBeGreaterThan(0);
      });
    });
  });
});
