import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js';
import { getSupabaseClient, isBackendEnabled } from './supabase';

export type { User };

export async function getCurrentUser(): Promise<User | null> {
  if (!isBackendEnabled()) return null;
  const { data } = await getSupabaseClient().auth.getUser();
  return data.user;
}

export async function signInWithEmail(email: string, redirectTo?: string): Promise<void> {
  const target = redirectTo ?? `${window.location.origin}${import.meta.env.BASE_URL ?? '/'}`;
  const { error } = await getSupabaseClient().auth.signInWithOtp({ email, options: { emailRedirectTo: target } });
  if (error) throw error;
}

export async function signInWithGoogle(redirectTo?: string): Promise<void> {
  const target = redirectTo ?? `${window.location.origin}${import.meta.env.BASE_URL ?? '/'}`;
  const { error } = await getSupabaseClient().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: target },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  if (!isBackendEnabled()) return;
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) throw error;
}

export function onAuthChange(
  cb: (event: AuthChangeEvent, session: Session | null) => void,
): () => void {
  if (!isBackendEnabled()) return () => {};
  const { data } = getSupabaseClient().auth.onAuthStateChange(cb);
  return () => data.subscription.unsubscribe();
}
