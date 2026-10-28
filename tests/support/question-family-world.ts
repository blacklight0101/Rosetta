import { planInputs } from '../../src/application/plan/plan-inputs.js';
import { scopeOf } from '../../src/application/runs/run-scope.js';
import { GetJourney } from '../../src/application/use-cases/get-journey.js';
import { ListAnswers } from '../../src/application/use-cases/list-answers.js';
import { RecordAnswers } from '../../src/application/use-cases/record-answers.js';
import { ReopenQuestion } from '../../src/application/use-cases/reopen-question.js';
import type { JourneySource } from '../../src/application/journey/journey.js';
import type { ListedAnswers } from '../../src/application/use-cases/list-answers.js';
import type {
  AnswerEntry,
  RecordedQuestion,
  SuggestedOption,
} from '../../src/application/ports/answers-file.js';
import { actorOf } from '../../src/domain/accounts/actor.js';
import type { Card } from '../../src/domain/cards/card.js';
import type { Run } from '../../src/domain/runs/run.js';
import { FileCardOutputs } from '../../src/infrastructure/cards/file-card-outputs.js';
import { FileAnswersFile } from '../../src/infrastructure/cards/answers-file.js';
import { FilePriorCards } from '../../src/infrastructure/cards/prior-cards.js';
import { FileRunCards } from '../../src/infrastructure/cards/file-run-cards.js';
import { MemoryProjectRepository } from '../../src/infrastructure/db/memory-project-repository.js';
import { MemoryRunIndex } from '../../src/infrastructure/db/memory-run-index.js';
import { MemoryEventSink } from '../../src/infrastructure/events/memory-event-sink.js';
import { projectPath } from '../../src/infrastructure/files/workspace-paths.js';
import { FilePlanningBriefStore } from '../../src/infrastructure/files/file-planning-brief-store.js';
import { MemoryRunManifestStore } from '../../src/infrastructure/files/memory-run-manifest-store.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { sampleAccount } from './account-fixtures.js';
import { cardSource } from './card-fixtures.js';
import { MemoryOutputWriter } from './memory-output-writer.js';
import { planCards } from './plan-cards.js';
import { seedPlanSource } from './plan-source-seed.js';
import { sampleProject } from './project-fixtures.js';
import { RecordingLogger } from './recording-logger.js';
import { sampleManifest, sampleRun } from './run-fixtures.js';

// RF-646, DEC-179: a project whose understand run has Deepens, over the real file adapters in memory.
// Each run has its cards and its sections of `answers.md`, written as the file holds them (a
// project saved before DEC-179 can hold the same question twice, which the adapter no longer writes).

/** A section of `answers.md`. */
interface Section {
  readonly id: string;
  readonly question: string;
  readonly answer?: string;
  readonly options?: readonly SuggestedOption[];
  readonly chosen?: string;
}

export interface RunSpec {
  /** The index (in `runs`) of the run this one deepens; none for the first understand run. */
  readonly deepens?: number;
  /** The open question cards of the run (a Deepen holds copies of its parent's too). */
  readonly cards: readonly Card[];
  /** The sections the run filed. */
  readonly sections: readonly Section[];
  /** The ids of the cards marked Answered. */
  readonly answered?: readonly string[];
}

export const threeOptions: readonly SuggestedOption[] = [
  { answer: 'Managers only', description: 'Only managers cancel.', recommended: true },
  { answer: 'Any staff', description: 'Every member of staff cancels.', recommended: false },
  {
    answer: 'Managers, with a limit',
    description: 'Managers cancel up to a limit.',
    recommended: false,
  },
];

const keyOf = (index: number): string => `2026101${String(index)}-090000-understand`;

const optionText = (options: readonly SuggestedOption[]): string =>
  options
    .map(
      (each) => `${each.recommended ? '(Recommended) ' : ''}${each.answer} - ${each.description}`,
    )
    .join('; ');

function sectionText(runKey: string, section: Section): string {
  const options =
    section.options === undefined
      ? []
      : [
          `- Options: ${optionText(section.options)}`,
          `- Chosen: ${section.chosen ?? ''}`.trimEnd(),
        ];
  return [
    `## ${section.id} - ${section.question}`,
    '',
    `- Card: runs/${runKey}/cards/OQ/${section.id}.md`,
    '- Context: src/Orders/Cancel.cs:3-9 Cancel checks no role.',
    ...options,
    `- Answer: ${section.answer ?? ''}`.trimEnd(),
  ].join('\n');
}

type Stores = Awaited<ReturnType<typeof storesOf>>;

