// Simple test runner for SWU Deck Viewer
// This runs tests without requiring npm/Jest installation

const fs = require('fs');
const path = require('path');

// Simple assertion functions
function assert(condition, message) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

function assertEquals(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`Assertion failed: ${message}. Expected: ${expected}, Actual: ${actual}`);
    }
}

function assertArrayEquals(actual, expected, message) {
    if (!Array.isArray(actual) || !Array.isArray(expected)) {
        throw new Error(`Assertion failed: ${message}. Expected arrays but got different types`);
    }
    if (actual.length !== expected.length) {
        throw new Error(`Assertion failed: ${message}. Expected length: ${expected.length}, Actual length: ${actual.length}`);
    }
    for (let i = 0; i < actual.length; i++) {
        if (actual[i] !== expected[i]) {
            throw new Error(`Assertion failed: ${message}. Expected[${i}]: ${expected[i]}, Actual[${i}]: ${actual[i]}`);
        }
    }
}

function assertTrue(condition, message) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

function assertFalse(condition, message) {
    if (condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

// Test runner
class TestRunner {
    constructor() {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }

    test(name, fn) {
        this.tests.push({ name, fn });
    }

    async run() {
        console.log('Running SWU Deck Viewer Tests...\n');
        
        for (const test of this.tests) {
            try {
                await test.fn();
                console.log(`✅ ${test.name}`);
                this.passed++;
            } catch (error) {
                console.log(`❌ ${test.name}`);
                console.log(`   Error: ${error.message}`);
                this.failed++;
            }
        }

        console.log(`\nTest Results: ${this.passed} passed, ${this.failed} failed`);
        return this.failed === 0;
    }
}

// Load the sets module
const { loadSets } = require('./sets.js');

// Create test runner
const runner = new TestRunner();

// Test sets.js module
runner.test('loadSets should return an array', () => {
    const sets = loadSets();
    assertTrue(Array.isArray(sets), 'loadSets should return an array');
});

runner.test('loadSets should return correct set names', () => {
    const sets = loadSets();
    const expectedSets = ['SOR', 'SHD', 'JTL', 'TWI', 'LOF', 'SEC', 'IBH'];
    assertArrayEquals(sets, expectedSets, 'loadSets should return correct set names');
});

runner.test('loadSets should return 7 sets', () => {
    const sets = loadSets();
    assertEquals(sets.length, 7, 'loadSets should return 7 sets');
});

runner.test('loadSets should include all expected sets', () => {
    const sets = loadSets();
    assertTrue(sets.includes('SOR'), 'Should include SOR');
    assertTrue(sets.includes('SHD'), 'Should include SHD');
    assertTrue(sets.includes('JTL'), 'Should include JTL');
    assertTrue(sets.includes('TWI'), 'Should include TWI');
    assertTrue(sets.includes('LOF'), 'Should include LOF');
    assertTrue(sets.includes('SEC'), 'Should include SEC');
    assertTrue(sets.includes('IBH'), 'Should include IBH');
});

runner.test('loadSets should not include unexpected sets', () => {
    const sets = loadSets();
    assertFalse(sets.includes('UNKNOWN'), 'Should not include UNKNOWN');
    assertFalse(sets.includes(''), 'Should not include empty string');
    assertFalse(sets.includes(null), 'Should not include null');
    assertFalse(sets.includes(undefined), 'Should not include undefined');
});

runner.test('loadSets should return consistent results', () => {
    const sets1 = loadSets();
    const sets2 = loadSets();
    assertArrayEquals(sets1, sets2, 'loadSets should return consistent results');
});

runner.test('loadSets should return strings only', () => {
    const sets = loadSets();
    sets.forEach(set => {
        assertTrue(typeof set === 'string', 'Each set should be a string');
        assertTrue(set.length > 0, 'Each set should have non-zero length');
    });
});

// Test card ID parsing
runner.test('should parse valid card IDs correctly', () => {
    const testCases = [
        { id: 'SOR_001', expected: { set: 'SOR', number: 1 } },
        { id: 'SHD_123', expected: { set: 'SHD', number: 123 } },
        { id: 'JTL_045', expected: { set: 'JTL', number: 45 } },
        { id: 'TWI_999', expected: { set: 'TWI', number: 999 } }
    ];

    testCases.forEach(({ id, expected }) => {
        const [set, num] = id.split('_');
        const number = parseInt(num, 10);
        
        assertEquals(set, expected.set, `Set should be ${expected.set} for ${id}`);
        assertEquals(number, expected.number, `Number should be ${expected.number} for ${id}`);
    });
});

runner.test('should handle invalid card ID formats', () => {
    // Test truly invalid formats (not 2 parts)
    const invalidIds = ['SOR', '', 'NOSEPARATOR'];
    
    invalidIds.forEach(id => {
        const parts = id.split('_');
        assertTrue(parts.length !== 2, `Invalid ID ${id} should not have 2 parts`);
    });
    
    // Test edge cases with 2 parts but invalid content
    const edgeCases = ['SOR_', '_001'];
    
    edgeCases.forEach(id => {
        const parts = id.split('_');
        assertTrue(parts.length === 2, `${id} should split into 2 parts`);
        // At least one part should be empty or invalid
        assertTrue(parts[0] === '' || parts[1] === '', `${id} should have empty part`);
    });
});

// Test URL parsing
runner.test('should extract deck ID from SWUDB URL', () => {
    const testUrls = [
        { url: 'https://swudb.com/deck/123', expected: '123' },
        { url: 'https://swudb.com/deck/456', expected: '456' },
        { url: 'https://swudb.com/deck/abc123', expected: 'abc123' }
    ];

    testUrls.forEach(({ url, expected }) => {
        const urlObj = new URL(url);
        const pathSegments = urlObj.pathname.split('/').filter(Boolean);
        const deckId = pathSegments[pathSegments.length - 1];
        assertEquals(deckId, expected, `Deck ID should be ${expected} for ${url}`);
    });
});

// Test card grouping logic
runner.test('should group cards by set', () => {
    const cards = [
        { id: 'SOR_001', count: 2 },
        { id: 'SOR_002', count: 1 },
        { id: 'SHD_001', count: 3 },
        { id: 'JTL_001', count: 1 }
    ];

    const grouped = {};
    cards.forEach(card => {
        const [set] = card.id.split('_');
        if (!grouped[set]) grouped[set] = [];
        grouped[set].push(card);
    });

    assertEquals(grouped.SOR.length, 2, 'SOR should have 2 cards');
    assertEquals(grouped.SHD.length, 1, 'SHD should have 1 card');
    assertEquals(grouped.JTL.length, 1, 'JTL should have 1 card');
});

runner.test('should sort cards within each set by number', () => {
    const cards = [
        { id: 'SOR_003', count: 1 },
        { id: 'SOR_001', count: 2 },
        { id: 'SOR_002', count: 1 }
    ];

    const grouped = {};
    cards.forEach(card => {
        const [set, num] = card.id.split('_');
        if (!grouped[set]) grouped[set] = [];
        grouped[set].push({
            ...card,
            number: parseInt(num, 10)
        });
    });

    // Sort cards within each set
    Object.keys(grouped).forEach(set => {
        grouped[set].sort((a, b) => a.number - b.number);
    });

    assertEquals(grouped.SOR[0].id, 'SOR_001', 'First card should be SOR_001');
    assertEquals(grouped.SOR[1].id, 'SOR_002', 'Second card should be SOR_002');
    assertEquals(grouped.SOR[2].id, 'SOR_003', 'Third card should be SOR_003');
});

// Test cost sorting
runner.test('should sort costs numerically', () => {
    const costs = ['5', '1', '3', 'X', '2'];
    
    const sorted = costs.sort((a, b) => {
        if (a === 'X') return 1;
        if (b === 'X') return -1;
        return parseInt(a) - parseInt(b);
    });

    const expected = ['1', '2', '3', '5', 'X'];
    assertArrayEquals(sorted, expected, 'Costs should be sorted correctly');
});

// Test card data validation
runner.test('should validate card data structure', () => {
    const validCard = {
        Number: "001",
        Name: "Test Card",
        Type: "Unit",
        Aspects: ["Command"],
        Traits: ["IMPERIAL"],
        Arenas: ["Ground"],
        Cost: "2",
        Power: "2",
        HP: "2"
    };

    assertTrue(validCard.Number !== undefined, 'Card should have Number');
    assertTrue(validCard.Name !== undefined, 'Card should have Name');
    assertTrue(validCard.Type !== undefined, 'Card should have Type');
    assertTrue(Array.isArray(validCard.Aspects), 'Aspects should be array');
    assertTrue(Array.isArray(validCard.Traits), 'Traits should be array');
    assertTrue(Array.isArray(validCard.Arenas), 'Arenas should be array');
});

// Run the tests
async function runTests() {
    try {
        const success = await runner.run();
        process.exit(success ? 0 : 1);
    } catch (error) {
        console.error('Test runner error:', error);
        process.exit(1);
    }
}

runTests();
