import { createPool } from '../../../src/infrastructure/db/pool.js';
import { PgProjectRepository } from '../../../src/infrastructure/db/pg-project-repository.js';
import { PgRunIndex } from '../../../src/infrastructure/db/pg-run-index.js';
import { PgUserRepository } from '../../../src/infrastructure/db/pg-user-repository.js';
import { scopeOf } from '../../../src/application/runs/run-scope.js';
import { replayDemoRunKey } from '../../support/replay-fixture.js';
import { sampleProject } from '../../support/project-fixtures.js';
import { writeRunFolder } from '../../support/run-output-harness.js';
import { sampleRun } from '../../support/run-fixtures.js';
import { preseededAccountFor } from './seed.js';

// RF-506, RF-507: the recorded run (tests/fixtures/runs/replay-demo) of every `replay` account of an
// end-to-end run, as an ended understand run with its files in the data folder. The report and the
// replay page are not written here: the spec asks for them through the API, as a person would.

const projectNames = ['desktop-light', 'desktop-dark', 'phone-light', 'phone-dark'] as const;

/** The id of the recorded run of the project (a Playwright project) in the disposable database. */
export function replayRunId(project: string): string {
  const position = projectNames.findIndex((name) => name === project);
  return `00000000-0000-4000-b0ee-${String(position + 1).padStart(12, '0')}`;
}

function projectId(project: string): string {
  const position = projectNames.findIndex((name) => name === project);
  return `00000000-0000-4000-a0ee-${String(position + 1).padStart(12, '0')}`;
}

/** Gives every `replay` account its project, its ended run and the run's files. */
export async function seedReplayRuns(databaseUrl: string, dataDir: string): Promise<void> {
  const pool = createPool({ connectionString: databaseUrl, onIdleError: () => undefined });
  try {
    const users = new PgUserRepository(pool);
    const projects = new PgProjectRepository(pool);
    const runs = new PgRunIndex(pool);
    for (const name of projectNames) {
      const user = await users.findByUserName(preseededAccountFor('replay', name).userName);
      if (user === undefined) throw new Error(`The replay account of ${name} does not exist.`);
      await projects.insertOrFind(
        sampleProject({ id: projectId(name), userId: user.id, name: 'octo/demo' }),
      );
      const run = sampleRun({
        id: replayRunId(name),
        projectId: projectId(name),
        userId: user.id,
        runKey: replayDemoRunKey,
        stage: 'understand',
        queueState: 'Ended',
        endState: 'Completed',
        startedAt: 1,
        endedAt: 2,
      });
      const inserted = await runs.insert(run);
      if (!inserted.ok) throw new Error(`The recorded run of ${name} was refused.`);
      await writeRunFolder(dataDir, scopeOf(run));
    }
  } finally {
    await pool.end();
  }
}
