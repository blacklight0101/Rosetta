import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { ScheduledJob, Scheduler } from '../../../src/application/ports/scheduler.js';
import { loadEnvironment } from '../../../src/infrastructure/config/environment.js';
import type { DatabasePool } from '../../../src/infrastructure/db/pool.js';
import { composeApplication } from '../../../src/presentation/composition-root.js';
import { auditEvent, insert } from '../../support/db-rows.js';
import { hasTestDatabase, useTestDatabase } from '../../support/postgres.js';
import { fixtureSecret } from '../../support/provider-key-fixtures.js';

// RF-1109, DEC-132, architecture.md section 7: the composed application registers its periodic
// jobs on the Scheduler port when it starts; the audit purge is one of them, every 24 hours. A
// task dropped from the composition root fails here.

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** 32 bytes as base64, built at run time (RNF-003: no secret-like literal). */
const testSecretKey = fixtureSecret(7);

/** A scheduler that only records what is registered; a test runs the jobs itself. */
class RecordingScheduler implements Scheduler {
  readonly registered: { readonly intervalMs: number; readonly job: ScheduledJob }[] = [];

  every(intervalMs: number, job: ScheduledJob): () => void {
    this.registered.push({ intervalMs, job });
    return () => undefined;
  }

  async runEvery(intervalMs: number): Promise<void> {
    for (const task of this.registered.filter((entry) => entry.intervalMs === intervalMs)) {
      await task.job();
    }
  }
}

const cleanups: string[] = [];

afterAll(async () => {
  await Promise.all(cleanups.map((path) => rm(path, { recursive: true, force: true })));
});

function oldAuditRow(action: string) {
  return auditEvent({ at: new Date(Date.now() - 400 * DAY), action });
}

async function auditActions(pool: DatabasePool): Promise<string[]> {
  const rows = await pool.query<{ action: string }>('SELECT action FROM audit_events');
  return rows.rows.map((row) => row.action);
}

describe.skipIf(!hasTestDatabase)('composition root scheduled tasks', () => {
  const database = useTestDatabase();

  it('RF-1109 registers every periodic task at start-up, the audit purge every 24 hours', async () => {
    const { pool, url } = await database.createSchema({ migrate: true });
    await insert(pool, oldAuditRow('before-start'));
    const dataDir = await mkdtemp(join(tmpdir(), 'rst-schedule-'));
    cleanups.push(dataDir);
    const scheduler = new RecordingScheduler();
    const application = composeApplication({
      environment: loadEnvironment({
        DATABASE_URL: url,
        ROSETTA_SECRET_KEY: testSecretKey,
        ROSETTA_PUBLIC_URL: 'http://127.0.0.1:8080',
        ROSETTA_DATA_DIR: dataDir,
      }),
      listen: { host: '127.0.0.1', port: 0 },
      output: { write: () => true },
      scheduler,
    });

    try {
      await application.start();
      await vi.waitFor(async () => {
        expect(await auditActions(pool)).toEqual([]);
      });

      expect(scheduler.registered.map((task) => task.intervalMs)).toEqual([
        DAY,
        HOUR,
        HOUR,
        MINUTE,
        DAY,
      ]);
      await insert(pool, oldAuditRow('after-start'));
      await scheduler.runEvery(DAY);
      expect(await auditActions(pool)).toEqual([]);
    } finally {
      await application.stop();
    }
  });
});
