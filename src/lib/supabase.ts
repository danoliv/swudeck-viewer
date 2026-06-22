import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function isBackendEnabled(): boolean {
  return !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;
}

export function getSupabaseClient(): SupabaseClient {
  if (!isBackendEnabled()) {
    throw new Error('Supabase backend is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing)');
  }
  if (!_client) {
    _client = createClient(
      import.meta.env.VITE_SUPABASE_URL as string,
      import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    );
  }
  return _client;
}

/** For unit tests only — reset the singleton between test cases. */
export function _resetClientForTesting(): void {
  _client = null;
}
