import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as supabaseModule from './supabase';
import {
  listMyDecks,
  getDeckBySlug,
  saveDeck,
  updateDeck,
  deleteDeck,
  copyDeckToMyAccount,
  type DeckRow,
} from './decks-api';

/**
 * A Postgrest-style query builder is awaitable directly (no .then needed —
 * awaiting a non-thenable object just resolves to that object), so a mock
 * that returns itself from every chain method and carries `data`/`error`
 * properties satisfies `const { data, error } = await client.from(...)...`.
 */
function makeQuery(result: { data: unknown; error: unknown }) {
  const mock: Record<string, unknown> = { data: result.data, error: result.error ?? null };
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'order', 'maybeSingle', 'single']) {
    mock[method] = vi.fn(() => mock);
  }
  return mock;
}

function mockClientReturning(result: { data: unknown; error: unknown }) {
  const query = makeQuery(result);
  const from = vi.fn(() => query);
  vi.spyOn(supabaseModule, 'getSupabaseClient').mockReturnValue({ from } as never);
  return { from, query };
}

const ROW: DeckRow = {
  id: 'id-1',
  owner_id: 'owner-1',
  slug: 'slug1',
  name: 'My Deck',
  data: { deck: [] },
  visibility: 'unlisted',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('listMyDecks', () => {
  it('returns rows on success', async () => {
    mockClientReturning({ data: [ROW], error: null });
    expect(await listMyDecks()).toEqual([ROW]);
  });

  it('throws the Postgrest error', async () => {
    mockClientReturning({ data: null, error: new Error('boom') });
    await expect(listMyDecks()).rejects.toThrow('boom');
  });
});

describe('getDeckBySlug', () => {
  it('returns the row when found', async () => {
    mockClientReturning({ data: ROW, error: null });
    expect(await getDeckBySlug('slug1')).toEqual(ROW);
  });

  it('returns null when not found', async () => {
    mockClientReturning({ data: null, error: null });
    expect(await getDeckBySlug('missing')).toBeNull();
  });
});

describe('saveDeck', () => {
  it('inserts with a generated slug and defaults visibility to unlisted', async () => {
    const { from, query } = mockClientReturning({ data: ROW, error: null });
    const result = await saveDeck({ name: 'My Deck', data: { deck: [] } });

    expect(from).toHaveBeenCalledWith('decks');
    expect(query.insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'My Deck', visibility: 'unlisted', slug: expect.any(String) }),
    );
    expect(result).toEqual(ROW);
  });

  it('respects an explicit visibility', async () => {
    const { query } = mockClientReturning({ data: ROW, error: null });
    await saveDeck({ name: 'My Deck', data: { deck: [] }, visibility: 'private' });
    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'private' }));
  });

  it('rejects an oversized deck before making any network call', async () => {
    const { from } = mockClientReturning({ data: ROW, error: null });
    const oversized = { deck: [{ id: 'x'.repeat(250_000), count: 1 }] };
    await expect(saveDeck({ name: 'Huge', data: oversized })).rejects.toThrow('too large');
    expect(from).not.toHaveBeenCalled();
  });
});

describe('updateDeck', () => {
  it('updates the row by id', async () => {
    const { query } = mockClientReturning({ data: ROW, error: null });
    const result = await updateDeck('id-1', { name: 'Renamed' });
    expect(query.update).toHaveBeenCalledWith({ name: 'Renamed' });
    expect(query.eq).toHaveBeenCalledWith('id', 'id-1');
    expect(result).toEqual(ROW);
  });
});

describe('deleteDeck', () => {
  it('deletes the row by id', async () => {
    const { query } = mockClientReturning({ data: null, error: null });
    await deleteDeck('id-1');
    expect(query.delete).toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith('id', 'id-1');
  });

  it('throws on error', async () => {
    mockClientReturning({ data: null, error: new Error('denied') });
    await expect(deleteDeck('id-1')).rejects.toThrow('denied');
  });
});

describe('copyDeckToMyAccount', () => {
  it('fetches the source deck then saves a private copy with the same name/data', async () => {
    const sourceQuery = makeQuery({ data: ROW, error: null });
    const insertedRow = { ...ROW, id: 'id-2', slug: 'slug2', owner_id: 'owner-2' };
    const insertQuery = makeQuery({ data: insertedRow, error: null });

    let callCount = 0;
    const from = vi.fn(() => {
      callCount += 1;
      return callCount === 1 ? sourceQuery : insertQuery;
    });
    vi.spyOn(supabaseModule, 'getSupabaseClient').mockReturnValue({ from } as never);

    const result = await copyDeckToMyAccount('slug1');

    expect(insertQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: ROW.name, data: ROW.data, visibility: 'private' }),
    );
    expect(result).toEqual(insertedRow);
  });

  it('throws a clear error when the source slug does not exist', async () => {
    mockClientReturning({ data: null, error: null });
    await expect(copyDeckToMyAccount('missing')).rejects.toThrow('Deck not found: missing');
  });
});
