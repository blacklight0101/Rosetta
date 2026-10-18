import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { FakeRosettaHost } from '../../support/fake-rosetta-host.js';

// RF-1304, RF-1107, P1-55: scripts/smoke.mjs, the smoke test of a deployment. Given BASE_URL it
// checks /healthz, the landing page, the sign-in of the smoke account and a cheap scan, removes the
// project it created and signs out. It runs here against a loopback stand-in of the server; the
// compose-smoke job of CI runs it against the real Compose stack.

const run = promisify(execFile);
const script = join(process.cwd(), 'scripts', 'smoke.mjs');

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

async function smoke(args: string[], env: Record<string, string> = {}): Promise<Outcome> {
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

const account = { ROSETTA_SMOKE_USER: 'teacher', ROSETTA_SMOKE_PASSWORD: 'fake-teacher-password' };

describe('scripts/smoke.mjs on a healthy deployment', () => {
  it('RF-1304 checks health, landing, sign-in and a scan, and passes', async () => {
    const { url } = await started();

    const outcome = await smoke([url], account);

    expect(outcome.output).toMatch(/ok\s+health/u);
    expect(outcome.output).toMatch(/ok\s+landing/u);
    expect(outcome.output).toMatch(/ok\s+sign-in/u);
    expect(outcome.output).toMatch(/ok\s+scan/u);
    expect(outcome.code).toBe(0);
  });

  it('RF-1304 reads BASE_URL from the environment when no argument is given', async () => {
    const { url } = await started();

    const outcome = await smoke([], { ...account, BASE_URL: url });

    expect(outcome.code).toBe(0);
  });

  it('RF-1107 removes the project it created and signs out, so the workspace stays empty', async () => {
    const { host: fake, url } = await started();

    await smoke([url], account);

    expect(fake.calls()).toEqual(
      expect.arrayContaining(['DELETE /api/projects/project-1', 'DELETE /api/session']),
    );
    expect(fake.calls().at(-1)).toBe('DELETE /api/session');
  });
});

describe('scripts/smoke.mjs keeps the workspace as it was', () => {
  it('RF-1107 leaves a project that already existed in place', async () => {
    const { host: fake, url } = await started();
    fake.behaviour.projectExists = true;

    const outcome = await smoke([url], account);

    expect(outcome.code).toBe(0);
    expect(fake.calls()).not.toContain('DELETE /api/projects/project-1');
  });

  it('RNF-003 never prints the password', async () => {
    const { url } = await started();

    const outcome = await smoke([url], account);

    expect(outcome.output).not.toContain(account.ROSETTA_SMOKE_PASSWORD);
  });

  it('RF-1009 sends the public origin and the CSRF token with every state-changing request', async () => {
    const { host: fake, url } = await started();

    await smoke([url], account);

    const changes = fake.received.filter((request) => request.method !== 'GET');
    expect(changes.length).toBeGreaterThan(3);
    expect(changes.every((request) => request.headers.origin === url)).toBe(true);
  });
});

describe('scripts/smoke.mjs on a broken deployment', () => {
  it('RF-1303 fails when /healthz does not answer 200', async () => {
    const { host: fake, url } = await started();
    fake.behaviour.health = 503;

    const outcome = await smoke([url], account);

    expect(outcome.code).toBe(1);
    expect(outcome.output).toMatch(/FAIL\s+health/u);
  });

  it('RF-1100 fails when the account cannot sign in, and skips the scan', async () => {
    const { host: fake, url } = await started();
    fake.behaviour.password = 'another-password';

    const outcome = await smoke([url], account);

    expect(outcome.code).toBe(1);
    expect(outcome.output).toMatch(/FAIL\s+sign-in/u);
    expect(fake.calls()).not.toContain('POST /api/projects');
  });

  it('RF-1107 fails when the account must still change its password', async () => {
    const { host: fake, url } = await started();
    fake.behaviour.accountState = 'MustChangePassword';

    const outcome = await smoke([url], account);

    expect(outcome.code).toBe(1);
    expect(outcome.output).toMatch(/FAIL\s+sign-in.*password/u);
  });

  it('RF-1304 fails when the scan does not complete, and still removes its project', async () => {
    const { host: fake, url } = await started();
    fake.behaviour.endState = 'Failed';

    const outcome = await smoke([url], account);

    expect(outcome.code).toBe(1);
    expect(outcome.output).toMatch(/FAIL\s+scan.*Failed/u);
    expect(fake.calls()).toContain('DELETE /api/projects/project-1');
  });
});

describe('scripts/smoke.mjs usage', () => {
  it('RF-1304 exits 2 without a base URL', async () => {
    const outcome = await smoke([], account);

    expect(outcome.code).toBe(2);
    expect(outcome.output).toContain('BASE_URL');
  });

  it('RNF-003 exits 2 naming the variables when the account is not in the environment', async () => {
    const { url } = await started();

    const outcome = await smoke([url]);

    expect(outcome.code).toBe(2);
    expect(outcome.output).toContain('ROSETTA_SMOKE_USER');
    expect(outcome.output).toContain('ROSETTA_SMOKE_PASSWORD');
  });
});
