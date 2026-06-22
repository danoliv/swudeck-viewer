const REPO_BASE = '/swudeck-viewer/';

function getBasePath() {
  return window.location.pathname.startsWith(REPO_BASE) ? REPO_BASE : '/';
}

function getPageKey() {
  const page = document.documentElement.getAttribute('data-page');
  if (page === 'compare' || page === 'settings' || page === 'viewer' || page === 'builder' || page === 'home') {
    return page;
  }

  const path = window.location.pathname;
  if (path.includes('compare')) return 'compare';
  if (path.includes('settings')) return 'settings';
  if (path.includes('builder')) return 'builder';
  if (path.includes('viewer')) return 'viewer';
  return 'home';
}

async function loadBuiltEntry(basePath, pageKey) {
  const manifestResponse = await fetch(`${basePath}.vite/manifest.json`, { cache: 'no-store' });
  if (!manifestResponse.ok) {
    throw new Error(`Manifest not available: ${manifestResponse.status}`);
  }

  const manifest = await manifestResponse.json();
  const manifestKeys = {
    home: ['src/components/navigation.ts', 'src/pages/index.ts'],
    viewer: ['src/components/navigation.ts', 'src/pages/viewer.ts'],
    compare: ['src/components/navigation.ts', 'src/pages/compare.ts'],
    settings: ['src/components/navigation.ts', 'src/pages/settings.ts'],
    builder: ['src/components/navigation.ts', 'src/pages/builder.ts'],
  };

  for (const manifestKey of manifestKeys[pageKey]) {
    const entry = manifest[manifestKey];
    if (!entry?.file) {
      throw new Error(`Manifest entry missing for ${manifestKey}`);
    }

    await import(`${basePath}${entry.file}`);
  }
}

async function loadDevEntry(pageKey) {
  const devModules = {
    home: ['/src/components/navigation.ts', '/src/pages/index.ts'],
    viewer: ['/src/components/navigation.ts', '/src/pages/viewer.ts'],
    compare: ['/src/components/navigation.ts', '/src/pages/compare.ts'],
    settings: ['/src/components/navigation.ts', '/src/pages/settings.ts'],
    builder: ['/src/components/navigation.ts', '/src/pages/builder.ts'],
  };

  for (const modulePath of devModules[pageKey]) {
    await import(modulePath);
  }
}

async function bootstrap() {
  const basePath = getBasePath();
  const pageKey = getPageKey();

  try {
    await loadBuiltEntry(basePath, pageKey);
  } catch (error) {
    console.warn('bootstrap-runtime: falling back to Vite dev entrypoints', error);
    await loadDevEntry(pageKey);
  }
}

void bootstrap();

