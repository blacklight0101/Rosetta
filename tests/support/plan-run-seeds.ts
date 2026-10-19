import type { OpenQuestion } from '../../src/application/ports/answers-file.js';
import { scopeOf } from '../../src/application/runs/run-scope.js';
import type { Project } from '../../src/application/projects/project.js';
import type { Card } from '../../src/domain/cards/card.js';
import type { Run } from '../../src/domain/runs/run.js';
import { FileAnswersFile } from '../../src/infrastructure/cards/answers-file.js';
import { FileCardOutputs } from '../../src/infrastructure/cards/file-card-outputs.js';
import { sampleAccount } from './account-fixtures.js';
import { cardSource } from './card-fixtures.js';
import { sampleManifest, sampleRun } from './run-fixtures.js';
import type { Stores } from './understand-run-services.js';

// RF-601..RF-604, RF-632: what a plan test seeds before the plan run: the understand run it plans
// from (row, manifest, cards and open questions), the scan that run read, and the files the run wrote.

export const account = sampleAccount({ userName: 'plan.user' });
const commitSha = '3f786850e387550fdab836ed7e6dc881de23001b';

export interface UnderstandSeed {
  readonly cards: readonly Card[];
  readonly questions?: readonly Pick<OpenQuestion, 'cardId' | 'question'>[];
  readonly endState?: Run['endState'];
  /** RF-614: the folder name of the run, when a test seeds more than one understand run. */
  readonly runKey?: string;
  /** RF-614: the areas the run read, as its manifest options record them. */
  readonly areas?: readonly string[];
  /** RF-131: the run read an uploaded zip, not a repository; its manifest names the zip. */
  readonly upload?: { readonly fileName: string; readonly uploadedAt: string };
}

export async function seedRun(s: Stores, project: Project, seed: UnderstandSeed): Promise<Run> {
  const run = sampleRun({
    ...{ userId: account.id, projectId: project.id, stage: 'understand' },
    ...{
      runKey: seed.runKey ?? '20261012-090000-understand',
      ...(seed.upload === undefined
        ? { commitSha, snapshotKey: `octo__demo@${commitSha}` }
        : { commitSha: null, snapshotKey: `upload__${project.id}@${'cd'.repeat(8)}` }),
    },
    ...{ queueState: 'Ended', endState: seed.endState ?? 'Completed' },
  });
  await s.runs.insert(run);
  const snapshotHash = `sha256:${'cd'.repeat(32)}`;
  const source =
    seed.upload === undefined
      ? { ...sampleManifest().source, commitSha, snapshotHash }
      : {
          ...{ ...sampleManifest().source, kind: 'upload' as const, url: '', owner: '', repo: '' },
          ...{ commitSha: null, snapshotHash, ...seed.upload },
        };
  const options = seed.areas === undefined ? {} : { areas: seed.areas };
  const manifest = sampleManifest({ runId: run.runKey, stage: 'understand', source, options });
  await s.manifests.write(scopeOf(run), { ...manifest, codemapHash: `sha256:${'ab'.repeat(32)}` });
  const cards = new FileCardOutputs({ writer: s.writer, masker: s.masker, logger: s.logger });
  await cards.writeCards(scopeOf(run), {
    cards: seed.cards,
    source: cardSource,
    areasWithoutCards: [],
  });
  const questions = (seed.questions ?? []).map((question) => ({
    ...question,
    runKey: run.runKey,
    context: 'src/Orders/Cancel.cs:3-9 Cancel checks no role.',
  }));
  await new FileAnswersFile({ writer: s.writer, masker: s.masker }).addQuestions(
    { userId: account.id, projectId: project.id },
    questions,
  );
  return run;
}

/** A scan run that ended `Completed` on the snapshot the seeded understand run read. */
export async function seedScan(
  s: Stores,
  project: Project,
  overrides: Partial<Run> = {},
): Promise<Run> {
  const run = sampleRun({
    ...{ userId: account.id, projectId: project.id, stage: 'scan', commitSha },
    ...{ runKey: '20261012-080000-scan', snapshotKey: `octo__demo@${commitSha}` },
    ...{ queueState: 'Ended', endState: 'Completed', ...overrides },
  });
  await s.runs.insert(run);
  return run;
}
