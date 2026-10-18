import { randomUUID } from 'node:crypto';
import { PgProjectRepository } from '../../../src/infrastructure/db/pg-project-repository.js';
import { PgRunIndex } from '../../../src/infrastructure/db/pg-run-index.js';
import { PgUserRepository } from '../../../src/infrastructure/db/pg-user-repository.js';
import { createPool } from '../../../src/infrastructure/db/pool.js';
import { SystemClock } from '../../../src/infrastructure/system/system-clock.js';
import { sampleRun } from '../../support/run-fixtures.js';
import { disposableSchemaUrl } from './database.js';
import { e2ePort } from './server-config.js';

// GENERATED RUN ONLY (RNF-003), RF-605: gives an account's project a plan run that ended `Completed`
// an hour ago, so the package exists and a brief saved now is newer than it. The page then says the
// package is out of date. The run has no files: the page reads only its place in the run list.

const anHour = 60 * 60 * 1000;

/** Adds a completed plan run to the first project of the account (the one its spec made). */
// RF-605
export async function leaveAPackage(userName: string): Promise<void> {
  const pool = createPool({
    connectionString: disposableSchemaUrl(
      process.env['ROSETTA_TEST_DATABASE_URL'] ?? '',
      e2ePort(),
    ),
    onIdleError: () => undefined,
  });
  try {
    const user = await new PgUserRepository(pool).findByUserName(userName);
    if (user === undefined) throw new Error(`The account ${userName} does not exist.`);
    const project = (await new PgProjectRepository(pool).list(user.id))[0];
    if (project === undefined) throw new Error(`The account ${userName} has no project.`);
    const startedAt = new SystemClock().now().getTime() - anHour;
    const inserted = await new PgRunIndex(pool).insert(
      sampleRun({
        ...{ id: randomUUID(), projectId: project.id, userId: user.id, stage: 'plan' },
        ...{ runKey: '20260101-000000-plan', queueState: 'Ended', endState: 'Completed' },
        ...{ queuedAt: startedAt - 1000, startedAt, endedAt: startedAt + 1000 },
      }),
    );
    if (!inserted.ok) throw new Error('The package run was refused.');
  } finally {
    await pool.end();
  }
}
