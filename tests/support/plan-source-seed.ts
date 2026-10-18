import type { AnswersFile } from '../../src/application/ports/answers-file.js';
import type { PlanningBriefStore } from '../../src/application/ports/planning-brief-store.js';
import type { RunIndex } from '../../src/application/ports/run-index.js';
import type { Project } from '../../src/application/projects/project.js';
import { scopeOf } from '../../src/application/runs/run-scope.js';
import type { Card } from '../../src/domain/cards/card.js';
import { buildBrief, type BriefAnswers } from '../../src/domain/planning/planning-brief.js';
import type { Run } from '../../src/domain/runs/run.js';
import { FileAnswersFile } from '../../src/infrastructure/cards/answers-file.js';
import { FileCardOutputs } from '../../src/infrastructure/cards/file-card-outputs.js';
import { SecretMasker, type TextMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { cardSource } from './card-fixtures.js';
import type { MemoryOutputWriter } from './memory-output-writer.js';
import { planCards, planQuestions } from './plan-cards.js';
import { shippedCatalogue } from './planning-brief-harness.js';
import { RecordingLogger } from './recording-logger.js';
import { sampleRun } from './run-fixtures.js';

// RF-604, RF-613: what a plan run and the plan estimate are written from, seeded into memory: an
// understand run that ended `Completed` with its card files and open questions, the answer to the
// first question, and the project's saved planning brief. Each part is optional, so a test can
// leave one out.

export interface PlanSourceStores {
  /** The memory folder of the cards and of `answers.md`. */
  readonly files: MemoryOutputWriter;
  readonly briefs: PlanningBriefStore;
  readonly runs: Pick<RunIndex, 'insert'>;
}

export interface PlanSourceSeed {
  /** The cards of the understand run; the shared plan cards by default. */
  readonly cards?: readonly Card[];
  /** False seeds no understand run at all. */
  readonly understand?: boolean;
  /** False saves no planning brief. */
  readonly brief?: boolean;
  /** The answer to the first open question; none by default. */
  readonly answer?: string;
  readonly briefAnswers?: BriefAnswers;
  /**
   * Writes the cards as they are, with no masking: a card file that reached the disk with a secret in
   * it (edited by hand, or written before a rule existed), so the guards are the last defence.
   */
  readonly unmaskedCards?: boolean;
  /** Changes of the understand run row, for example a run that is still running or failed. */
  readonly run?: Partial<Run>;
}

const passThrough: TextMasker = {
  mask: (text) => ({
    text,
    counts: {
      'api-key': 0,
      'bearer-token': 0,
      'connection-string': 0,
      password: 0,
      'private-key': 0,
    },
  }),
};
const savedAt = '2026-10-12T09:30:00.000Z';

async function seedUnderstand(
  stores: PlanSourceStores,
  project: Project,
  seed: PlanSourceSeed,
): Promise<Run> {
  const { files } = stores;
  const masker = new SecretMasker();
  const cardMasker = seed.unmaskedCards === true ? passThrough : masker;
  const run = sampleRun({
    ...{ userId: project.userId, projectId: project.id, stage: 'understand' },
    ...{ runKey: '20261012-090000-understand', queueState: 'Ended', endState: 'Completed' },
    ...seed.run,
  });
  await stores.runs.insert(run);
  const cards = new FileCardOutputs({
    writer: files,
    masker: cardMasker,
    logger: new RecordingLogger(),
  });
  await cards.writeCards(scopeOf(run), {
    cards: seed.cards ?? planCards(),
    source: cardSource,
    areasWithoutCards: [],
  });
  const answers: AnswersFile = new FileAnswersFile({ writer: files, masker });
  const ref = { userId: project.userId, projectId: project.id };
  await answers.addQuestions(
    ref,
    planQuestions.map((question) => ({
      ...question,
      ...{ runKey: run.runKey, context: 'src/Orders/Cancel.cs:3-9 Cancel checks no role.' },
    })),
  );
  if (seed.answer !== undefined) {
    await answers.recordAnswers(ref, run.runKey, [{ cardId: 'OQ-001', answer: seed.answer }]);
  }
  return run;
}

/** Seeds the plan sources of the project; returns the understand run, if one was seeded. */
export async function seedPlanSource(
  stores: PlanSourceStores,
  project: Project,
  seed: PlanSourceSeed = {},
): Promise<Run | undefined> {
  if (seed.brief !== false) {
    const brief = { ...buildBrief(seed.briefAnswers ?? {}, shippedCatalogue), savedAt };
    await stores.briefs.write({ userId: project.userId, projectId: project.id }, brief);
  }
  if (seed.understand === false) return undefined;
  return seedUnderstand(stores, project, seed);
}
