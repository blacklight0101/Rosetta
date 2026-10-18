import { join } from 'node:path';
import { vi } from 'vitest';
import type { AnswerEntry } from '../../src/application/ports/answers-file.js';
import type { ScanResults } from '../../src/application/ports/scan-results.js';
import { ERROR_CODES } from '../../src/domain/errors/codes.js';
import { RosettaError } from '../../src/domain/errors/rosetta-error.js';
import { RunLifecycle } from '../../src/application/runs/run-lifecycle.js';
import { RunQueue } from '../../src/application/runs/run-queue.js';
import { scopeOf } from '../../src/application/runs/run-scope.js';
import { EstimatePlan } from '../../src/application/estimate/estimate-plan.js';
import type { PlanEstimate } from '../../src/application/estimate/plan-estimate-types.js';
import type { ProjectSettings } from '../../src/application/projects/project-settings.js';
import { BuildPlan } from '../../src/application/use-cases/build-plan.js';
import { SubmitRun } from '../../src/application/use-cases/submit-run.js';
import type { Project } from '../../src/application/projects/project.js';
import { buildBrief, type BriefAnswers } from '../../src/domain/planning/planning-brief.js';
import type { RunManifest } from '../../src/domain/runs/run-manifest.js';
import type { Run } from '../../src/domain/runs/run.js';
import { FileCostReportWriter } from '../../src/infrastructure/budget/cost-report-files.js';
import { FileAnswersFile } from '../../src/infrastructure/cards/answers-file.js';
import { FileRunCards } from '../../src/infrastructure/cards/file-run-cards.js';
import { MemoryAccountUsage } from '../../src/infrastructure/db/memory-account-usage.js';
import { MemoryProviderKeyRepository } from '../../src/infrastructure/db/memory-provider-key-repository.js';
import { MemoryServerSettings } from '../../src/infrastructure/db/memory-server-settings.js';
import { MemoryCostTotals } from '../../src/infrastructure/db/memory-cost-totals.js';
import { FanOutSink } from '../../src/infrastructure/events/fan-out-sink.js';
import { FilePlanningBriefStore } from '../../src/infrastructure/files/file-planning-brief-store.js';
import { runPath } from '../../src/infrastructure/files/workspace-paths.js';
import { FileHandoffWriter } from '../../src/infrastructure/handoff/file-handoff-writer.js';
import {
  loadApiContractPrompt,
  loadDataModelPrompt,
  loadFlowsPrompt,
  loadPlannerPrompt,
  loadPrdPrompt,
} from '../../src/infrastructure/prompts/prompt-files.js';
import type { Recording } from '../../src/infrastructure/providers/fake/recording.js';
import { filesUnder } from './files-under.js';
import { budgetTable, contractPrice } from './budget-harness.js';
import { shippedCatalogue } from './planning-brief-harness.js';
import { account, seedRun, seedScan, type UnderstandSeed } from './plan-run-seeds.js';
import { sampleProject } from './project-fixtures.js';
import { serverKeyText } from './provider-factory-harness.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';
import { understandSettings } from './understand-run-harness.js';
import { understandProviders, type UnderstandProviders } from './understand-providers.js';
import { stores, type Stores } from './understand-run-services.js';

// RF-601..RF-604, ADR-008: a plan run over real files in a temporary data folder, with the real
// provider factory and guards in front of a fake planner that replays a recording. The understand
// run it plans from is seeded (row, manifest, cards, answers and brief) by the real adapters.

const actor = { userId: account.id, role: 'user' } as const;

export interface PlanHarness {
  readonly s: Stores;
  readonly project: Project;
  readonly providers: UnderstandProviders;
  /** Seeds an understand run with these cards and open questions; returns its row. */
  understandRun(seed: UnderstandSeed): Promise<Run>;
  answer(run: Run, answers: readonly AnswerEntry[]): Promise<void>;
  saveBrief(answers: BriefAnswers): Promise<void>;
  /** Seeds a scan run that ended `Completed` on the snapshot the understand run read. */
  seedScan(overrides?: Partial<Run>): Promise<Run>;
  /** Starts a plan run with these options as the queue does and waits for its end. */
  plan(options?: Readonly<Record<string, unknown>>): Promise<Run>;
  /** The plan estimate of the project, as the plan page shows it before the run starts. */
  estimate(): Promise<PlanEstimate>;
  /** Stops every running run, as the owner's stop does. */
  stopRunning(): Promise<void>;
  /** The folder of the run under the data folder. */
  runFolder(run: Run): string;
  manifestOf(run: Run): Promise<RunManifest>;
  /** Every file under the run's `handoff/`, by its path inside it. */
  handoffOf(run: Run): Promise<Readonly<Record<string, string>>>;
}

export interface PlanHarnessOptions {
  /** RF-143: the planner on OpenAI with the server's key, a provider that needs consent. */
  readonly cloudPlanner?: boolean;
  /** Changes the project settings, for example its caps (RF-613). */
  readonly settings?: (settings: ProjectSettings) => ProjectSettings;
  /** The scan results the plan run measures the data shapes from; none readable if absent. */
  readonly scans?: ScanResults;
  /** Runs before the planner call reaches the fake. */
  readonly beforeCall?: (harness: PlanHarness) => Promise<void>;
}

/** Scan results whose output is gone, as when a project has no readable scan. */
const goneScans: ScanResults = {
  open: () =>
    Promise.reject(new RosettaError(ERROR_CODES.codeMapMissing, 'The scan has no code map.')),
};

