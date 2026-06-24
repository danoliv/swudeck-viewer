import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildNavElement, detectCurrentPage, renderNavigation, renderAuthControl, type Page } from './navigation';
import * as supabaseLib from '../lib/supabase';
import * as authLib from '../lib/auth';

// happy-dom is the environment; set up a realistic document
beforeEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

// ─── buildNavElement ───────────────────────────────────────────────────────────

describe('buildNavElement', () => {
  it('renders exactly 5 links', () => {
    const nav = buildNavElement('viewer');
    expect(nav.querySelectorAll('a')).toHaveLength(5);
  });

  it('has correct href attributes', () => {
    const nav = buildNavElement('viewer');
    const hrefs = Array.from(nav.querySelectorAll('a')).map((a) => (a as HTMLAnchorElement).getAttribute('href'));
    // In Vitest import.meta.env.BASE_URL defaults to '/'
    expect(hrefs).toEqual(['/index.html', '/builder.html', '/viewer.html', '/compare.html', '/settings.html']);
  });

  it('has correct link labels, with Deck Builder second', () => {
    const nav = buildNavElement('viewer');
    const labels = Array.from(nav.querySelectorAll('a')).map((a) => a.textContent);
    expect(labels).toEqual(['My Decks', 'Deck Builder', 'Deck Viewer', 'Deck Comparison', 'Settings']);
  });

  it('always includes a "My Decks" link back to index.html, regardless of which page is active', () => {
    for (const page of ['home', 'viewer', 'compare', 'builder', 'settings'] as const) {
      const nav = buildNavElement(page);
      const homeLink = nav.querySelectorAll('a')[0];
      expect(homeLink.textContent).toBe('My Decks');
      expect(homeLink.getAttribute('href')).toBe('/index.html');
    }
  });

  it('adds active class to the builder link when page is builder', () => {
    const nav = buildNavElement('builder');
    const links = nav.querySelectorAll('a');
    expect(links[0].className).toBe('');
    expect(links[1].className).toBe('active');
    expect(links[2].className).toBe('');
    expect(links[3].className).toBe('');
    expect(links[4].className).toBe('');
  });

  it('adds active class to the viewer link when page is viewer', () => {
    const nav = buildNavElement('viewer');
    const links = nav.querySelectorAll('a');
    expect(links[0].className).toBe('');
    expect(links[1].className).toBe('');
    expect(links[2].className).toBe('active');
    expect(links[3].className).toBe('');
    expect(links[4].className).toBe('');
  });

  it('adds active class to the compare link when page is compare', () => {
    const nav = buildNavElement('compare');
    const links = nav.querySelectorAll('a');
    expect(links[0].className).toBe('');
    expect(links[1].className).toBe('');
    expect(links[2].className).toBe('');
    expect(links[3].className).toBe('active');
    expect(links[4].className).toBe('');
  });

  it('adds active class to the settings link when page is settings', () => {
    const nav = buildNavElement('settings');
    const links = nav.querySelectorAll('a');
    expect(links[0].className).toBe('');
    expect(links[1].className).toBe('');
    expect(links[2].className).toBe('');
    expect(links[3].className).toBe('');
    expect(links[4].className).toBe('active');
  });

  it('adds active class to the home link when page is home', () => {
    const nav = buildNavElement('home');
    const links = nav.querySelectorAll('a');
    expect(links[0].className).toBe('active');
    expect(links[1].className).toBe('');
    expect(links[2].className).toBe('');
    expect(links[3].className).toBe('');
    expect(links[4].className).toBe('');
  });

  it('returns a div with class navigation', () => {
    const nav = buildNavElement('viewer');
    expect(nav.tagName.toLowerCase()).toBe('div');
    expect(nav.className).toBe('navigation');
  });
});

// ─── detectCurrentPage ────────────────────────────────────────────────────────

describe('detectCurrentPage', () => {
  it('returns viewer for viewer.html path', () => {
    vi.spyOn(window, 'location', 'get').mockReturnValue({ pathname: '/viewer.html' } as Location);
    expect(detectCurrentPage()).toBe('viewer');
  });

  it('returns compare for compare.html path', () => {
    vi.spyOn(window, 'location', 'get').mockReturnValue({ pathname: '/compare.html' } as Location);
    expect(detectCurrentPage()).toBe('compare');
  });

  it('returns settings for settings.html path', () => {
    vi.spyOn(window, 'location', 'get').mockReturnValue({ pathname: '/settings.html' } as Location);
    expect(detectCurrentPage()).toBe('settings');
  });

  it('returns builder for builder.html path', () => {
    vi.spyOn(window, 'location', 'get').mockReturnValue({ pathname: '/builder.html' } as Location);
    expect(detectCurrentPage()).toBe('builder');
  });

  it('returns home for index.html path', () => {
    vi.spyOn(window, 'location', 'get').mockReturnValue({ pathname: '/index.html' } as Location);
    expect(detectCurrentPage()).toBe('home');
  });

  it('returns home for root path /', () => {
    vi.spyOn(window, 'location', 'get').mockReturnValue({ pathname: '/' } as Location);
    expect(detectCurrentPage()).toBe('home');
  });
});

