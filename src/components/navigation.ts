import { isBackendEnabled } from '../lib/supabase';
import { getCurrentUser, signOut, onAuthChange } from '../lib/auth';

export type Page = 'viewer' | 'compare' | 'settings' | 'builder' | 'account';

interface NavLink {
  href: string;
  label: string;
  page: Page;
}

const NAV_LINKS: NavLink[] = [
  { href: `${import.meta.env.BASE_URL}index.html`, label: 'Deck Viewer', page: 'viewer' },
  { href: `${import.meta.env.BASE_URL}compare.html`, label: 'Deck Comparison', page: 'compare' },
  { href: `${import.meta.env.BASE_URL}builder.html`, label: 'Deck Builder', page: 'builder' },
  { href: `${import.meta.env.BASE_URL}settings.html`, label: 'Settings', page: 'settings' },
];

/**
 * Detect which page is currently active from window.location.pathname.
 * Falls back to 'viewer' if no match.
 */
export function detectCurrentPage(): Page {
  if (typeof window === 'undefined') return 'viewer';
  const path = window.location.pathname;
  if (path.includes('compare')) return 'compare';
  if (path.includes('settings')) return 'settings';
  if (path.includes('builder')) return 'builder';
  if (path.includes('account')) return 'account';
  return 'viewer';
}

/**
 * Build the navigation DOM element.
 * @param currentPage - which nav link should receive the `active` class
 */
export function buildNavElement(currentPage: Page): HTMLElement {
  const nav = document.createElement('div');
  nav.className = 'navigation';

  for (const link of NAV_LINKS) {
    const a = document.createElement('a');
    a.href = link.href;
    a.textContent = link.label;
    if (link.page === currentPage) {
      a.className = 'active';
    }
    nav.appendChild(a);
  }

  return nav;
}

/**
 * Inject the navigation bar as the first child of <body>.
 * Removes any existing `.navigation` element first so this is idempotent.
 * @param currentPage - optional; auto-detected from pathname if omitted
 */
export function renderNavigation(currentPage?: Page): void {
  if (typeof document === 'undefined') return;

  const page = currentPage ?? detectCurrentPage();

  // Remove existing nav if present (idempotent)
  const existing = document.querySelector('.navigation');
  if (existing) existing.remove();

  const nav = buildNavElement(page);
  document.body.insertBefore(nav, document.body.firstChild);

  void renderAuthControl();
  ensureAuthSubscription();
}

// ─── Auth control ──────────────────────────────────────────────────────────────

let authSubscribed = false;

/** Subscribe once to auth changes so the nav re-renders on sign-in/out. */
function ensureAuthSubscription(): void {
  if (authSubscribed || !isBackendEnabled()) return;
  authSubscribed = true;
  onAuthChange(() => void renderAuthControl());
}

async function buildAuthControl(): Promise<HTMLElement> {
  const container = document.createElement('div');
  container.className = 'nav-auth';

  const user = await getCurrentUser();
  if (user) {
    const email = document.createElement('span');
    email.className = 'nav-auth-email';
    email.textContent = user.email ?? '';

    const signOutBtn = document.createElement('button');
    signOutBtn.type = 'button';
    signOutBtn.className = 'nav-auth-signout';
    signOutBtn.textContent = 'Sign out';
    signOutBtn.addEventListener('click', () => void signOut());

    container.append(email, signOutBtn);
  } else {
    const link = document.createElement('a');
    link.className = 'nav-auth-signin';
    link.href = `${import.meta.env.BASE_URL}account.html`;
    link.textContent = 'Sign in';
    container.appendChild(link);
  }

  return container;
}

let authRenderToken = 0;

/** Render (or remove) the sign-in/account control inside the nav bar. */
export async function renderAuthControl(): Promise<void> {
  if (typeof document === 'undefined') return;
  const nav = document.querySelector('.navigation');
  if (!nav) return;

  // Concurrent calls (e.g. the initial render racing the onAuthChange
  // INITIAL_SESSION event) must not both append — only the latest wins.
  const token = ++authRenderToken;
  const control = isBackendEnabled() ? await buildAuthControl() : null;
  if (token !== authRenderToken) return;

  nav.querySelectorAll('.nav-auth').forEach((el) => el.remove());
  if (control) nav.appendChild(control);
}

// Auto-init when used as a plain script module in HTML
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => renderNavigation());
  } else {
    renderNavigation();
  }
}

