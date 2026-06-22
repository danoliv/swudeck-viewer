import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as supabaseModule from './supabase';
import { getCurrentUser, signInWithEmail, signInWithGitHub, signOut, onAuthChange } from './auth';

function mockAuthClient(overrides: Record<string, unknown> = {}) {
  const auth = {
    getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
    signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    ...overrides,
  };
  vi.spyOn(supabaseModule, 'getSupabaseClient').mockReturnValue({ auth } as never);
  return auth;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('getCurrentUser', () => {
  it('returns null without calling the client when the backend is disabled', async () => {
    vi.spyOn(supabaseModule, 'isBackendEnabled').mockReturnValue(false);
    const getClient = vi.spyOn(supabaseModule, 'getSupabaseClient');
    expect(await getCurrentUser()).toBeNull();
    expect(getClient).not.toHaveBeenCalled();
  });

  it('returns the session user when enabled', async () => {
    vi.spyOn(supabaseModule, 'isBackendEnabled').mockReturnValue(true);
    const user = { id: 'u1', email: 'a@test.com' };
    mockAuthClient({ getUser: vi.fn().mockResolvedValue({ data: { user } }) });
    expect(await getCurrentUser()).toEqual(user);
  });
});

describe('signInWithEmail', () => {
  it('defaults emailRedirectTo to the site root', async () => {
    const auth = mockAuthClient();
    await signInWithEmail('a@test.com');
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'a@test.com',
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
  });

  it('honors an explicit redirectTo override', async () => {
    const auth = mockAuthClient();
    await signInWithEmail('a@test.com', 'https://example.com/builder.html?id=abc');
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'a@test.com',
      options: { emailRedirectTo: 'https://example.com/builder.html?id=abc' },
    });
  });

  it('throws on error', async () => {
    mockAuthClient({ signInWithOtp: vi.fn().mockResolvedValue({ error: new Error('rate limited') }) });
    await expect(signInWithEmail('a@test.com')).rejects.toThrow('rate limited');
  });
});

describe('signInWithGitHub', () => {
  it('honors an explicit redirectTo override', async () => {
    const auth = mockAuthClient();
    await signInWithGitHub('https://example.com/builder.html?id=abc');
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'github',
      options: { redirectTo: 'https://example.com/builder.html?id=abc' },
    });
  });
});

describe('signOut', () => {
  it('does nothing when the backend is disabled', async () => {
    vi.spyOn(supabaseModule, 'isBackendEnabled').mockReturnValue(false);
    const getClient = vi.spyOn(supabaseModule, 'getSupabaseClient');
    await signOut();
    expect(getClient).not.toHaveBeenCalled();
  });

  it('throws on error', async () => {
    vi.spyOn(supabaseModule, 'isBackendEnabled').mockReturnValue(true);
    mockAuthClient({ signOut: vi.fn().mockResolvedValue({ error: new Error('network') }) });
    await expect(signOut()).rejects.toThrow('network');
  });
});

describe('onAuthChange', () => {
  it('returns a no-op unsubscribe when the backend is disabled', () => {
    vi.spyOn(supabaseModule, 'isBackendEnabled').mockReturnValue(false);
    const unsubscribe = onAuthChange(() => {});
    expect(() => unsubscribe()).not.toThrow();
  });

  it('subscribes and returns a working unsubscribe', () => {
    vi.spyOn(supabaseModule, 'isBackendEnabled').mockReturnValue(true);
    const unsub = vi.fn();
    mockAuthClient({ onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: unsub } } }) });
    const unsubscribe = onAuthChange(() => {});
    unsubscribe();
    expect(unsub).toHaveBeenCalled();
  });
});
