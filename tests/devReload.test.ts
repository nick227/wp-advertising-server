import express from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { devAssetUrl, devReloadScript, installDevReload } from '../src/devReload.js';

const directories: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function setup() {
  const directory = mkdtempSync(path.join(tmpdir(), 'wpa-reload-'));
  directories.push(directory);
  const app = express();
  installDevReload(app, directory);
  return { app, directory };
}

describe('development browser reload', () => {
  it('detects asset edits, additions, and deletions without changing unchanged revisions', async () => {
    vi.stubEnv('WPA_DEV_RELOAD', '1');
    vi.stubEnv('NODE_ENV', 'development');
    const { app, directory } = setup();
    const initial = await request(app).get('/__dev/revision').expect(200);
    expect(initial.headers['cache-control']).toBe('no-store');
    expect((await request(app).get('/__dev/revision')).body).toEqual(initial.body);
    const file = path.join(directory, 'style.css');
    writeFileSync(file, 'body { color: red; }');
    const added = (await request(app).get('/__dev/revision')).body.revision;
    expect(added).not.toBe(initial.body.revision);
    writeFileSync(file, 'body { color: tan; }');
    expect((await request(app).get('/__dev/revision')).body.revision).not.toBe(added);
    rmSync(file);
    expect((await request(app).get('/__dev/revision')).body).toEqual(initial.body);
    expect(devReloadScript()).toContain(initial.body.revision);
    expect(devAssetUrl('/assets/site.css')).toBe(`/assets/site.css?v=${initial.body.revision}`);
    await request(app).get('/__dev/reload.js').expect('Content-Type', /javascript/).expect(200);
  });

  it.each(['test', 'production'])('does not expose reload endpoints in %s without development opt-in', async (environment) => {
    vi.stubEnv('NODE_ENV', environment);
    vi.stubEnv('WPA_DEV_RELOAD', environment === 'production' ? '1' : '');
    const { app } = setup();
    expect(devReloadScript()).toBe('');
    expect(devAssetUrl('/assets/site.css')).toBe('/assets/site.css');
    await request(app).get('/__dev/revision').expect(404);
    await request(app).get('/__dev/reload.js').expect(404);
  });
});