async function storesOf() {
  const account = sampleAccount({ userName: 'family.user' });
  const project = sampleProject({ userId: account.id });
  const projects = new MemoryProjectRepository();
  await projects.insertOrFind(project);
  const files = new MemoryOutputWriter();
  const masker = new SecretMasker();
  const runs = new MemoryRunIndex();
  const briefs = new FilePlanningBriefStore({ writer: files, masker });
  await seedPlanSource({ files, briefs, runs }, project, { understand: false });
  const ref = { userId: project.userId, projectId: project.id };
  return {
    ...{ account, project, projects, files, masker, runs, briefs, ref },
    manifests: new MemoryRunManifestStore(),
    priorCards: new FilePriorCards(files),
  };
}

/** Inserts the runs, their card files and manifests, and writes `answers.md`. */
async function seedRuns(stores: Stores, specs: readonly RunSpec[]): Promise<readonly Run[]> {
  const { project, files, masker, runs, manifests, priorCards, ref } = stores;
  const outputs = new FileCardOutputs({ writer: files, masker, logger: new RecordingLogger() });
  const made: Run[] = [];
  for (const [index, spec] of specs.entries()) {
    const run = sampleRun({
      ...{ userId: project.userId, projectId: project.id, stage: 'understand' },
      ...{ runKey: keyOf(index), queueState: 'Ended', endState: 'Completed' },
    });
    made.push(run);
    await runs.insert(run);
    const others = planCards().filter((card) => card.type !== 'OQ');
    await outputs.writeCards(scopeOf(run), {
      cards: [...others, ...spec.cards],
      source: cardSource,
      areasWithoutCards: [],
    });
    await priorCards.markAnswered(ref, run.runKey, spec.answered ?? []);
    const parent = spec.deepens === undefined ? undefined : made[spec.deepens];
    const deepen = parent === undefined ? {} : { deepen: deepenRecord(parent) };
    await manifests.write(
      scopeOf(run),
      sampleManifest({ stage: 'understand', runId: run.runKey, ...deepen }),
    );
  }
  const text = specs
    .flatMap((spec, index) => spec.sections.map((section) => sectionText(keyOf(index), section)))
    .join('\n\n');
  const path = `${projectPath(ref.projectId)}/answers.md`;
  await files.writeText({ userId: ref.userId, path }, `# Answers to open questions\n\n${text}\n`);
  return made;
}

export interface FamilyWorld {
  readonly answersText: () => string;
  readonly list: (index: number) => Promise<ListedAnswers>;
  readonly record: (
    index: number,
    entries: readonly AnswerEntry[],
  ) => ReturnType<RecordAnswers['execute']>;
  readonly reopen: (index: number, cardId: string) => ReturnType<ReopenQuestion['execute']>;
  readonly planQuestions: (index: number) => Promise<readonly RecordedQuestion[]>;
  readonly journey: (index: number) => Promise<JourneySource | null | undefined>;
}

export async function familyWorld(specs: readonly RunSpec[]): Promise<FamilyWorld> {
  const stores = await storesOf();
  const made = await seedRuns(stores, specs);
  const { account, project, projects, files, masker, runs, briefs, manifests, priorCards, ref } =
    stores;
  const answers = new FileAnswersFile({ writer: files, masker });
  const actor = actorOf(account);
  const deps = { runs, answers, cards: priorCards, manifests };
  const runCards = new FileRunCards(files);
  const at = (index: number): Run => {
    const run = made[index];
    if (run === undefined) throw new Error(`No run ${String(index)}`);
    return run;
  };
  return {
    ...{ ref, files, answers, priorCards, at, actor },
    answersText: () => files.files.get(`${projectPath(ref.projectId)}/answers.md`) ?? '',
    list: async (index: number) => {
      const listed = await new ListAnswers(deps).execute({ actor, runId: at(index).id });
      if (!listed.ok) throw new Error('not found');
      return listed.value;
    },
    record: (index: number, entries: readonly AnswerEntry[]) =>
      new RecordAnswers(deps).execute({ actor, runId: at(index).id, answers: entries }),
    reopen: (index: number, cardId: string) =>
      new ReopenQuestion({ ...deps, logger: new RecordingLogger() }).execute({
        ...{ actor, cardId, runId: at(index).id },
      }),
    planQuestions: async (index: number) => {
      const plan = { projects, runs, briefs, cards: runCards, answers, priorCards };
      const inputs = await planInputs(plan, ref, at(index).id, manifests);
      return inputs.ok ? inputs.value.questions : [];
    },
    journey: async (index: number) => {
      const journey = new GetJourney({
        ...{ projects, runs, manifests, briefs, answers, priorCards },
        history: new MemoryEventSink(),
        cards: runCards,
      });
      const result = await journey.execute({ actor, projectId: project.id, runId: at(index).id });
      return result.ok ? result.value.source : undefined;
    },
  };
}

function deepenRecord(parent: Run) {
  return {
    ...{ parentRunId: parent.id, parentRunKey: parent.runKey, maxRounds: 1, coveragePass: false },
    ...{ roundsDone: 1, stopReason: null, outOfScope: [], rounds: [], before: null, after: null },
  };
}
