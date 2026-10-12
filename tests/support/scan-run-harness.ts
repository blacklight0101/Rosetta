import { vi } from 'vitest';
import type {
  ScanPipeline,
  ScanReport,
  ScanRequest,
} from '../../src/application/ports/scan-pipeline.js';
import type { SourceFetcher } from '../../src/application/ports/source-fetcher.js';
import type { Project } from '../../src/application/projects/project.js';
import { RunLifecycle } from '../../src/application/runs/run-lifecycle.js';
import { RunQueue } from '../../src/application/runs/run-queue.js';
import { scopeOf } from '../../src/application/runs/run-scope.js';
import { RunScan } from '../../src/application/use-cases/run-scan.js';
import { SubmitRun } from '../../src/application/use-cases/submit-run.js';
import type { Actor } from '../../src/domain/accounts/actor.js';
import type { Run } from '../../src/domain/runs/run.js';
import type { RunEvent } from '../../src/domain/runs/run-event.js';
import type { RunManifest } from '../../src/domain/runs/run-manifest.js';
import { MemoryProjectRepository } from '../../src/infrastructure/db/memory-project-repository.js';
import { MemoryRunIndex } from '../../src/infrastructure/db/memory-run-index.js';
import { FanOutSink } from '../../src/infrastructure/events/fan-out-sink.js';
import { JsonlEventLog } from '../../src/infrastructure/events/jsonl-event-log.js';
import { FileRunManifestStore } from '../../src/infrastructure/files/file-run-manifest-store.js';
import { NodeOutputWriter } from '../../src/infrastructure/files/node-output-writer.js';
import { FakeSourceFetcher } from '../../src/infrastructure/github/fake-source-fetcher.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { CSharpPack } from '../../src/infrastructure/scan/packs/csharp/csharp-pack.js';
import { LanguagePackRegistry } from '../../src/infrastructure/scan/packs/pack-registry.js';
import { SnapshotScanPipeline } from '../../src/infrastructure/scan/scan-pipeline.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryLogger } from './memory-logger.js';
import { sampleProject } from './project-fixtures.js';
import { fixtureRoot } from './scan-harness.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';

// RF-003, RF-126, RF-1006: the scan run end to end over memory indexes and real files in a temporary
// data folder. The source fetcher and the scan pipeline can be replaced by the test.

export const scanActor: Actor = { userId: '00000000-0000-4000-9000-0000000000c3', role: 'user' };
export const FAKE_COMMIT = 'a'.repeat(40);
export const FAKE_SNAPSHOT_HASH = `sha256:${'ab'.repeat(32)}`;

export interface ScanRunHarnessOptions {
  readonly dataDir: string;
  readonly fetcher?: (inner: FakeSourceFetcher) => SourceFetcher;
  readonly pipeline?: ScanPipeline;
  readonly project?: Partial<Project>;
  /** False leaves the project out of the repository, as if it had been deleted. */
  readonly registerProject?: boolean;
}

export interface ScanRunHarness {
  readonly project: Project;
  readonly fetcher: FakeSourceFetcher;
  readonly runs: MemoryRunIndex;
  /** Submits a scan run of the project and waits until it has ended. */
  scan(): Promise<Run>;
  /** Submits a scan run and returns it without waiting. */
  submit(): Promise<Run>;
  /** Stops every run that is running, as the Stop button does. */
  stopRunning(): Promise<void>;
  ended(run: Run): Promise<Run>;
  manifestOf(run: Run): Promise<RunManifest>;
  eventsOf(run: Run): Promise<readonly RunEvent[]>;
}

/** A fetcher that knows `octo/demo` and serves the C# fixture repository as its snapshot. */
export function fixtureFetcher(clock: FixedClock): FakeSourceFetcher {
  return new FakeSourceFetcher(
    [
      {
        owner: 'octo',
        repo: 'demo',
        defaultBranch: 'main',
        refs: { main: FAKE_COMMIT },
        rootDir: fixtureRoot('webforms-csharp'),
        snapshotHash: FAKE_SNAPSHOT_HASH,
        fileCount: 20,
        totalBytes: 4096,
      },
    ],
    clock,
  );
}

