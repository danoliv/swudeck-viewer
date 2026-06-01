import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildNavElement, detectCurrentPage, renderNavigation, type Page } from './navigation';

// happy-dom is the environment; set up a realistic document
beforeEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

// ─── buildNavElement ───────────────────────────────────────────────────────────

describe('buildNavElement', () => {
  it('renders exactly 3 links', () => {
    const nav = buildNavElement('viewer');
    expect(nav.querySelectorAll('a')).toHaveLength(3);
  });

  it('has correct href attributes', () => {
    const nav = buildNavElement('viewer');
    const hrefs = Array.from(nav.querySelectorAll('a')).map((a) => (a as HTMLAnchorElement).getAttribute('href'));
    // In Vitest import.meta.env.BASE_URL defaults to '/'
    expect(hrefs).toEqual(['/index.html', '/compare.html', '/settings.html']);
  });

  it('has correct link labels', () => {
    const nav = buildNavElement('viewer');
    const labels = Array.from(nav.querySelectorAll('a')).map((a) => a.textContent);
    expect(labels).toEqual(['Deck Viewer', 'Deck Comparison', 'Settings']);
  });

  it('adds active class to the viewer link when page is viewer', () => {
    const nav = buildNavElement('viewer');
    const links = nav.querySelectorAll('a');
    expect(links[0].className).toBe('active');
    expect(links[1].className).toBe('');
    expect(links[2].className).toBe('');
  });

  it('adds active class to the compare link when page is compare', () => {
    const nav = buildNavElement('compare');
    const links = nav.querySelectorAll('a');
    expect(links[0].className).toBe('');
    expect(links[1].className).toBe('active');
    expect(links[2].className).toBe('');
  });

  it('adds active class to the settings link when page is settings', () => {
    const nav = buildNavElement('settings');
    const links = nav.querySelectorAll('a');
    expect(links[0].className).toBe('');
    expect(links[1].className).toBe('');
    expect(links[2].className).toBe('active');
  });

  it('returns a div with class navigation', () => {
    const nav = buildNavElement('viewer');
    expect(nav.tagName.toLowerCase()).toBe('div');
    expect(nav.className).toBe('navigation');
  });
});

// ─── detectCurrentPage ────────────────────────────────────────────────────────

describe('detectCurrentPage', () => {
  it('returns viewer for index.html path', () => {
    vi.spyOn(window, 'location', 'get').mockReturnValue({ pathname: '/index.html' } as Location);
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

  it('returns viewer for root path /', () => {
    vi.spyOn(window, 'location', 'get').mockReturnValue({ pathname: '/' } as Location);
    expect(detectCurrentPage()).toBe('viewer');
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

