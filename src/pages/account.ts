/**
 * src/pages/account.ts
 * DOM orchestration for the Account page: sign in (magic link / GitHub),
 * sign out, and the "My Decks" list.
 */

import { isBackendEnabled } from '../lib/supabase';
import { getCurrentUser, signInWithEmail, signInWithGitHub, onAuthChange } from '../lib/auth';
import { listMyDecks, deleteDeck, type DeckRow } from '../lib/decks-api';

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function setStatus(message: string, isError = false): void {
  const status = el('accountStatus');
  if (!status) return;
  status.textContent = message;
  status.style.color = isError ? '#dc3545' : '';
}

/**
 * `?return=<url>` lets callers (e.g. the builder's "Save to my account" flow)
 * land the user back where they started after sign-in. Only accept it if
 * it resolves to our own origin — never hand an attacker-controlled URL to
 * the auth redirect.
 */
function getReturnUrl(): string | undefined {
  const raw = new URLSearchParams(window.location.search).get('return');
  if (!raw) return undefined;
  try {
    const resolved = new URL(raw, window.location.origin);
    return resolved.origin === window.location.origin ? resolved.toString() : undefined;
  } catch {
    return undefined;
  }
}

function buildDeckRow(deck: DeckRow): HTMLElement {
  const row = document.createElement('div');
  row.className = 'deck-row';

  const nameWrap = document.createElement('span');
  const name = document.createElement('span');
  name.className = 'deck-row-name';
  name.textContent = deck.name;
  const visibility = document.createElement('span');
  visibility.className = 'deck-row-visibility';
  visibility.textContent = deck.visibility;
  nameWrap.append(name, visibility);

  const actions = document.createElement('span');
  actions.className = 'deck-row-actions';

  const openLink = document.createElement('a');
  openLink.href = `${import.meta.env.BASE_URL}builder.html?id=${deck.slug}`;
  openLink.textContent = 'Open';

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.textContent = 'Copy link';
  copyBtn.addEventListener('click', () => {
    const url = `${window.location.origin}${import.meta.env.BASE_URL}builder.html?id=${deck.slug}`;
    void navigator.clipboard.writeText(url);
    setStatus('Share link copied to clipboard.');
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.textContent = 'Delete';
  deleteBtn.addEventListener('click', () => {
    if (!confirm(`Delete "${deck.name}"? This cannot be undone.`)) return;
    deleteDeck(deck.id)
      .then(() => void renderSignedIn())
      .catch((err) => setStatus(`Failed to delete: ${err instanceof Error ? err.message : String(err)}`, true));
  });

  actions.append(openLink, copyBtn, deleteBtn);
  row.append(nameWrap, actions);
  return row;
}

async function renderSignedIn(): Promise<void> {
  const signedOutView = el('signedOutView');
  const signedInView = el('signedInView');
  const list = el('myDecksList');
  const empty = el('myDecksEmpty');
  if (!signedInView || !list || !empty) return;

  if (signedOutView) signedOutView.hidden = true;
  signedInView.hidden = false;

  try {
    const decks = await listMyDecks();
    list.innerHTML = '';
    empty.hidden = decks.length > 0;
    for (const deck of decks) {
      list.appendChild(buildDeckRow(deck));
    }
  } catch (err) {
    setStatus(`Failed to load decks: ${err instanceof Error ? err.message : String(err)}`, true);
  }
}

function renderSignedOut(): void {
  const signedOutView = el('signedOutView');
  const signedInView = el('signedInView');
  if (signedInView) signedInView.hidden = true;
  if (signedOutView) signedOutView.hidden = false;
}

async function renderAuthState(): Promise<void> {
  const user = await getCurrentUser();
  if (user) {
    await renderSignedIn();
  } else {
    renderSignedOut();
  }
}

function wireSignInForm(): void {
  el('sendMagicLinkBtn')?.addEventListener('click', () => {
    const input = el<HTMLInputElement>('emailInput');
    const email = input?.value.trim();
    if (!email) {
      setStatus('Enter an email address first.', true);
      return;
    }
    setStatus('Sending magic link…');
    signInWithEmail(email, getReturnUrl())
      .then(() => setStatus(`Magic link sent to ${email}. Check your inbox.`))
      .catch((err) => setStatus(`Failed to send link: ${err instanceof Error ? err.message : String(err)}`, true));
  });

  el('githubSignInBtn')?.addEventListener('click', () => {
    setStatus('Redirecting to GitHub…');
    signInWithGitHub(getReturnUrl()).catch((err) =>
      setStatus(`Failed to start GitHub sign-in: ${err instanceof Error ? err.message : String(err)}`, true),
    );
  });
}

function init(): void {
  if (!isBackendEnabled()) {
    const disabled = el('backendDisabledView');
    if (disabled) disabled.hidden = false;
    return;
  }

  wireSignInForm();
  void renderAuthState();
  onAuthChange(() => void renderAuthState());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
