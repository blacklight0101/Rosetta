// RNF-010, P1-13: the verifier's page walk. Starts the test server (tests/e2e/support/serve.ts) on
// a disposable schema, opens a page at each viewport and colour scheme of the orchestration README
// section 1 (1280x800 and 360x780, light and dark), saves one PNG each and writes the console errors.
// Usage: node scripts/page-shots.mjs <path> [--out <folder>] [--port <port>] [--signed-in]
//   <path>       the page, for example /sign-in
//   --out        where the files go; default test-results/page-shots (git-ignored)
//   --port       the test server's port; default ROSETTA_E2E_PORT plus one
//   --signed-in  signs in first, for pages that need a session (the seeded administrator, who must
//                change the password, so only /account/password opens; see --as)
//   --as user    with --signed-in: the seeded user instead, whose pages open (settings and keys)
// Needs ROSETTA_TEST_DATABASE_URL and the Chromium of `npx playwright install chromium`. Output is
// <slug>-<device>-<scheme>.png and console-errors.json; nothing is committed.
import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import './register-ts.mjs';

const require = createRequire(import.meta.url);
const viewports = [
  { device: 'desktop', width: 1280, height: 800 },
  { device: 'phone', width: 360, height: 780 },
];
const schemes = ['light', 'dark'];
const startTimeoutMs = 60_000;

// Each option that takes a value, and the flag that does not.
const valueFlags = {
  '--out': (options, value) => {
    options.out = value ?? '';
  },
  '--port': (options, value) => {
    options.port = Number(value);
  },
  '--as': (options, value) => {
    options.as = value ?? '';
  },
};

function parseArguments(argv) {
  const options = {
    path: undefined,
    out: 'test-results/page-shots',
    port: undefined,
    signedIn: false,
    as: 'admin',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const argument = argv[i];
    if (argument === '--signed-in') options.signedIn = true;
    else if (Object.hasOwn(valueFlags, argument)) valueFlags[argument](options, argv[++i]);
    else if (argument?.startsWith('/')) options.path = argument;
    else throw new Error(`Unknown argument ${String(argument)}`);
  }
  if (options.path === undefined) throw new Error('Give the page path, for example /sign-in.');
  if (!['admin', 'user'].includes(options.as)) throw new Error('--as is admin or user.');
  return options;
}

function runNode(script, args) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: 'inherit' });
    child.on('exit', (code) => {
      resolveRun(code ?? 1);
    });
  });
}

async function waitForServer(origin, child) {
  const deadline = Date.now() + startTimeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('The test server stopped before it was ready.');
    try {
      const response = await fetch(`${origin}/healthz`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await sleep(250);
  }
  throw new Error('The test server did not answer /healthz in time.');
}

function slugOf(path) {
  const slug = path.replace(/[^A-Za-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '');
  return slug === '' ? 'home' : slug;
}

async function shoot(browser, shot) {
  const { origin, path, outDir, policy, seed, signedIn, as } = shot;
  const errors = [];
  const names = [];
  for (const { device, width, height } of viewports) {
    for (const colorScheme of schemes) {
      const name = `${slugOf(path)}-${device}-${colorScheme}`;
      const context = await browser.newContext({ viewport: { width, height }, colorScheme });
      await context.route('**/*', (route) =>
        policy.isAllowedRequestUrl(route.request().url())
          ? route.fallback()
          : route.abort('blockedbyclient'),
      );
      if (signedIn) {
        await context.request.post(`${origin}/api/session`, {
          data: as === 'user' ? seed.seededUser : seed.seededAdmin,
          headers: { origin },
        });
      }
      const page = await context.newPage();
      page.on('console', (message) => {
        if (message.type() === 'error')
          errors.push({ shot: name, kind: 'console', text: message.text() });
      });
      page.on('pageerror', (error) => {
        errors.push({ shot: name, kind: 'pageerror', text: error.message });
      });
      page.on('requestfailed', (request) => {
        errors.push({
          shot: name,
          kind: 'requestfailed',
          text: `${request.method()} ${request.url()}`,
        });
      });
      await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' });
      await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: true });
      await context.close();
      names.push(name);
    }
  }
  return { names, errors };
}

// The front end is built only when it is missing: a run of the e2e project may be serving the same
// folder, and a rebuild empties it.
async function buildFrontEndOnce() {
  const built = await access('dist/web/index.html').then(
    () => true,
    () => false,
  );
  if (built) return;
  const vite = join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
  if ((await runNode(vite, ['build', '--config', 'web/vite.config.ts'])) !== 0) {
    throw new Error('The front end did not build.');
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const database = process.env.ROSETTA_TEST_DATABASE_URL ?? '';
  if (database === '') throw new Error('ROSETTA_TEST_DATABASE_URL is not set.');
  const port = options.port ?? Number(process.env.ROSETTA_E2E_PORT ?? 18080) + 1;
  const origin = `http://127.0.0.1:${String(port)}`;
  const outDir = resolve(options.out);
  await buildFrontEndOnce();
  await mkdir(outDir, { recursive: true });
  const [policy, seed, databaseTools] = await Promise.all([
    import('../tests/e2e/support/request-policy.ts'),
    import('../tests/e2e/support/seed.ts'),
    import('../tests/e2e/support/database.ts'),
  ]);
  const child = spawn(
    process.execPath,
    ['--import', './scripts/register-ts.mjs', 'tests/e2e/support/serve.ts'],
    { stdio: 'inherit', env: { ...process.env, ROSETTA_E2E_PORT: String(port) } },
  );
  try {
    await waitForServer(origin, child);
    const browser = await chromium.launch({
      args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],
    });
    try {
      const { names, errors } = await shoot(browser, {
        ...{ origin, outDir, policy, seed },
        path: options.path,
        signedIn: options.signedIn,
        as: options.as,
      });
      const report = { path: options.path, screenshots: names.sort(), errors };
      await writeFile(join(outDir, 'console-errors.json'), `${JSON.stringify(report, null, 2)}\n`);
      process.stdout.write(
        `${String(names.length)} screenshot(s) and ${String(errors.length)} console error(s) in ${outDir}\n`,
      );
    } finally {
      await browser.close();
    }
  } finally {
    child.kill();
    await databaseTools.dropDisposableSchema(database, port);
  }
}

main().catch((error) => {
  process.stderr.write(`page-shots: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
