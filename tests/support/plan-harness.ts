import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { vi } from 'vitest';
import type { AnswerEntry, OpenQuestion } from '../../src/application/ports/answers-file.js';
import { RunLifecycle } from '../../src/application/runs/run-lifecycle.js';
import { RunQueue } from '../../src/application/runs/run-queue.js';
import { scopeOf } from '../../src/application/runs/run-scope.js';
import { BuildPlan } from '../../src/application/use-cases/build-plan.js';
import { SubmitRun } from '../../src/application/use-cases/submit-run.js';
import type { Project } from '../../src/application/projects/project.js';
import type { Card } from '../../src/domain/cards/card.js';
import { buildBrief, type BriefAnswers } from '../../src/domain/planning/planning-brief.js';
import type { RunManifest } from '../../src/domain/runs/run-manifest.js';
import type { Run } from '../../src/domain/runs/run.js';
import { FileCostReportWriter } from '../../src/infrastructure/budget/cost-report-files.js';
import { FileAnswersFile } from '../../src/infrastructure/cards/answers-file.js';
import { FileCardOutputs } from '../../src/infrastructure/cards/file-card-outputs.js';
import { FileRunCards } from '../../src/infrastructure/cards/file-run-cards.js';
import { MemoryCostTotals } from '../../src/infrastructure/db/memory-cost-totals.js';
import { FanOutSink } from '../../src/infrastructure/events/fan-out-sink.js';
import { FilePlanningBriefStore } from '../../src/infrastructure/files/file-planning-brief-store.js';
import { runPath } from '../../src/infrastructure/files/workspace-paths.js';
import { FileHandoffWriter } from '../../src/infrastructure/handoff/file-handoff-writer.js';
import { loadPlannerPrompt } from '../../src/infrastructure/prompts/prompt-files.js';
import type { Recording } from '../../src/infrastructure/providers/fake/recording.js';
import { sampleAccount } from './account-fixtures.js';
import { cardSource } from './card-fixtures.js';
import { shippedCatalogue } from './planning-brief-harness.js';
import { sampleProject } from './project-fixtures.js';
import { sampleManifest, sampleRun } from './run-fixtures.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';
import { understandSettings } from './understand-run-harness.js';
import { understandProviders, type UnderstandProviders } from './understand-providers.js';
import { stores, type Stores } from './understand-run-services.js';

// RF-601..RF-604, ADR-008: a plan run over real files in a temporary data folder, with the real
// provider factory and guards in front of a fake planner that replays a recording. The understand
// run it plans from is seeded: its row, its manifest, its card files, the project's answers and
// the planning brief, written by the real adapters.

const account = sampleAccount({ userName: 'plan.user' });
const actor = { userId: account.id, role: 'user' } as const;
const commitSha = '3f786850e387550fdab836ed7e6dc881de23001b';

export interface PlanHarness {
  readonly s: Stores;
  readonly project: Project;
  readonly providers: UnderstandProviders;
  /** Seeds an understand run with these cards and open questions; returns its row. */
  understandRun(seed: UnderstandSeed): Promise<Run>;
  answer(run: Run, answers: readonly AnswerEntry[]): Promise<void>;
  saveBrief(answers: BriefAnswers): Promise<void>;
  /** Starts a plan run as the queue does and waits for its end. */
  plan(): Promise<Run>;
  manifestOf(run: Run): Promise<RunManifest>;
  /** Every file under the run's `handoff/`, by its path inside it. */
  handoffOf(run: Run): Promise<Readonly<Record<string, string>>>;
}

interface UnderstandSeed {
  readonly cards: readonly Card[];
  readonly questions?: readonly Pick<OpenQuestion, 'cardId' | 'question'>[];
  readonly endState?: Run['endState'];
}

function planExecutor(s: Stores, providers: UnderstandProviders): BuildPlan {
  const { writer, masker, logger, manifests, runs, projects } = s;
  return new BuildPlan({
    ...{ projects, runs, manifests, logger, users: s.users },
    briefs: new FilePlanningBriefStore({ writer, masker }),
    cards: new FileRunCards(writer),
    answers: new FileAnswersFile({ writer, masker }),
    providers: providers.factory,
    runSinks: providers.runSinks,
    ledger: providers.ledger,
    costTotals: new MemoryCostTotals(),
    costReports: new FileCostReportWriter({ writer, masker }),
    handoff: new FileHandoffWriter({ writer, masker }),
    catalogue: () => Promise.resolve(shippedCatalogue),
    prompt: () => loadPlannerPrompt('prompts'),
    ids: new SequenceIdGenerator(),
  });
}

