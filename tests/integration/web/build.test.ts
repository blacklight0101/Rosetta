import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createTestServer, type TestServer } from '../../support/web-server.js';

// RF-1013, RF-1009, P1-12: `npm run build` builds the front end into dist/web/. The server answers
// only `/`, `/sign-in` and files under `/assets/` without a session, and its content security
// policy allows no inline script or style, so the build must put every file but index.html under
// assets/ and leave no inline code. The build runs here into a temporary folder.

const configFile = fileURLToPath(new URL('../../../web/vite.config.ts', import.meta.url));
const run = promisify(execFile);
// The real build, as `npm run build` runs it: production mode, in its own process.
const viteCli = join(
  dirname(createRequire(import.meta.url).resolve('vite/package.json')),
  'bin',
  'vite.js',
);
let outDir = '';
let files: string[] = [];
let current: TestServer | undefined;

async function listFiles(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(folder, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();
}

const textOf = async (path: string): Promise<string> => await readFile(join(outDir, path), 'utf8');

beforeAll(async () => {
  outDir = await mkdtemp(join(tmpdir(), 'rosetta-web-build-'));
  await run(
    process.execPath,
    [viteCli, 'build', '--config', configFile, '--outDir', outDir, '--emptyOutDir'],
    { env: { ...process.env, NODE_ENV: 'production' } },
  );
  files = await listFiles(outDir);
}, 120_000);

afterAll(async () => {
  await current?.server.close();
  await rm(outDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

it('RF-1013 puts every built file except index.html under assets/', () => {
  expect(files).toContain('index.html');
  expect(files.filter((file) => file !== 'index.html' && !file.startsWith('assets/'))).toEqual([]);
  expect(files.some((file) => file.endsWith('.js'))).toBe(true);
  expect(files.some((file) => file.endsWith('.css'))).toBe(true);
});

it('RF-1200 builds the landing page style sheet under a name the server can link to', async () => {
  expect(files).toContain('assets/landing.css');
  const css = await textOf('assets/landing.css');
  expect(css).toContain('--rst-brand');
  expect(css).toContain('prefers-color-scheme');
  expect(css).not.toContain('@import');
  expect(files.filter((file) => /^assets\/landing.*\.js$/.test(file))).toEqual([]);
});

it('RF-1013 writes no source map and no file whose name the public path would refuse', () => {
  expect(files.filter((file) => file.endsWith('.map'))).toEqual([]);
  for (const file of files.filter((name) => name.startsWith('assets/'))) {
    expect(file).toMatch(/^assets\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/);
  }
});

it('RF-1013 has no inline script, inline style, style attribute or event handler in index.html', async () => {
  const html = await textOf('index.html');
  expect(html).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/i);
  expect(html).not.toMatch(/<style[\s>]/i);
  expect(html).not.toMatch(/\sstyle\s*=/i);
  expect(html).not.toMatch(/\son[a-z]+\s*=/i);
  expect(html).toMatch(/<html lang="en"/);
  expect(html).toContain('id="root"');
});

it('RF-1013 loads nothing from another origin: no font, script, style or image URL', async () => {
  const html = await textOf('index.html');
  const css = await Promise.all(files.filter((f) => f.endsWith('.css')).map(textOf));
  expect(html).not.toMatch(/(?:src|href)="(?:https?:)?\/\//i);
  for (const sheet of css) {
    expect(sheet).not.toMatch(/@import|url\(\s*["']?(?:https?:)?\/\//i);
  }
});

it('RF-1013 serves the page and its assets without a session and the root files only with one', async () => {
  current = createTestServer({ staticRoot: outDir });
  const { server } = current;

  const page = await server.inject({ method: 'GET', url: '/sign-in' });
  expect(page.statusCode).toBe(200);
  expect(page.headers['content-type']).toContain('text/html');
  expect(String(page.headers['content-security-policy'])).toContain("default-src 'self'");

  const assets = files.filter((name) => name.startsWith('assets/'));
  const refused = [];
  for (const file of assets) {
    const asset = await server.inject({ method: 'GET', url: `/${file}` });
    if (asset.statusCode !== 200) refused.push(file);
  }
  expect(refused).toEqual([]);
  expect(assets.length).toBeGreaterThan(0);
  const root = await server.inject({ method: 'GET', url: '/index.html' });
  expect(root.statusCode).not.toBe(200);
});

it('P1-12 leaves the component gallery out of the production build', async () => {
  const scripts = await Promise.all(files.filter((f) => f.endsWith('.js')).map(textOf));
  expect(scripts.join('\n')).not.toContain('Component gallery');
});

it('DEC-126 leaves the /dev/gallery route out of the production bundle', async () => {
  const scripts = await Promise.all(files.filter((f) => f.endsWith('.js')).map(textOf));
  expect(scripts.join('\n')).not.toContain('/dev/gallery');
});

const brandFiles = [
  'android-chrome-192x192.png',
  'android-chrome-512x512.png',
  'apple-touch-icon.png',
  'favicon.ico',
  'rosetta-full-320w.png',
  'rosetta-full-640w.png',
  'rosetta-full-960w.png',
  'site.webmanifest',
  ...[16, 32, 48, 64, 128, 180, 192, 256, 512].map((size) => `rosetta-icon-${String(size)}.png`),
];

it('DEC-161 ships the brand files under assets/brand/ and nothing larger than the 960 px logo', async () => {
  const brand = files.filter((file) => file.startsWith('assets/brand/'));
  expect(brand).toEqual(brandFiles.map((name) => `assets/brand/${name}`).sort());
  expect(brand.filter((file) => /original|1280w|1920w/.test(file))).toEqual([]);
  const sizes = await Promise.all(
    brand.map(async (file) => (await readFile(join(outDir, file))).length),
  );
  expect(sizes.reduce((sum, size) => sum + size, 0)).toBeLessThan(2 * 1024 * 1024);
});

it('DEC-161 links the favicon and the touch icon from index.html and serves them without a session', async () => {
  const html = await textOf('index.html');
  expect(html).toContain('href="/assets/brand/favicon.ico"');
  expect(html).toContain('href="/assets/brand/apple-touch-icon.png"');
  expect(html).toContain('href="/assets/brand/site.webmanifest"');
  expect(html).not.toContain('href="data:,"');

  current = createTestServer({ staticRoot: outDir });
  for (const name of ['favicon.ico', 'rosetta-icon-32.png', 'site.webmanifest']) {
    const response = await current.server.inject({ method: 'GET', url: `/assets/brand/${name}` });
    expect(response.statusCode).toBe(200);
  }
});

it('DEC-161 lists the PWA icons in the manifest', async () => {
  const manifest: unknown = JSON.parse(await textOf('assets/brand/site.webmanifest'));
  expect(manifest).toMatchObject({
    name: 'Rosetta',
    icons: [
      { src: '/assets/brand/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/assets/brand/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
  });
});
