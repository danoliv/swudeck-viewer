import type { DeckData } from './types';
import { getSupabaseClient } from './supabase';
import { generateSlug } from './slug';

export interface DeckRow {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  data: DeckData;
  visibility: 'private' | 'unlisted' | 'public';
  created_at: string;
  updated_at: string;
}

type DeckPatch = Partial<Pick<DeckRow, 'name' | 'data' | 'visibility'>>;

const TABLE = 'decks';

/** Sane upper bound on a saved deck's JSON size — guards against abuse, not legitimate decks. */
const MAX_DECK_DATA_BYTES = 200_000;

function assertDeckDataWithinSizeLimit(data: DeckData): void {
  const bytes = new TextEncoder().encode(JSON.stringify(data)).length;
  if (bytes > MAX_DECK_DATA_BYTES) {
    throw new Error(`Deck is too large to save (${bytes} bytes, max ${MAX_DECK_DATA_BYTES}).`);
  }
}

export async function listMyDecks(): Promise<DeckRow[]> {
  const { data, error } = await getSupabaseClient()
    .from(TABLE)
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data as DeckRow[];
}

export async function getDeckBySlug(slug: string): Promise<DeckRow | null> {
  const { data, error } = await getSupabaseClient()
    .from(TABLE)
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data as DeckRow | null;
}

export async function saveDeck(opts: {
  name: string;
  data: DeckData;
  visibility?: DeckRow['visibility'];
}): Promise<DeckRow> {
  assertDeckDataWithinSizeLimit(opts.data);
  const slug = generateSlug();
  const { data, error } = await getSupabaseClient()
    .from(TABLE)
    .insert({ slug, name: opts.name, data: opts.data, visibility: opts.visibility ?? 'unlisted' })
    .select()
    .single();
  if (error) throw error;
  return data as DeckRow;
}

export async function updateDeck(id: string, patch: DeckPatch): Promise<DeckRow> {
  if (patch.data) assertDeckDataWithinSizeLimit(patch.data);
  const { data, error } = await getSupabaseClient()
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as DeckRow;
}

export async function deleteDeck(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

/** Fetch a shared deck by slug and insert a new copy owned by the current user. */
export async function copyDeckToMyAccount(slug: string): Promise<DeckRow> {
  const source = await getDeckBySlug(slug);
  if (!source) throw new Error(`Deck not found: ${slug}`);
  return saveDeck({ name: source.name, data: source.data, visibility: 'private' });
}
