import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRecording } from '../../src/infrastructure/providers/fake/recording.js';
import { customerCard, planCards, planQuestions } from './plan-cards.js';
import { createPlanHarness } from './plan-harness.js';

// RF-610, P6-27, ADR-008: a package from a plan with a data model, as one SHA-256 per file, so a
// test can prove the package is byte for byte what it was before the data cards could be dropped.
// The understand run has ENT cards and the planner replays tests/recordings/fake/planner-package.json.

export type MigrationStrategy = 'strangler-fig' | 'parallel-change' | 'rewrite';

/** The SHA-256 of every file of a package, by its path inside `handoff/`. */
export function hashesOf(files: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(files)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([path, text]) => [path, createHash('sha256').update(text, 'utf8').digest('hex')]),
  );
}

/** The files of the package of a plan with a data model for this migration strategy. */
export async function dataModelPackage(
  migration: MigrationStrategy,
): Promise<Readonly<Record<string, string>>> {
  const dataDir = await mkdtemp(join(tmpdir(), 'rosetta-golden-'));
  try {
    const recording = await loadRecording(
      join('tests', 'recordings', 'fake', 'planner-package.json'),
    );
    const h = await createPlanHarness(dataDir, recording);
    await h.understandRun({ cards: [...planCards(), customerCard()], questions: planQuestions });
    await h.saveBrief({
      architecture: { style: 'hexagonal' },
      migration,
      stack: [{ layer: 'database', choice: 'PostgreSQL', custom: false }],
    });
    return await h.handoffOf(await h.plan());
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}
