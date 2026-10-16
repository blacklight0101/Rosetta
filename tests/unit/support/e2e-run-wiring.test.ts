import { mkdir, mkdtemp, readFile, rm, stat, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import globalSetup, { prepareRun } from '../../e2e/support/global-setup.js';
import globalTeardown from '../../e2e/support/global-teardown.js';
import { capsLockFolder } from '../../e2e/support/caps-lock.js';

// RNF-005, P1-150: the end-to-end run is wired through playwright.config.ts: the setup gives the run
// its caps lock key and clears the folders of old runs, the teardown removes the folder of its run.

const DAY_MS = 24 * 60 * 60 * 1000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe('e2e run wiring, the setup', () => {
  let root: string;
  let savedKey: string | undefined;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'rosetta-run-wiring-'));
    savedKey = process.env['ROSETTA_E2E_RUN_KEY'];
  });
  afterEach(async () => {
    if (savedKey === undefined) delete process.env['ROSETTA_E2E_RUN_KEY'];
    else process.env['ROSETTA_E2E_RUN_KEY'] = savedKey;
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  it('RNF-005 every run gets a fresh key, never the unkeyed one', async () => {
    await prepareRun(root, Date.now());
    const first = process.env['ROSETTA_E2E_RUN_KEY'];
    await prepareRun(root, Date.now());
    const second = process.env['ROSETTA_E2E_RUN_KEY'];

    expect(first).toMatch(uuid);
    expect(second).toMatch(uuid);
    expect(second).not.toBe(first);
  });

  it('RNF-005 the setup Playwright runs gives the run its key', async () => {
    delete process.env['ROSETTA_E2E_RUN_KEY'];

    await globalSetup();

    expect(process.env['ROSETTA_E2E_RUN_KEY']).toMatch(uuid);
  });

  it('RNF-005 the setup removes caps lock folders older than a day and keeps the younger ones', async () => {
    const now = Date.now();
    const old = join(root, 'rosetta-e2e-caps-lock-18150-killed-run');
    const young = join(root, 'rosetta-e2e-caps-lock-18150-running-run');
    await mkdir(old);
    await mkdir(young);
    await utimes(old, new Date(now - 2 * DAY_MS), new Date(now - 2 * DAY_MS));

    await prepareRun(root, now);

    expect(await exists(old)).toBe(false);
    expect(await exists(young)).toBe(true);
  });
});

describe('e2e run wiring, the teardown and the config', () => {
  let savedKey: string | undefined;
  let savedDatabase: string | undefined;

  beforeEach(() => {
    savedKey = process.env['ROSETTA_E2E_RUN_KEY'];
    savedDatabase = process.env['ROSETTA_TEST_DATABASE_URL'];
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env['ROSETTA_E2E_RUN_KEY'];
    else process.env['ROSETTA_E2E_RUN_KEY'] = savedKey;
    if (savedDatabase === undefined) delete process.env['ROSETTA_TEST_DATABASE_URL'];
    else process.env['ROSETTA_TEST_DATABASE_URL'] = savedDatabase;
  });

  it('RNF-005 the teardown removes the caps lock folder of its run', async () => {
    process.env['ROSETTA_E2E_RUN_KEY'] = `teardown-${String(Date.now())}`;
    process.env['ROSETTA_TEST_DATABASE_URL'] = '';
    const folder = capsLockFolder();
    await mkdir(folder, { recursive: true });

    await globalTeardown();

    expect(await exists(folder)).toBe(false);
  });

  it('RNF-005 playwright.config.ts names the global setup and the global teardown', async () => {
    const config = await readFile(join(process.cwd(), 'playwright.config.ts'), 'utf8');

    expect(config).toContain("globalSetup: './tests/e2e/support/global-setup.ts'");
    expect(config).toContain("globalTeardown: './tests/e2e/support/global-teardown.ts'");
  });
});
