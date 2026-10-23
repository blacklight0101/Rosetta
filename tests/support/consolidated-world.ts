import { planInputs } from '../../src/application/plan/plan-inputs.js';
import { scopeOf } from '../../src/application/runs/run-scope.js';
import { BuildReport } from '../../src/application/use-cases/build-report.js';
import { GetJourney } from '../../src/application/use-cases/get-journey.js';
import { ListAnswers } from '../../src/application/use-cases/list-answers.js';
import { RecordAnswers } from '../../src/application/use-cases/record-answers.js';
import { ReopenQuestion } from '../../src/application/use-cases/reopen-question.js';
import type { RecordedQuestion } from '../../src/application/ports/answers-file.js';
import type { StatedQuestion } from '../../src/application/use-cases/question-states.js';
import type { Run } from '../../src/domain/runs/run.js';
import { actorOf, type Actor } from '../../src/domain/accounts/actor.js';
import type { Card } from '../../src/domain/cards/card.js';
import { applyMerges } from '../../src/domain/cards/card-merge.js';
import { CARD_TYPES } from '../../src/domain/cards/card-vocabulary.js';
import { FileAnswersFile } from '../../src/infrastructure/cards/answers-file.js';
import { FileCardOutputs } from '../../src/infrastructure/cards/file-card-outputs.js';
import { FilePriorCards } from '../../src/infrastructure/cards/prior-cards.js';
import { FileRunCards } from '../../src/infrastructure/cards/file-run-cards.js';
import { MemoryProjectRepository } from '../../src/infrastructure/db/memory-project-repository.js';
import { MemoryRunIndex } from '../../src/infrastructure/db/memory-run-index.js';
import { MemoryEventSink } from '../../src/infrastructure/events/memory-event-sink.js';
import { FilePlanningBriefStore } from '../../src/infrastructure/files/file-planning-brief-store.js';
import { MemoryRunManifestStore } from '../../src/infrastructure/files/memory-run-manifest-store.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { sampleAccount } from './account-fixtures.js';
import { cardSource } from './card-fixtures.js';
import { FixedScans } from './estimate-harness.js';
import { MemoryOutputWriter } from './memory-output-writer.js';
import { base, claim, judgedCard, planCards } from './plan-cards.js';
import { seedPlanSource } from './plan-source-seed.js';
import { sampleProject } from './project-fixtures.js';
import { RecordingLogger } from './recording-logger.js';
import { MapRunTextFiles, RecordingReportWriter, reportFigures } from './report-doubles.js';
import { sampleRun } from './run-fixtures.js';

// P5-11, RF-243, RF-1007: a run whose open questions consolidation merged, over the real file
// adapters in memory. The cards are made by the real merge (`applyMerges`), so `mergedFrom` is what
// consolidation writes; `answers.md` is what the run filed before the merge. Every reader of the
// questions is built over the same files, so a test can compare what each one says.

/** A question as `answers.md` holds it. */
export interface Filed {
  readonly cardId: string;
  readonly question: string;
  readonly answer?: string;
}

const runKey = '20261012-090000-understand';

/** An open question card; the title is the question, so only the words differ between cards. */
export function oq(id: string, question: string): Card {
  return judgedCard(
    {
      ...base(id, 'OQ', question),
      question,
      whyItMatters: 'The new system must keep the rule.',
      claims: [claim(`The code asks about ${id}.`, 'src/Orders/Cancel.cs')],
    },
    ['Supported'],
  );
}

/** The cards with these ids merged into the first of them, as the title merge of P3-106 does. */
export function mergedInto(cards: readonly Card[], ids: readonly string[]): readonly Card[] {
  const merge = { ids, title: 'Who may cancel?', summary: 'Merged by consolidation.' };
  return applyMerges(cards, [merge], CARD_TYPES).cards;
}

type Entries = readonly { readonly cardId: string; readonly answer: string }[];

export interface World {
  readonly actor: Actor;
  readonly run: Run;
  readonly ref: { readonly userId: string; readonly projectId: string };
  readonly answers: FileAnswersFile;
  readonly priorCards: FilePriorCards;
  readonly list: () => Promise<readonly StatedQuestion[]>;
  readonly record: (entries: Entries) => ReturnType<RecordAnswers['execute']>;
  readonly reopen: (cardId: string) => ReturnType<ReopenQuestion['execute']>;
  readonly planQuestions: () => Promise<readonly RecordedQuestion[]>;
  readonly reportQuestions: () => Promise<readonly RecordedQuestion[]>;
  readonly journey: () => Promise<{ readonly openQuestions: number } | null | undefined>;
}

