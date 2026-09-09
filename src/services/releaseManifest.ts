import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.resolve(__dirname, '../../public-site/assets/plugin-release.json');

type Manifest = { version: string; download: string };

function load(): Manifest {
  try {
    const raw = readFileSync(manifestPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<Manifest>;
    return {
      version: typeof parsed.version === 'string' ? parsed.version : '',
      download: typeof parsed.download === 'string' ? parsed.download : '',
    };
  } catch {
    return { version: '', download: '' };
  }
}

export const releaseManifest: Manifest = load();