function queueOf(s: Stores, providers: UnderstandProviders): RunQueue {
  const { runs, manifests, log, clock, logger } = s;
  const lifecycle = new RunLifecycle({
    ...{ runs, manifests, clock, logger },
    sink: new FanOutSink([log]),
    history: log,
  });
  return new RunQueue({
    ...{ runs, lifecycle, clock, logger },
    executors: { plan: planExecutor(s, providers) },
    maxRunning: 1,
  });
}

async function ended(s: Stores, run: Run): Promise<Run> {
  let latest: Run | undefined;
  await vi.waitFor(
    async () => {
      latest = await s.runs.find(run.userId, run.id);
      if (latest?.queueState !== 'Ended') throw new Error('The run has not ended');
      const events = await s.log.read(scopeOf(latest), 0);
      if (events.at(-1)?.type !== 'run.ended') throw new Error('No run.ended yet');
    },
    { timeout: 30_000, interval: 2 },
  );
  if (latest === undefined) throw new Error('The run vanished');
  return latest;
}

/** The files under the folder; none when the folder does not exist. */
async function filesUnder(root: string): Promise<Record<string, string>> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch(
    (error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
      throw error;
    },
  );
  const files: Record<string, string> = {};
  for (const entry of entries.filter((each) => each.isFile())) {
    const absolute = join(entry.parentPath, entry.name);
    const path = absolute
      .slice(root.length + 1)
      .split('\\')
      .join('/');
    files[path] = await readFile(absolute, 'utf8');
  }
  return files;
}

async function seedRun(s: Stores, project: Project, seed: UnderstandSeed): Promise<Run> {
  const run = sampleRun({
    ...{ userId: account.id, projectId: project.id, stage: 'understand' },
    ...{ runKey: '20261012-090000-understand', commitSha, snapshotKey: `octo__demo@${commitSha}` },
    ...{ queueState: 'Ended', endState: seed.endState ?? 'Completed' },
  });
  await s.runs.insert(run);
  const source = {
    ...sampleManifest().source,
    commitSha,
    snapshotHash: `sha256:${'cd'.repeat(32)}`,
  };
  const manifest = sampleManifest({ runId: run.runKey, stage: 'understand', source });
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

/** The user and the project of the plan runs; the planner is the fake model. */
async function projectOf(s: Stores): Promise<Project> {
  await s.users.insert(account);
  const settings = understandSettings((base) => ({
    ...base,
    roles: {
      ...base.roles,
      planner: { ...base.roles.planner, provider: 'fake', model: 'fake-model' },
    },
  }));
  const project = sampleProject({
    userId: account.id,
    sourceUrl: 'https://github.com/octo/demo',
    settings,
  });
  await s.projects.insertOrFind(project);
  return project;
}

// RF-604
export async function createPlanHarness(
  dataDir: string,
  recording: Recording,
): Promise<PlanHarness> {
  const s = stores(dataDir);
  const project = await projectOf(s);
  const { writer, masker, logger, clock } = s;
  const providers = understandProviders({ dataDir, writer, masker, clock, logger, recording });
  const queue = queueOf(s, providers);
  const submit = new SubmitRun({
    ...{ runs: s.runs, manifests: s.manifests, queue, clock },
    ids: new SequenceIdGenerator(),
    rosettaVersion: '1.2.3-test',
  });
  const ref = { userId: account.id, projectId: project.id };
  return {
    s,
    project,
    providers,
    understandRun: (seed) => seedRun(s, project, seed),
    async answer(run, answers) {
      await new FileAnswersFile({ writer, masker }).recordAnswers(ref, run.runKey, answers);
    },
    async saveBrief(answers) {
      const brief = {
        ...buildBrief(answers, shippedCatalogue),
        savedAt: '2026-10-12T09:30:00.000Z',
      };
      await new FilePlanningBriefStore({ writer, masker }).write(ref, brief);
    },
    async plan() {
      const submitted = await submit.execute({ actor, project, stage: 'plan', options: {} });
      if (!submitted.ok) throw new Error(`The plan run was refused: ${submitted.error}`);
      return ended(s, submitted.value.run);
    },
    async manifestOf(run) {
      const manifest = await s.manifests.read(scopeOf(run));
      if (manifest === undefined) throw new Error('The run has no manifest');
      return manifest;
    },
    handoffOf: (run) =>
      filesUnder(join(dataDir, 'users', account.id, runPath(run.projectId, run.runKey), 'handoff')),
  };
}
