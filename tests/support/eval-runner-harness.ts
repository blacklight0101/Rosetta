import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type {
  LlmAttemptObserver,
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../src/application/ports/llm-provider.js';
import type { ProjectSettings } from '../../src/application/projects/project-settings.js';
import { FakeSourceFetcher } from '../../src/infrastructure/github/fake-source-fetcher.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { FakeProvider } from '../../src/infrastructure/providers/fake/fake-provider.js';
import {
  loadRecording,
  type Recording,
} from '../../src/infrastructure/providers/fake/recording.js';
import { CSharpPack } from '../../src/infrastructure/scan/packs/csharp/csharp-pack.js';
import { LanguagePackRegistry } from '../../src/infrastructure/scan/packs/pack-registry.js';
import type { EvaluationParts } from '../../src/presentation/eval/compose-evaluation.js';
import { budgetTable } from './budget-harness.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryLogger } from './memory-logger.js';
import { fixtureRoot } from './scan-harness.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';
import { understandSettings } from './understand-run-harness.js';

// RNF-006, RNF-015, ADR-008: the evaluation runner over the webforms-csharp fixture with the fake
// provider: the reader replays the full understand recording once per repetition, and the
// verifier replays its judgements, all Supported in the third repetition, so the repetitions
// differ and the spread is not zero. No network, no real model.

export const evalFixtures = fileURLToPath(new URL('../fixtures/eval/', import.meta.url));

const recordings = join('tests', 'recordings', 'fake');

/** The verifier's calls go to their own fake; every other role to the reader's. */
class RoleRecordings implements LlmProvider {
  private readonly reader: FakeProvider;
  private readonly verifier: FakeProvider;

  constructor(reader: Recording, verifier: Recording) {
    this.reader = new FakeProvider({ testMode: true, recording: reader });
    this.verifier = new FakeProvider({ testMode: true, recording: verifier });
  }

  complete(request: LlmRequest, observer?: LlmAttemptObserver): Promise<LlmResponse> {
    const fake = request.context.role === 'verifier' ? this.verifier : this.reader;
    return fake.complete(request, observer);
  }
}

function joined(description: string, parts: readonly Recording[]): Recording {
  return { schemaVersion: 1, description, calls: parts.flatMap((part) => part.calls) };
}

async function provider(): Promise<LlmProvider> {
  const reader = await loadRecording(join(recordings, 'understand-csharp-full.json'));
  const judged = await loadRecording(join(recordings, 'verifier-csharp-full.json'));
  const allSupported = await loadRecording(join(recordings, 'verifier-all-supported.json'));
  return new RoleRecordings(
    joined('three understand runs', [reader, reader, reader]),
    joined('two runs judged, then one all Supported', [judged, judged, allSupported]),
  );
}

export interface EvalHarnessOptions {
  readonly dataDir: string;
  readonly outputDir: string;
  readonly settings?: ProjectSettings;
  readonly totalCapMicros?: number;
}

/** The runner's parts with the fake GitHub and the fake provider in front of the fixture. */
export async function evalParts(options: EvalHarnessOptions): Promise<EvaluationParts> {
  const clock = new FixedClock('2026-10-17T09:30:00.000Z');
  const masker = new SecretMasker();
  const fake = await provider();
  const fetcher = new FakeSourceFetcher(
    [
      {
        ...{ owner: 'octo', repo: 'demo', defaultBranch: 'main' },
        refs: { main: 'c'.repeat(40), ['c'.repeat(40)]: 'c'.repeat(40) },
        rootDir: fixtureRoot('webforms-csharp'),
        snapshotHash: `sha256:${'cd'.repeat(32)}`,
        fileCount: 13,
        totalBytes: 4096,
      },
    ],
    clock,
  );
  return {
    ...{ dataDir: options.dataDir, outputDir: options.outputDir, clock, masker },
    ids: new SequenceIdGenerator(),
    logger: new MemoryLogger(clock, masker),
    settings: options.settings ?? understandSettings(),
    fetcher,
    snapshotRoot: () => fixtureRoot('webforms-csharp'),
    adapters: () => fake,
    serverKeys: {},
    ollamaUrl: undefined,
    priceTable: budgetTable,
    totalCapMicros: options.totalCapMicros ?? 1_000_000,
    rosettaVersion: '1.2.3-test',
    promptsFolder: 'prompts',
    packs: new LanguagePackRegistry([await CSharpPack.create()]),
  };
}
