export type Page = 'viewer' | 'compare' | 'settings';

interface NavLink {
  href: string;
  label: string;
  page: Page;
}

const NAV_LINKS: NavLink[] = [
  { href: `${import.meta.env.BASE_URL}index.html`, label: 'Deck Viewer', page: 'viewer' },
  { href: `${import.meta.env.BASE_URL}compare.html`, label: 'Deck Comparison', page: 'compare' },
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
}

// Auto-init when used as a plain script module in HTML
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => renderNavigation());
  } else {
    renderNavigation();
  }
}

