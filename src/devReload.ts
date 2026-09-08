import { createHash, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';

const bootId = randomUUID();
const enabled = () => process.env.WPA_DEV_RELOAD === '1' && process.env.NODE_ENV !== 'production';
let assetsDirectory = '';

function revision(): string {
  const hash = createHash('sha256').update(bootId);
  function walk(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(filename);
      else if (entry.isFile()) hash.update(filename).update(readFileSync(filename));
    }
  }
  walk(assetsDirectory);
  return hash.digest('hex');
}

export function devAssetUrl(url: string): string {
  return enabled() ? `${url}?v=${revision()}` : url;
}

export function devReloadScript(): string {
  if (!enabled()) return '';
  return `<script src="/__dev/reload.js?v=${revision()}" defer></script>`;
}

export function installDevReload(app: Express, assets: string): void {
  if (!enabled()) return;
  assetsDirectory = assets;
  // Keep development HTML and assets fresh, including after a process restart.
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.get('/__dev/revision', (_req, res) => {
    try {
      res.json({ revision: revision() });
    } catch {
      // An editor may temporarily remove a file during an atomic save.
      res.sendStatus(503);
    }
  });
  app.get('/__dev/reload.js', (_req, res) => {
    res.type('application/javascript').send(`
(() => {
  const expected = new URL(document.currentScript.src).searchParams.get('v');
  async function poll() {
    try {
      const response = await fetch('/__dev/revision', { cache: 'no-store' });
      if (response.ok && (await response.json()).revision !== expected) {
        location.reload();
        return;
      }
    } catch { /* Wait for the watched server to restart. */ }
    setTimeout(poll, 1000);
  }
  setTimeout(poll, 1000);
})();`);
  });
}
