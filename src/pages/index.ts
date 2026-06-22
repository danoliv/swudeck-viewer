/**
 * src/pages/index.ts
 * DOM orchestration for the home page: sign in (magic link / Google) when
 * logged out (or when the backend isn't configured at all), or the "My
 * Decks" gallery + "+ New Deck" launcher when signed in.
 */

import { isBackendEnabled } from '../lib/supabase';
import { getCurrentUser, signInWithEmail, signInWithGoogle, onAuthChange } from '../lib/auth';
import { listMyDecks, deleteDeck, type DeckRow } from '../lib/decks-api';
import { loadSets } from '../lib/sets';
import { loadCardSet, formatCardId, resolveCardArtUrl, type CardData } from '../lib/cards';

/** Matches builder.ts's BUILDER_STORAGE_KEY — cleared so "+ New Deck" always starts blank. */
const BUILDER_STORAGE_KEY = 'builderDeck';

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function setStatus(message: string, isError = false): void {
  const status = el('homeStatus');
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
export function getReturnUrl(): string | undefined {
  const raw = new URLSearchParams(window.location.search).get('return');
  if (!raw) return undefined;
  try {
    const resolved = new URL(raw, window.location.origin);
    return resolved.origin === window.location.origin ? resolved.toString() : undefined;
  } catch {
    return undefined;
  }
}

// ─── Card art lookup (for leader/base thumbnails) ──────────────────────────────

let allCards: CardData[] = [];

async function loadAllCards(): Promise<CardData[]> {
  const cardsById = new Map<string, CardData>();

  for (const set of loadSets()) {
    const index = await loadCardSet(set);
    for (const card of Object.values(index)) {
      if (card.VariantType && card.VariantType !== 'Normal') continue;

      const id = formatCardId(set, card.Number ?? '');
      if (!cardsById.has(id)) cardsById.set(id, { ...card, id });
    }
  }

  return Array.from(cardsById.values());
}

function findCard(cardId: string): CardData {
  return allCards.find((c) => c.id === cardId) ?? { id: cardId, Name: cardId };
}

function buildThumb(cardId: string | undefined): HTMLImageElement {
  const img = document.createElement('img');
  img.className = 'deck-gallery-thumb';
  if (cardId) {
    const card = findCard(cardId);
    img.src = resolveCardArtUrl(card.FrontArt) ?? '';
    img.alt = card.Name ?? cardId;
  } else {
    img.alt = '';
  }
  return img;
}

// ─── Gallery (signed in) ────────────────────────────────────────────────────────

function buildDeckRow(deck: DeckRow): HTMLElement {
  const row = document.createElement('div');
  row.className = 'deck-gallery-row';

  const art = document.createElement('div');
  art.className = 'deck-gallery-art';
  art.append(buildThumb(deck.data.leader?.id), buildThumb(deck.data.base?.id));

  const info = document.createElement('div');
  info.className = 'deck-gallery-info';

  const name = document.createElement('div');
  name.className = 'deck-gallery-name';
  name.textContent = deck.name;

  const badges = document.createElement('div');
  badges.className = 'deck-gallery-badges';
  const formatBadge = document.createElement('span');
  formatBadge.className = 'badge badge-format';
  formatBadge.textContent = deck.data.metadata?.format ?? 'unknown';
  const visBadge = document.createElement('span');
  visBadge.className = 'badge badge-visibility';
  visBadge.textContent = deck.visibility;
  badges.append(formatBadge, visBadge);

  info.append(name, badges);

  const actions = document.createElement('div');
  actions.className = 'deck-gallery-actions';

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
      .then(() => void renderGalleryList(authRenderToken))
      .catch((err) => setStatus(`Failed to delete: ${err instanceof Error ? err.message : String(err)}`, true));
  });

  actions.append(openLink, copyBtn, deleteBtn);
  row.append(art, info, actions);
  return row;
}

async function renderGalleryList(token: number): Promise<void> {
  const list = el('decksList');
  const empty = el('decksEmpty');
  if (!list || !empty) return;

  try {
    const decks = await listMyDecks();
    if (token !== authRenderToken) return;
    list.innerHTML = '';
    empty.hidden = decks.length > 0;
    for (const deck of decks) {
      list.appendChild(buildDeckRow(deck));
    }
  } catch (err) {
    if (token !== authRenderToken) return;
    setStatus(`Failed to load decks: ${err instanceof Error ? err.message : String(err)}`, true);
  }
}

async function showGallery(token: number): Promise<void> {
  if (allCards.length === 0) {
    try {
      allCards = await loadAllCards();
    } catch (err) {
      if (token !== authRenderToken) return;
      setStatus(`Failed to load card data: ${err instanceof Error ? err.message : String(err)}`, true);
    }
  }
  if (token !== authRenderToken) return;

  const signin = el('signinCard');
  const layout = el('homeLayout');
  if (signin) signin.hidden = true;
  if (layout) layout.hidden = false;

  await renderGalleryList(token);
}

function showSignIn(): void {
  const signin = el('signinCard');
  const layout = el('homeLayout');
  if (layout) layout.hidden = true;
  if (signin) signin.hidden = false;
}

// Concurrent calls (e.g. the initial render racing the onAuthChange
// INITIAL_SESSION event) must not both mutate the DOM — only the latest wins.
let authRenderToken = 0;

async function renderAuthState(): Promise<void> {
  const token = ++authRenderToken;

  if (!isBackendEnabled()) {
    showSignIn();
    return;
  }

  const user = await getCurrentUser();
  if (token !== authRenderToken) return;

  if (user) {
    await showGallery(token);
  } else {
    showSignIn();
  }
}

// ─── Sign-in form ───────────────────────────────────────────────────────────────

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

  el('googleSignInBtn')?.addEventListener('click', () => {
    setStatus('Redirecting to Google…');
    signInWithGoogle(getReturnUrl()).catch((err) =>
      setStatus(`Failed to start Google sign-in: ${err instanceof Error ? err.message : String(err)}`, true),
    );
  });
}

function wireNewDeckButton(): void {
  el('newDeckBtn')?.addEventListener('click', () => {
    localStorage.removeItem(BUILDER_STORAGE_KEY);
    window.location.href = `${import.meta.env.BASE_URL}builder.html`;
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init(): void {
  wireSignInForm();
  wireNewDeckButton();
  void renderAuthState();
  onAuthChange(() => void renderAuthState());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
