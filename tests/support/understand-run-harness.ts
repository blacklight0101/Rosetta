import { join } from 'node:path';
import { expect } from 'vitest';
import type { ProjectSettings } from '../../src/application/projects/project-settings.js';
import type { Project } from '../../src/application/projects/project.js';
import type { RunQueue } from '../../src/application/runs/run-queue.js';
import { scopeOf } from '../../src/application/runs/run-scope.js';
import type { AnswerEntry } from '../../src/application/ports/answers-file.js';
import { FileAnswersFile } from '../../src/infrastructure/cards/answers-file.js';
import { FilePriorCards } from '../../src/infrastructure/cards/prior-cards.js';
import type { Result } from '../../src/domain/errors/result.js';
import type { RunEvent } from '../../src/domain/runs/run-event.js';
import type { RunManifest } from '../../src/domain/runs/run-manifest.js';
import type { Run } from '../../src/domain/runs/run.js';
import type { MemoryLogger } from './memory-logger.js';
import type { MemoryRunIndex } from '../../src/infrastructure/db/memory-run-index.js';
import { projectPath, runPath } from '../../src/infrastructure/files/workspace-paths.js';
import type { PriceTable } from '../../src/domain/budget/price-table.js';
import { readerRecordingOf, verifierRecordingOf } from './understand-recordings.js';
import { sampleAccount } from './account-fixtures.js';
import { settingsFor } from './provider-factory-harness.js';
import { uploadProjectFields } from './upload-run-fixtures.js';
import { sampleProject } from './project-fixtures.js';
import { queueOf, stores, type Stores } from './understand-run-services.js';
import {
  deepenerOf,
  resumerOf,
  starterOf,
  submitOf,
  type DeepenStart,
  type UnderstandStart,
} from './understand-run-starters.js';
import {
  understandProviders,
  type BeforeCall,
  type DecorateAnswer,
  type UnderstandProviderParts,
  type UnderstandProviders,
} from './understand-providers.js';

// RF-200, RF-005, RNF-002, ADR-008: a scan run and then an understand run on the C# fixture (or the
// `fixture` named), over memory indexes and real files in a temporary data folder, with the real
// provider factory and guards in front of a fake provider that replays a recording.

const account = sampleAccount({ userName: 'understand.user' });

/**
 * The fake reader, one task at a time (the fake replays its calls in order), and a fake verifier
 * of another model family (RF-301), so a run logs no self-preference warning unless a test asks.
 */
export function understandSettings(
  change: (settings: ProjectSettings) => ProjectSettings = (s) => s,
): ProjectSettings {
  const base = settingsFor({
    reader: { provider: 'fake', model: 'fake-model' },
    summariser: { provider: 'fake', model: 'fake-model' },
    verifier: { provider: 'fake', model: 'judge-model' },
  });
  return change({ ...base, agents: { parallelism: 1 } });
}

export interface UnderstandHarnessOptions {
  readonly dataDir: string;
  /** A file name under tests/recordings/fake/. */
  readonly recording: string;
  readonly fixture?: Stores['fixture'];
  /** A file replayed by the runs after the replays of `recording` (the re-run with answers). */
  readonly afterwards?: string;
  /** While it answers true the card writer of the understand runs refuses every card write. */
  readonly cardWritesFail?: () => boolean;
  /** A file name under tests/recordings/fake/ the `verifier` role replays (RF-301). */
  readonly verifierRecording?: string;
  /** The repository to scan, when a test changed a copy of the fixture (the C# fixture if absent). */
  readonly repository?: string;
  readonly settings?: ProjectSettings;
  /** RF-130: the project is an uploaded zip whose tree is the repository, not a GitHub address. */
  readonly upload?: boolean;
  /** How many understand runs replay the recording, one after the other (1 when absent). */
  readonly replays?: number;
  readonly decorateAnswer?: DecorateAnswer;
  /** The shipped price table the provider factory uses; the budget harness table by default. */
  readonly priceTable?: PriceTable;
  /** RF-427: the server's OpenAI key, or one the run's user owns; a cloud reader needs one. */
  /** A workspace that refuses to remove a card file, for a merge whose files cannot go. */
  readonly refuseRemoval?: boolean;
  readonly openAiKey?: { readonly of: 'server' | 'user'; readonly key: string };
  /** P2-24: an Anthropic key the run's user owns. */
  readonly anthropicKey?: string;
  readonly beforeCall?: (
    call: number,
    harness: UnderstandHarness,
    signal: AbortSignal,
  ) => Promise<void>;
  /** Like `beforeCall`, for the calls of the `verifier` role (the judgement step). */
  readonly beforeVerifierCall?: (
    call: number,
    harness: UnderstandHarness,
    signal: AbortSignal,
  ) => Promise<void>;
}