// ─── renderNavigation ─────────────────────────────────────────────────────────

describe('renderNavigation', () => {
  it('injects a .navigation element into body', () => {
    renderNavigation('viewer');
    expect(document.querySelector('.navigation')).not.toBeNull();
  });

  it('inserts nav as first child of body', () => {
    document.body.innerHTML = '<h1>Test</h1>';
    renderNavigation('viewer');
    expect(document.body.firstElementChild?.className).toBe('navigation');
  });

  it('is idempotent — calling twice still leaves only one nav', () => {
    renderNavigation('viewer');
    renderNavigation('viewer');
    expect(document.querySelectorAll('.navigation')).toHaveLength(1);
  });

  it('marks the correct link active when called with explicit page', () => {
    renderNavigation('settings');
    const activeLink = document.querySelector('.navigation a.active') as HTMLAnchorElement;
    expect(activeLink?.getAttribute('href')).toBe('/settings.html');
  });

  it('replaces an existing static nav on re-call with new active page', () => {
    renderNavigation('viewer');
    renderNavigation('compare');
    const activeLinks = document.querySelectorAll('.navigation a.active');
    expect(activeLinks).toHaveLength(1);
    expect((activeLinks[0] as HTMLAnchorElement).getAttribute('href')).toBe('/compare.html');
  });

  it('auto-detects page from pathname when called without argument', () => {
    vi.spyOn(window, 'location', 'get').mockReturnValue({ pathname: '/settings.html' } as Location);
    renderNavigation();
    const activeLink = document.querySelector('.navigation a.active') as HTMLAnchorElement;
    expect(activeLink?.getAttribute('href')).toBe('/settings.html');
  });
});

// ─── renderAuthControl ────────────────────────────────────────────────────────

describe('renderAuthControl', () => {
  it('does nothing when there is no .navigation element', async () => {
    vi.spyOn(supabaseLib, 'isBackendEnabled').mockReturnValue(true);
    await renderAuthControl();
    expect(document.querySelector('.nav-auth')).toBeNull();
  });

  it('renders nothing when the backend is disabled', async () => {
    renderNavigation('viewer');
    vi.spyOn(supabaseLib, 'isBackendEnabled').mockReturnValue(false);
    await renderAuthControl();
    expect(document.querySelector('.nav-auth')).toBeNull();
  });

  it('renders a sign-in link when backend is enabled and no user is signed in', async () => {
    renderNavigation('viewer');
    vi.spyOn(supabaseLib, 'isBackendEnabled').mockReturnValue(true);
    vi.spyOn(authLib, 'getCurrentUser').mockResolvedValue(null);
    await renderAuthControl();
    const signIn = document.querySelector('.nav-auth-signin') as HTMLAnchorElement;
    expect(signIn).not.toBeNull();
    expect(signIn.textContent).toBe('Sign in');
  });

  it('renders email + sign out button when a user is signed in', async () => {
    renderNavigation('viewer');
    vi.spyOn(supabaseLib, 'isBackendEnabled').mockReturnValue(true);
    vi.spyOn(authLib, 'getCurrentUser').mockResolvedValue({ email: 'a@test.com' } as any);
    await renderAuthControl();
    expect(document.querySelector('.nav-auth-email')?.textContent).toBe('a@test.com');
    expect(document.querySelector('.nav-auth-signout')).not.toBeNull();
  });

  it('is idempotent — calling twice leaves only one .nav-auth', async () => {
    renderNavigation('viewer');
    vi.spyOn(supabaseLib, 'isBackendEnabled').mockReturnValue(true);
    vi.spyOn(authLib, 'getCurrentUser').mockResolvedValue(null);
    await renderAuthControl();
    await renderAuthControl();
    expect(document.querySelectorAll('.nav-auth')).toHaveLength(1);
  });

  it('keeps the "My Decks" link present and unaffected, whether the backend is enabled or not', async () => {
    renderNavigation('viewer');
    vi.spyOn(supabaseLib, 'isBackendEnabled').mockReturnValue(false);
    await renderAuthControl();
    const links = Array.from(document.querySelectorAll('.navigation a')).map((a) => a.textContent);
    expect(links).toContain('My Decks');
  });
});

