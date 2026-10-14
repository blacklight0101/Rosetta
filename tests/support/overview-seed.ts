import type { LedgerEntry } from '../../src/application/ports/cost-ledger.js';
import type { ProjectRepository } from '../../src/application/ports/project-repository.js';
import type { RunIndex } from '../../src/application/ports/run-index.js';
import { costEntry } from './cost-fixtures.js';
import { sampleProject } from './project-fixtures.js';
import { sampleRun } from './run-fixtures.js';

// RF-1008: a user with some projects, each with two runs and one ledger row, behind any adapters.
// Generated test data only.

/** Stores `count` projects of the user, newest last, with two runs and one ledger row each. */
export async function seedProjects(
  stores: {
    readonly projects: ProjectRepository;
    readonly runs: RunIndex;
    readonly addCost: (entry: LedgerEntry) => Promise<void>;
  },
  userId: string,
  count: number,
): Promise<void> {
  for (let number = 1; number <= count; number += 1) {
    const stored = await stores.projects.insertOrFind(
      sampleProject({ userId, name: `owner/seed-${String(number)}`, createdAt: number * 1_000 }),
    );
    const projectId = stored.project.id;
    const first = sampleRun({ userId, projectId });
    await stores.runs.insert(first);
    await stores.runs.insert(sampleRun({ userId, projectId }));
    await stores.addCost(costEntry(userId, { projectId, runId: first.id }));
  }
}