export interface UnderstandHarness {
  readonly project: Project;
  readonly logger: MemoryLogger;
  readonly providers: UnderstandProviders;
  readonly runs: MemoryRunIndex;
  /** Runs a scan of the project to its end. */
  scan(): Promise<Run>;
  /** Starts an understand run as the API does and waits for its end. */
  understand(start?: UnderstandStart): Promise<Run>;
  /** Writes answers into the project's `answers.md`, as the answers page does. */
  answer(run: Run, answers: readonly AnswerEntry[]): Promise<void>;
  /** Opens answered questions of the run again, as the Reopen button does; the cards it opened. */
  reopen(run: Run, cardIds: readonly string[]): Promise<readonly string[]>;
  /**
   * Resumes an ended run as the Resume button does and waits for its end; the refusal when the
   * run cannot be resumed.
   */
  resume(run: Run): Promise<Result<Run, string>>;
  /** RF-209: confirms a Deepen of a completed run as the Deepen button does and waits for its end. */
  deepen(run: Run, request?: DeepenStart): Promise<Result<Run, string>>;
  /** Saves new project settings, as the settings page does (for example raised caps). */
  changeSettings(change: (settings: ProjectSettings) => ProjectSettings): Promise<void>;
  /** Stops the running runs, as the Stop button does. */
  stopRunning(): Promise<void>;
  manifestOf(run: Run): Promise<RunManifest>;
  eventsOf(run: Run): Promise<readonly RunEvent[]>;
  /** The absolute folder of a run, and of the project. */
  runFolder(run: Run): string;
  projectFolder(): string;
}

interface HarnessParts {
  readonly s: Stores;
  readonly queue: RunQueue;
  readonly project: Project;
  readonly providers: UnderstandProviders;
  readonly dataDir: string;
}

function harnessOf(parts: HarnessParts): UnderstandHarness {
  const { s, queue, project, providers, dataDir } = parts;
  const submit = submitOf(s, queue);
  const start = starterOf(s, submit, project);
  const resume = resumerOf(s, queue);
  const deepen = deepenerOf(s, submit);
  return {
    ...{ project, logger: s.logger, providers, runs: s.runs },
    scan: () => start('scan', {}),
    understand: (extra = {}) => start('understand', extra),
    async answer(run, answers) {
      const recorded = await new FileAnswersFile({
        writer: s.writer,
        masker: s.masker,
      }).recordAnswers({ userId: run.userId, projectId: run.projectId }, run.runKey, answers);
      expect(recorded.ok).toBe(true);
    },
    reopen: (run, cardIds) =>
      new FilePriorCards(s.writer).reopen(
        { userId: run.userId, projectId: run.projectId },
        run.runKey,
        cardIds,
      ),
    resume,
    deepen,
    async changeSettings(change) {
      const current = await s.projects.find(account.id, project.id);
      if (current === undefined) throw new Error('The project vanished');
      await s.projects.updateSettings({
        ...{ userId: account.id, projectId: project.id, updatedAt: s.clock.now().getTime() },
        settings: change(current.settings),
        expectedVersion: undefined,
      });
    },
    async stopRunning() {
      for (const run of await s.runs.listRunning()) await queue.stop(run.userId, run.id);
    },
    async manifestOf(run) {
      const manifest = await s.manifests.read(scopeOf(run));
      if (manifest === undefined) throw new Error('The run has no manifest');
      return manifest;
    },
    eventsOf: (run) => s.log.read(scopeOf(run), 0),
    runFolder: (run) => join(dataDir, 'users', account.id, runPath(run.projectId, run.runKey)),
    projectFolder: () => join(dataDir, 'users', account.id, projectPath(project.id)),
  };
}

function keysOf(given: UnderstandHarnessOptions['openAiKey']): Partial<UnderstandProviderParts> {
  if (given === undefined) return {};
  return given.of === 'server'
    ? { serverOpenAiKey: given.key }
    : { ownOpenAiKey: { userId: account.id, key: given.key } };
}

// RF-200
export async function createUnderstandHarness(
  options: UnderstandHarnessOptions,
): Promise<UnderstandHarness> {
  const s = stores(
    options.dataDir,
    options.refuseRemoval === true,
    options.fixture,
    options.repository,
  );
  await s.users.insert(account);
  const project = sampleProject({
    userId: account.id,
    sourceUrl: 'https://github.com/octo/demo',
    settings: options.settings ?? understandSettings(),
    ...(options.upload === true ? uploadProjectFields : {}),
  });
  await s.projects.insertOrFind(project);
  const holder: { harness?: UnderstandHarness } = {};
  const beforeCall: BeforeCall = async (call, signal) =>
    holder.harness === undefined ? undefined : options.beforeCall?.(call, holder.harness, signal);
  const beforeVerifierCall: BeforeCall = async (call, signal) =>
    holder.harness === undefined
      ? undefined
      : options.beforeVerifierCall?.(call, holder.harness, signal);
  const providers = understandProviders({
    ...{ dataDir: options.dataDir, writer: s.writer, masker: s.masker, clock: s.clock },
    logger: s.logger,
    recording: await readerRecordingOf(options),
    beforeCall,
    beforeVerifierCall,
    ...(await verifierRecordingOf(options.verifierRecording)),
    ...(options.decorateAnswer === undefined ? {} : { decorateAnswer: options.decorateAnswer }),
    ...(options.priceTable === undefined ? {} : { priceTable: options.priceTable }),
    ...keysOf(options.openAiKey),
    ...(options.anthropicKey === undefined
      ? {}
      : { ownAnthropicKey: { userId: account.id, key: options.anthropicKey } }),
  });
  const queue = await queueOf(s, providers, options.cardWritesFail);
  const harness = harnessOf({ s, queue, project, providers, dataDir: options.dataDir });
  holder.harness = harness;
  return harness;
}