/** The project, the understand run and its card files, with the brief a plan needs. */
async function seeded(questions: readonly Card[]) {
  const account = sampleAccount({ userName: 'consolidated.user' });
  const project = sampleProject({ userId: account.id });
  const projects = new MemoryProjectRepository();
  await projects.insertOrFind(project);
  const files = new MemoryOutputWriter();
  const masker = new SecretMasker();
  const runs = new MemoryRunIndex();
  const briefs = new FilePlanningBriefStore({ writer: files, masker });
  await seedPlanSource({ files, briefs, runs }, project, { understand: false });
  const run = sampleRun({
    ...{ userId: project.userId, projectId: project.id, stage: 'understand', runKey },
    ...{ queueState: 'Ended', endState: 'Completed' },
  });
  await runs.insert(run);
  const logger = new RecordingLogger();
  const others = planCards().filter((card) => card.type !== 'OQ');
  await new FileCardOutputs({ writer: files, masker, logger }).writeCards(scopeOf(run), {
    cards: [...others, ...questions],
    source: cardSource,
    areasWithoutCards: [],
  });
  return { ...{ account, project, projects, files, masker, runs, briefs, run, logger } };
}

/** `answers.md` as the run filed it before consolidation. */
async function filedAnswers(
  seed: Awaited<ReturnType<typeof seeded>>,
  filed: readonly Filed[],
): Promise<FileAnswersFile> {
  const answers = new FileAnswersFile({ writer: seed.files, masker: seed.masker });
  const ref = { userId: seed.project.userId, projectId: seed.project.id };
  await answers.addQuestions(
    ref,
    filed.map(({ cardId, question }) => ({ cardId, question, runKey, context: 'ctx' })),
  );
  const given = filed.flatMap(({ cardId, answer }) =>
    answer === undefined ? [] : [{ cardId, answer }],
  );
  await answers.recordAnswers(ref, runKey, given);
  return answers;
}

type Seed = Awaited<ReturnType<typeof seeded>>;

/** What the report of the run lists as its questions. */
async function reportQuestionsOf(
  seed: Seed,
  answers: FileAnswersFile,
  priorCards: FilePriorCards,
): Promise<readonly RecordedQuestion[]> {
  const { runs, logger, run } = seed;
  const writer = new RecordingReportWriter();
  const parts = { runs, manifests: new MemoryRunManifestStore(), history: new MemoryEventSink() };
  const figures = { scans: new FixedScans([]), logger, ...reportFigures(), answers, priorCards };
  const files = new MapRunTextFiles({});
  await new BuildReport({ ...parts, ...figures, files, writer }).execute({
    actor: actorOf(seed.account),
    runId: run.id,
  });
  return writer.written[0]?.model.questions ?? [];
}

function readersOf(seed: Seed, answers: FileAnswersFile): Omit<World, 'actor' | 'run' | 'ref'> {
  const { project, run, runs, briefs, projects, logger, files } = seed;
  const actor = actorOf(seed.account);
  const priorCards = new FilePriorCards(files);
  const runCards = new FileRunCards(files);
  const manifests = new MemoryRunManifestStore();
  const history = new MemoryEventSink();
  const request = { actor, runId: run.id };
  const ref = { userId: project.userId, projectId: project.id };
  return {
    ...{ answers, priorCards },
    list: async () => {
      const listed = await new ListAnswers({ runs, answers, cards: priorCards }).execute(request);
      return listed.ok ? listed.value : [];
    },
    record: (entries) =>
      new RecordAnswers({ runs, answers, cards: priorCards }).execute({
        ...request,
        answers: entries,
      }),
    reopen: (cardId) =>
      new ReopenQuestion({ runs, answers, cards: priorCards, logger }).execute({
        ...request,
        cardId,
      }),
    planQuestions: async () => {
      const deps = { projects, runs, briefs, cards: runCards, answers, priorCards };
      const inputs = await planInputs(deps, ref);
      return inputs.ok ? inputs.value.questions : [];
    },
    reportQuestions: () => reportQuestionsOf(seed, answers, priorCards),
    journey: async () => {
      const deps = { projects, runs, manifests, history, briefs, answers, priorCards };
      const result = await new GetJourney({ ...deps, cards: runCards }).execute({
        ...{ actor, projectId: project.id, runId: run.id },
      });
      return result.ok ? result.value.source : undefined;
    },
  };
}

export async function worldOf(input: {
  /** The open question cards of the run after consolidation; the other cards are the plan's. */
  readonly questions: readonly Card[];
  /** The sections `answers.md` holds for the run, in file order. */
  readonly filed: readonly Filed[];
}): Promise<World> {
  const seed = await seeded(input.questions);
  const answers = await filedAnswers(seed, input.filed);
  const { project, run } = seed;
  const ref = { userId: project.userId, projectId: project.id };
  return { actor: actorOf(seed.account), run, ref, ...readersOf(seed, answers) };
}
