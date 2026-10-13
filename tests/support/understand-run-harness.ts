import { join } from 'node:path';
import { expect, vi } from 'vitest';
import type { ProjectSettings } from '../../src/application/projects/project-settings.js';
import type { Project } from '../../src/application/projects/project.js';
import { RunLifecycle } from '../../src/application/runs/run-lifecycle.js';
import { RunQueue } from '../../src/application/runs/run-queue.js';
import { scopeOf } from '../../src/application/runs/run-scope.js';
import { RunScan } from '../../src/application/use-cases/run-scan.js';
import { RunUnderstand } from '../../src/application/use-cases/run-understand.js';
import { StartRun } from '../../src/application/use-cases/start-run.js';
import { SubmitRun } from '../../src/application/use-cases/submit-run.js';
import type { Actor } from '../../src/domain/accounts/actor.js';
import type { RunEvent } from '../../src/domain/runs/run-event.js';
import type { RunManifest } from '../../src/domain/runs/run-manifest.js';
import type { Run } from '../../src/domain/runs/run.js';
import { FileCostReportWriter } from '../../src/infrastructure/budget/cost-report-files.js';
import { FileAnswersFile } from '../../src/infrastructure/cards/answers-file.js';
import { FileCardOutputs } from '../../src/infrastructure/cards/file-card-outputs.js';
import { MemoryProjectRepository } from '../../src/infrastructure/db/memory-project-repository.js';
import { MemoryRunIndex } from '../../src/infrastructure/db/memory-run-index.js';
import { MemoryUserRepository } from '../../src/infrastructure/db/memory-user-repository.js';
import { FanOutSink } from '../../src/infrastructure/events/fan-out-sink.js';
import { JsonlEventLog } from '../../src/infrastructure/events/jsonl-event-log.js';
import { FileRunManifestStore } from '../../src/infrastructure/files/file-run-manifest-store.js';
import { NodeOutputWriter } from '../../src/infrastructure/files/node-output-writer.js';
import { projectPath, runPath } from '../../src/infrastructure/files/workspace-paths.js';
import { FakeSourceFetcher } from '../../src/infrastructure/github/fake-source-fetcher.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { loadReaderPrompts } from '../../src/infrastructure/prompts/prompt-files.js';
import {
  loadRecording,
  type Recording,
} from '../../src/infrastructure/providers/fake/recording.js';
import { loadTextToolProtocol } from '../../src/infrastructure/providers/ollama/text-tool-protocol-file.js';
import { CSharpPack } from '../../src/infrastructure/scan/packs/csharp/csharp-pack.js';
import { LanguagePackRegistry } from '../../src/infrastructure/scan/packs/pack-registry.js';
import { SnapshotScanPipeline } from '../../src/infrastructure/scan/scan-pipeline.js';
import { FileScanResults } from '../../src/infrastructure/scan/scan-results.js';
import { sampleAccount } from './account-fixtures.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryLogger } from './memory-logger.js';
import { settingsFor } from './provider-factory-harness.js';
import { sampleProject } from './project-fixtures.js';
import { fixtureRoot } from './scan-harness.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';
import {
  understandProviders,
  type BeforeCall,
  type UnderstandProviders,
} from './understand-providers.js';

// RF-200, RF-005, RNF-002, ADR-008: a scan run and then an understand run on the C# fixture, over
// memory indexes and real files in a temporary data folder, with the real provider factory and
// guards in front of a fake provider that replays a recording.

const account = sampleAccount({ userName: 'understand.user' });
const understandActor: Actor = { userId: account.id, role: 'user' };
const commitSha = 'c'.repeat(40);

/** The fake reader, one task at a time (the fake replays its calls in order). */
export function understandSettings(
  change: (settings: ProjectSettings) => ProjectSettings = (s) => s,
): ProjectSettings {
  const base = settingsFor({ reader: { provider: 'fake', model: 'fake-model' } });
  return change({ ...base, agents: { parallelism: 1 } });
}

export interface UnderstandHarnessOptions {
  readonly dataDir: string;
  /** A file name under tests/recordings/fake/. */
  readonly recording: string;
  readonly settings?: ProjectSettings;
  /** How many understand runs replay the recording, one after the other (1 when absent). */
  readonly replays?: number;
  readonly beforeCall?: (
    call: number,
    harness: UnderstandHarness,
    signal: AbortSignal,
  ) => Promise<void>;
}

interface UnderstandStart {
  readonly areas?: readonly string[];
  readonly cloudConsent?: boolean;
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
  /** Stops the running runs, as the Stop button does. */
  stopRunning(): Promise<void>;
  manifestOf(run: Run): Promise<RunManifest>;
  eventsOf(run: Run): Promise<readonly RunEvent[]>;
  /** The absolute folder of a run, and of the project. */
  runFolder(run: Run): string;
  projectFolder(): string;
}

function fixtureFetcher(clock: FixedClock): FakeSourceFetcher {
  return new FakeSourceFetcher(
    [
      {
        owner: 'octo',
        repo: 'demo',
        defaultBranch: 'main',
        refs: { main: commitSha },
        rootDir: fixtureRoot('webforms-csharp'),
        snapshotHash: `sha256:${'cd'.repeat(32)}`,
        fileCount: 13,
        totalBytes: 4096,
      },
    ],
    clock,
  );
}

interface Stores {
  readonly clock: FixedClock;
  readonly masker: SecretMasker;
  readonly logger: MemoryLogger;
  readonly writer: NodeOutputWriter;
  readonly manifests: FileRunManifestStore;
  readonly log: JsonlEventLog;
  readonly runs: MemoryRunIndex;
  readonly projects: MemoryProjectRepository;
  readonly users: MemoryUserRepository;
}