/** A pipeline that answers a fixed report and records its requests. */
export class RecordingPipeline implements ScanPipeline {
  readonly requests: ScanRequest[] = [];
  readonly report: ScanReport = {
    codeMapHash: 'f'.repeat(64),
    files: 3,
    areas: 1,
    mapLevels: { coarse: 2, symbols: 1 },
  };

  scan(request: ScanRequest): Promise<ScanReport> {
    this.requests.push(request);
    return Promise.resolve(this.report);
  }
}

interface Parts {
  readonly runs: MemoryRunIndex;
  readonly project: Project;
  readonly submitRun: SubmitRun;
  readonly queue: RunQueue;
}

async function assemble(
  options: ScanRunHarnessOptions,
  fixture: FakeSourceFetcher,
): Promise<Parts & ReadParts> {
  const clock = new FixedClock('2026-10-12T10:00:00.000Z');
  const masker = new SecretMasker();
  const logger = new MemoryLogger(clock, masker);
  const writer = new NodeOutputWriter({ dataDir: options.dataDir, logger });
  const manifests = new FileRunManifestStore({ writer, masker });
  const log = new JsonlEventLog({ writer, masker });
  const runs = new MemoryRunIndex();
  const projects = new MemoryProjectRepository();
  const project = sampleProject({
    userId: scanActor.userId,
    sourceUrl: 'https://github.com/octo/demo',
    ...options.project,
  });
  if (options.registerProject !== false) await projects.insertOrFind(project);
  const pipeline =
    options.pipeline ??
    new SnapshotScanPipeline({
      writer,
      masker,
      logger,
      packs: new LanguagePackRegistry([await CSharpPack.create()]),
    });
  const fetcher = options.fetcher?.(fixture) ?? fixture;
  const lifecycle = new RunLifecycle({
    runs,
    manifests,
    sink: new FanOutSink([log]),
    history: log,
    clock,
    logger,
  });
  const executor = new RunScan({ fetcher, projects, pipeline, manifests, clock });
  const queue = new RunQueue({
    runs,
    lifecycle,
    executors: { scan: executor },
    clock,
    logger,
    maxRunning: 2,
  });
  const submitRun = new SubmitRun({
    runs,
    manifests,
    queue,
    ids: new SequenceIdGenerator(),
    clock,
    rosettaVersion: '1.2.3-test',
  });
  return { runs, project, submitRun, queue, manifests, log };
}

interface ReadParts {
  readonly manifests: FileRunManifestStore;
  readonly log: JsonlEventLog;
}

// RF-003
export async function createScanRunHarness(
  options: ScanRunHarnessOptions,
): Promise<ScanRunHarness> {
  const fixture = fixtureFetcher(new FixedClock('2026-10-12T10:00:00.000Z'));
  const { runs, project, submitRun, queue, manifests, log } = await assemble(options, fixture);
  const ended = async (run: Run): Promise<Run> => {
    let latest: Run | undefined;
    await vi.waitFor(async () => {
      latest = await runs.find(run.userId, run.id);
      if (latest?.queueState !== 'Ended') throw new Error('The run has not ended');
      // The index records the end first; the manifest and `run.ended` follow.
      const events = await log.read(scopeOf(latest), 0);
      if (events.at(-1)?.type !== 'run.ended') throw new Error('The run has not published its end');
    });
    if (latest === undefined) throw new Error('The run vanished');
    return latest;
  };
  const submit = async (): Promise<Run> => {
    const submitted = await submitRun.execute({
      actor: scanActor,
      project,
      stage: 'scan',
      options: {},
    });
    if (!submitted.ok) throw new Error('The scan run was not accepted');
    return submitted.value.run;
  };
  return {
    project,
    fetcher: fixture,
    runs,
    submit,
    ended,
    scan: async () => ended(await submit()),
    async stopRunning() {
      for (const run of await runs.listRunning()) await queue.stop(run.userId, run.id);
    },
    async manifestOf(run) {
      const manifest = await manifests.read(scopeOf(run));
      if (manifest === undefined) throw new Error('The run has no manifest');
      return manifest;
    },
    eventsOf: (run) => log.read(scopeOf(run), 0),
  };
}
