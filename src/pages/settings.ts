/**
 * src/pages/settings.ts
 * Typed localStorage helpers and event wiring for the Settings page.
 */

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

// ─── Settings keys ────────────────────────────────────────────────────────────

const KEY_DIRECT_FETCH = 'useDirectFetch';

export function getUseDirectFetch(): boolean {
  return localStorage.getItem(KEY_DIRECT_FETCH) === 'true';
}

export function setUseDirectFetch(value: boolean): void {
  localStorage.setItem(KEY_DIRECT_FETCH, value ? 'true' : 'false');
}

export function clearAllSettings(): void {
  localStorage.clear();
}

// ─── Test connection ──────────────────────────────────────────────────────────

async function testConnection(): Promise<void> {
  const resultDiv = el('testResult');
  if (!resultDiv) return;

  resultDiv.innerHTML = '<span style="color: #666;">Testing...</span>';
  const testUrl = 'https://swudb.com/api/getDeckJson/YHNqqVcCe';

  try {
    resultDiv.innerHTML = '<span style="color: #666;">Trying direct fetch...</span>';
    const response = await fetch(testUrl);
    if (response.ok) {
      resultDiv.innerHTML = '<span style="color: #28a745;">✓ Direct fetch works! No proxy needed.</span>';
    } else {
      resultDiv.innerHTML = `<span style="color: #dc3545;">✗ Direct fetch failed (${response.status}). You may need to enable CORS bypass or use a browser extension.</span>`;
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    resultDiv.innerHTML = `<span style="color: #dc3545;">✗ Connection error: ${msg}<br><br>
      <strong>Solutions:</strong><br>
      1. Enable "Direct API Fetch" above<br>
      2. Install a CORS browser extension like "CORS Unblock"<br>
      3. Use a different browser<br>
      4. Deploy to a server with proper CORS proxy</span>`;
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init(): void {
  // Reflect stored setting in checkbox
  const checkbox = el<HTMLInputElement>('useDirectFetch');
  if (checkbox) {
    checkbox.checked = getUseDirectFetch();
    checkbox.addEventListener('change', (e) => {
      setUseDirectFetch((e.target as HTMLInputElement).checked);
      alert('Setting saved! Reload any open deck viewer pages for changes to take effect.');
    });
  }

  el('clearDataBtn')?.addEventListener('click', () => {
    if (confirm('This will clear all cached data and recent decks. Continue?')) {
      clearAllSettings();
      if (checkbox) checkbox.checked = false;
      alert('All data cleared!');
    }
  });

  el('testConnectionBtn')?.addEventListener('click', () => void testConnection());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