function stores(dataDir: string): Stores {
  const clock = new FixedClock('2026-10-12T10:00:00.000Z');
  const masker = new SecretMasker();
  const logger = new MemoryLogger(clock, masker);
  const writer = new NodeOutputWriter({ dataDir, logger });
  return {
    ...{ clock, masker, logger, writer },
    manifests: new FileRunManifestStore({ writer, masker }),
    log: new JsonlEventLog({ writer, masker }),
    runs: new MemoryRunIndex(),
    projects: new MemoryProjectRepository(),
    users: new MemoryUserRepository(),
  };
}

function understandExecutor(s: Stores, providers: UnderstandProviders): RunUnderstand {
  const { writer, masker, logger, manifests, clock } = s;
  return new RunUnderstand({
    ...{ projects: s.projects, runs: s.runs, users: s.users, manifests, clock, logger },
    scans: new FileScanResults({
      writer,
      manifests,
      snapshotRoot: () => fixtureRoot('webforms-csharp'),
      logger,
    }),
    providers: providers.factory,
    runSinks: providers.runSinks,
    cards: new FileCardOutputs({ writer, masker, logger }),
    answers: new FileAnswersFile({ writer, masker }),
    ledger: providers.ledger,
    costReports: new FileCostReportWriter({ writer, masker }),
    prompts: () => loadReaderPrompts('prompts'),
    textToolProtocol: () => loadTextToolProtocol('prompts'),
    ids: new SequenceIdGenerator(),
  });
}

async function queueOf(s: Stores, providers: UnderstandProviders): Promise<RunQueue> {
  const { runs, manifests, log, clock, logger, projects, writer, masker } = s;
  const pipeline = new SnapshotScanPipeline({
    ...{ writer, masker, logger },
    packs: new LanguagePackRegistry([await CSharpPack.create()]),
  });
  const fetcher = fixtureFetcher(clock);
  const lifecycle = new RunLifecycle({
    ...{ runs, manifests, clock, logger },
    sink: new FanOutSink([log]),
    history: log,
  });
  return new RunQueue({
    ...{ runs, lifecycle, clock, logger },
    executors: {
      scan: new RunScan({ fetcher, projects, pipeline, manifests, clock, logger }),
      understand: understandExecutor(s, providers),
    },
    maxRunning: 2,
  });
}

function waitUntilEnded(s: Stores): (run: Run) => Promise<Run> {
  return async (run) => {
    let latest: Run | undefined;
    await vi.waitFor(
      async () => {
        latest = await s.runs.find(run.userId, run.id);
        if (latest?.queueState !== 'Ended') throw new Error('The run has not ended');
        const events = await s.log.read(scopeOf(latest), 0);
        if (events.at(-1)?.type !== 'run.ended') throw new Error('No run.ended yet');
      },
      { timeout: 20_000, interval: 2 },
    );
    if (latest === undefined) throw new Error('The run vanished');
    return latest;
  };
}

type Starter = (stage: 'scan' | 'understand', extra: UnderstandStart) => Promise<Run>;

/** Starts runs of the project as the API does and waits for their end. */
function starterOf(s: Stores, queue: RunQueue, project: Project): Starter {
  const submit = new SubmitRun({
    ...{ runs: s.runs, manifests: s.manifests, queue, clock: s.clock },
    ids: new SequenceIdGenerator(),
    rosettaVersion: '1.2.3-test',
  });
  const startRun = new StartRun({ projects: s.projects, submit });
  const ended = waitUntilEnded(s);
  return async (stage, extra) => {
    const started = await startRun.execute({
      actor: understandActor,
      projectId: project.id,
      stage,
      ...extra,
    });
    expect(started, `the ${stage} run is accepted`).toMatchObject({ ok: true });
    if (!started.ok) throw new Error(`The ${stage} run was refused: ${started.error}`);
    return ended(started.value.run);
  };
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
  const start = starterOf(s, queue, project);
  return {
    ...{ project, logger: s.logger, providers, runs: s.runs },
    scan: () => start('scan', {}),
    understand: (extra = {}) => start('understand', extra),
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

/** The recording's calls `times` over, so several runs can replay it in turn. */
function repeated(recording: Recording, times: number): Recording {
  return { ...recording, calls: Array.from({ length: times }, () => recording.calls).flat() };
}

// RF-200
export async function createUnderstandHarness(
  options: UnderstandHarnessOptions,
): Promise<UnderstandHarness> {
  const s = stores(options.dataDir);
  await s.users.insert(account);
  const project = sampleProject({
    userId: account.id,
    sourceUrl: 'https://github.com/octo/demo',
    settings: options.settings ?? understandSettings(),
  });
  await s.projects.insertOrFind(project);
  const holder: { harness?: UnderstandHarness } = {};
  const beforeCall: BeforeCall = async (call, signal) => {
    if (holder.harness !== undefined) {
      await options.beforeCall?.(call, holder.harness, signal);
    }
  };
  const providers = understandProviders({
    ...{ dataDir: options.dataDir, writer: s.writer, masker: s.masker, clock: s.clock },
    logger: s.logger,
    recording: repeated(
      await loadRecording(join('tests', 'recordings', 'fake', options.recording)),
      options.replays ?? 1,
    ),
    beforeCall,
  });
  const queue = await queueOf(s, providers);
  const harness = harnessOf({ s, queue, project, providers, dataDir: options.dataDir });
  holder.harness = harness;
  return harness;
}
