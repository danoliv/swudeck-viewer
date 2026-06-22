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