function planExecutor(s: Stores, providers: UnderstandProviders, scans: ScanResults): BuildPlan {
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
    prdPrompt: () => loadPrdPrompt('prompts'),
    dataModelPrompt: () => loadDataModelPrompt('prompts'),
    flowsPrompt: () => loadFlowsPrompt('prompts'),
    apiContractPrompt: () => loadApiContractPrompt('prompts'),
    ids: new SequenceIdGenerator(),
    scans,
  });
}

function queueOf(s: Stores, providers: UnderstandProviders, scans: ScanResults): RunQueue {
  const { runs, manifests, log, clock, logger } = s;
  const lifecycle = new RunLifecycle({
    ...{ runs, manifests, clock, logger },
    sink: new FanOutSink([log]),
    history: log,
  });
  return new RunQueue({
    ...{ runs, lifecycle, clock, logger },
    executors: { plan: planExecutor(s, providers, scans) },
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

/** The user and the project of the plan runs; the planner is the fake model. */
async function projectOf(s: Stores, options: PlanHarnessOptions): Promise<Project> {
  const cloud = options.cloudPlanner === true;
  await s.users.insert(account);
  const planner = cloud
    ? { provider: 'openai', model: contractPrice.model }
    : { provider: 'fake', model: 'fake-model' };
  const settings = understandSettings((base) =>
    (options.settings ?? ((each) => each))({
      ...base,
      roles: { ...base.roles, planner: { ...base.roles.planner, ...planner } },
    }),
  );
  const project = sampleProject({
    userId: account.id,
    sourceUrl: 'https://github.com/octo/demo',
    settings,
  });
  await s.projects.insertOrFind(project);
  return project;
}

interface HarnessParts {
  readonly s: Stores;
  readonly dataDir: string;
  readonly project: Project;
  readonly providers: UnderstandProviders;
  readonly queue: RunQueue;
}

async function estimateOf(s: Stores, project: Project): Promise<PlanEstimate> {
  const { writer, masker, clock, runs, projects, users } = s;
  const estimate = new EstimatePlan({
    ...{ projects, runs, users, clock, priceTable: budgetTable, serverKeys: { has: () => true } },
    briefs: new FilePlanningBriefStore({ writer, masker }),
    cards: new FileRunCards(writer),
    answers: new FileAnswersFile({ writer, masker }),
    usage: new MemoryAccountUsage(),
    serverSettings: new MemoryServerSettings({}),
    keys: new MemoryProviderKeyRepository(),
    ...{ catalogue: () => Promise.resolve(shippedCatalogue) },
    ...{ prompt: () => loadPlannerPrompt('prompts'), prdPrompt: () => loadPrdPrompt('prompts') },
    dataModelPrompt: () => loadDataModelPrompt('prompts'),
    flowsPrompt: () => loadFlowsPrompt('prompts'),
    apiContractPrompt: () => loadApiContractPrompt('prompts'),
  });
  const outcome = await estimate.execute({ actor, projectId: project.id });
  if (!outcome.ok) throw new Error(`The plan estimate was refused: ${outcome.error}`);
  return outcome.value;
}

function harnessOf(parts: HarnessParts): PlanHarness {
  const { s, dataDir, project, providers, queue } = parts;
  const { writer, masker } = s;
  const submit = new SubmitRun({
    ...{ runs: s.runs, manifests: s.manifests, queue, clock: s.clock },
    ids: new SequenceIdGenerator(),
    rosettaVersion: '1.2.3-test',
  });
  const ref = { userId: account.id, projectId: project.id };
  const folderOf = (run: Run): string =>
    join(dataDir, 'users', account.id, runPath(run.projectId, run.runKey));
  return {
    ...{ s, project, providers },
    understandRun: (seed) => seedRun(s, project, seed),
    seedScan: (overrides) => seedScan(s, project, overrides),
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
    async plan(options = {}) {
      const submitted = await submit.execute({ actor, project, stage: 'plan', options });
      if (!submitted.ok) throw new Error(`The plan run was refused: ${submitted.error}`);
      return ended(s, submitted.value.run);
    },
    async manifestOf(run) {
      const manifest = await s.manifests.read(scopeOf(run));
      if (manifest === undefined) throw new Error('The run has no manifest');
      return manifest;
    },
    estimate: () => estimateOf(s, project),
    async stopRunning() {
      for (const run of await s.runs.listRunning()) await queue.stop(run.userId, run.id);
    },
    runFolder: folderOf,
    handoffOf: (run) => filesUnder(join(folderOf(run), 'handoff')),
  };
}

// RF-604
export async function createPlanHarness(
  dataDir: string,
  recording: Recording,
  options: PlanHarnessOptions = {},
): Promise<PlanHarness> {
  const s = stores(dataDir);
  const cloud = options.cloudPlanner === true;
  const project = await projectOf(s, options);
  const { writer, masker, logger, clock } = s;
  const made: { harness?: PlanHarness } = {};
  const providers = understandProviders({
    ...{ dataDir, writer, masker, clock, logger, recording },
    ...(cloud ? { serverOpenAiKey: serverKeyText } : {}),
    beforeCall: async () => {
      if (made.harness !== undefined) await options.beforeCall?.(made.harness);
    },
  });
  const scans = options.scans ?? goneScans;
  made.harness = harnessOf({ s, dataDir, project, providers, queue: queueOf(s, providers, scans) });
  return made.harness;
}
