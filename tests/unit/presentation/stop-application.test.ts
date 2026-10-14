import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadEnvironment } from '../../../src/infrastructure/config/environment.js';
import { composeApplication } from '../../../src/presentation/composition-root.js';
import { fixtureSecret } from '../../support/provider-key-fixtures.js';

// RF-1302, ADR-014 (P1-68): `stop()` of the composed application goes through the bounded stop.
// The pool factory is replaced by a pool on a frozen database, whose `end()` never settles.

vi.mock('../../../src/infrastructure/db/pool.js', async (importOriginal) => {
  const original = await importOriginal<object>();
  const { Pool } = await import('pg');
  class FrozenPool extends Pool {
    override end(): Promise<void> {
      return new Promise<void>(() => undefined);
    }
  }
  return { ...original, createAppPool: () => new FrozenPool() };
});

const deadlineMs = 5_000;
const folders: string[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(folders.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function composed(lines: string[]) {
  const dataDir = await mkdtemp(join(tmpdir(), 'rst-stop-'));
  folders.push(dataDir);
  const environment = loadEnvironment({
    DATABASE_URL: 'postgres://rosetta_app:secret@127.0.0.1:1/rosetta',
    ROSETTA_SECRET_KEY: fixtureSecret(7),
    ROSETTA_PUBLIC_URL: 'http://127.0.0.1:8080',
    ROSETTA_DATA_DIR: dataDir,
  });
  return composeApplication({
    environment,
    listen: { host: '127.0.0.1', port: 0 },
    output: {
      write: (text: string) => {
        lines.push(text);
      },
    },
  });
}

describe('composed application stop on a frozen database', () => {
  it('RF-1302 stop resolves deadline once the deadline passes and logs the warning', async () => {
    const lines: string[] = [];
    const application = await composed(lines);
    let outcome: string | undefined;

    const stopping = application.stop().then((value) => {
      outcome = value;
    });
    await vi.advanceTimersByTimeAsync(deadlineMs - 1);
    expect(outcome).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);
    await stopping;

    expect(outcome).toBe('deadline');
    expect(lines.join('')).toContain('"level":"warn"');
    expect(lines.join('')).toContain('Shutdown did not finish within 5000 ms');
  });
});
