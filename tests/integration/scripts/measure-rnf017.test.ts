import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { FakeRosettaHost } from '../../support/fake-rosetta-host.js';

// RNF-017, P1-55: scripts/measure-rnf017.mjs, the one-time measurement of the hosted deployment
// (docs/runbooks/deploy.md). While two runs are in progress it times the pages (P50 and P95, each
// under 1 second) and follows one run's event stream, timing each live event from its `at` to its
// arrival (every one within 2 seconds). Here it runs against a loopback stand-in of the server.

const run = promisify(execFile);
const script = join(process.cwd(), 'scripts', 'measure-rnf017.mjs');
const runId = '20261018-100000-scan';
const account = { ROSETTA_SMOKE_USER: 'teacher', ROSETTA_SMOKE_PASSWORD: 'fake-teacher-password' };

interface Outcome {
  readonly code: number;
  readonly output: string;
}

let host: FakeRosettaHost | undefined;

async function started(): Promise<{ host: FakeRosettaHost; url: string }> {
  host = new FakeRosettaHost();
  return { host, url: await host.start() };
}

afterEach(async () => {
  await host?.stop();
  host = undefined;
});

function outcomeOf(error: unknown): Outcome {
  const field = (name: string): string =>
    typeof error === 'object' && error !== null && name in error
      ? String(Reflect.get(error, name))
      : '';
  return { code: Number(field('code')), output: `${field('stdout')}${field('stderr')}` };
}

async function measure(args: string[], env: Record<string, string> = account): Promise<Outcome> {
  const base = { PATH: process.env['PATH'] ?? '', SYSTEMROOT: process.env['SYSTEMROOT'] ?? '' };
  try {
    const { stdout, stderr } = await run(process.execPath, [script, ...args], {
      env: { ...base, ...env },
      timeout: 30_000,
    });
    return { code: 0, output: `${stdout}${stderr}` };
  } catch (error) {
    return outcomeOf(error);
  }
}

describe('scripts/measure-rnf017.mjs', () => {
  it('RNF-017 reports P50 and P95 per page and the live event delay, and passes on a fast server', async () => {
    const { url } = await started();

    const outcome = await measure([url, '--run', runId, '--samples', '3']);

    expect(outcome.output).toMatch(/\/api\/projects.*p50.*p95/u);
    expect(outcome.output).toMatch(/events.*3 live/u);
    expect(outcome.output).toContain('RNF-017 pass');
    expect(outcome.code).toBe(0);
  });

  it('RNF-017 fails when a page takes a second or more', async () => {
    const { host: fake, url } = await started();
    fake.behaviour.landingDelayMs = 1_100;

    const outcome = await measure([url, '--run', runId, '--samples', '2']);

    expect(outcome.code).toBe(1);
    expect(outcome.output).toContain('RNF-017 FAIL');
    expect(outcome.output).toMatch(/FAIL\s+page \/ /u);
  });

  it('RNF-017 fails when a live event arrives more than 2 seconds after it was created', async () => {
    const { host: fake, url } = await started();
    fake.behaviour.eventLagMs = 2_200;

    const outcome = await measure([url, '--run', runId, '--samples', '1']);

    expect(outcome.code).toBe(1);
    expect(outcome.output).toMatch(/FAIL\s+events/u);
  }, 20_000);
});

describe('scripts/measure-rnf017.mjs failures and usage', () => {
  it('RNF-017 still reports the pages when the run cannot be followed', async () => {
    const { url } = await started();

    const outcome = await measure([url, '--run', 'no-such-run', '--samples', '1']);

    expect(outcome.code).toBe(1);
    expect(outcome.output).toMatch(/ok\s+page \/api\/projects/u);
    expect(outcome.output).toMatch(/FAIL\s+events.*404/u);
  });

  it('RNF-017 exits 2 without a run id', async () => {
    const { url } = await started();

    const outcome = await measure([url]);

    expect(outcome.code).toBe(2);
    expect(outcome.output).toContain('--run');
  });

  it('RNF-003 never prints the password', async () => {
    const { url } = await started();

    const outcome = await measure([url, '--run', runId, '--samples', '1']);

    expect(outcome.output).not.toContain(account.ROSETTA_SMOKE_PASSWORD);
  });
});
