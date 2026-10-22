import { NO_LISTED_MODELS } from '../../src/application/models/model-list.js';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type {
  LlmAttemptObserver,
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../src/application/ports/llm-provider.js';
import type { PriceTable } from '../../src/domain/budget/price-table.js';
import type { ProjectSettings } from '../../src/application/projects/project-settings.js';
import { FakeSourceFetcher } from '../../src/infrastructure/github/fake-source-fetcher.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { FakeProvider } from '../../src/infrastructure/providers/fake/fake-provider.js';
import {
  loadRecording,
  type Recording,
} from '../../src/infrastructure/providers/fake/recording.js';
import { estimateInputTokens } from '../../src/infrastructure/providers/usage-estimate.js';
import { GuardedProviderFactory } from '../../src/infrastructure/providers/provider-factory.js';
import { CSharpPack } from '../../src/infrastructure/scan/packs/csharp/csharp-pack.js';
import { LanguagePackRegistry } from '../../src/infrastructure/scan/packs/pack-registry.js';
import type { EvaluationParts } from '../../src/presentation/eval/compose-evaluation.js';
import { budgetTable } from './budget-harness.js';
import { fakeResponse } from './fake-recordings.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryLogger } from './memory-logger.js';
import { fixtureRoot, type FixtureRepository } from './scan-harness.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';
import { understandSettings } from './understand-run-harness.js';

// RNF-006, RNF-015, ADR-008: the evaluation runner over the webforms-csharp fixture with the fake
// provider: the reader replays the full understand recording once per repetition, and the
// verifier replays its judgements, all Supported in the third repetition, so the repetitions
// differ and the spread is not zero. No network, no real model.

export const evalFixtures = fileURLToPath(new URL('../fixtures/eval/', import.meta.url));

const recordings = join('tests', 'recordings', 'fake');

/** The summariser's answer to a group of duplicate candidates (RF-250): no merge. */
const noMerge: Recording['calls'][number] = {
  attempts: [
    {
      response: fakeResponse({
        text: ['```json', '{"merges": []}', '```'].join('\n'),
        toolCalls: [],
        usage: {
          inputTokens: 100,
          outputTokens: 10,
          cachedInputTokens: 0,
          usageSource: 'reported',
        },
        finishReason: 'stop',
      }),
    },
  ],
};

/** The verifier's and the summariser's calls go to fakes of their own, so the reader keeps its order. */
class RoleRecordings implements LlmProvider {
  private readonly reader: FakeProvider;
  private readonly verifier: FakeProvider;
  private readonly summariser: FakeProvider;

  constructor(reader: Recording, verifier: Recording) {
    this.reader = new FakeProvider({ testMode: true, recording: reader });
    this.verifier = new FakeProvider({ testMode: true, recording: verifier });
    const calls = Array.from({ length: 30 }, () => noMerge);
    const merges: Recording = { schemaVersion: 1, description: 'no merge', calls };
    this.summariser = new FakeProvider({ testMode: true, recording: merges });
  }

  complete(request: LlmRequest, observer?: LlmAttemptObserver): Promise<LlmResponse> {
    const { role } = request.context;
    if (role === 'verifier') return this.verifier.complete(request, observer);
    if (role === 'summariser') return this.summariser.complete(request, observer);
    return this.reader.complete(request, observer);
  }
}

/** A provider whose answers use the worst case the budget guard reserves: whole prompt, whole output. */
class WorstCaseUsage implements LlmProvider {
  private readonly inner: LlmProvider;

  constructor(inner: LlmProvider) {
    this.inner = inner;
  }

  async complete(request: LlmRequest, observer?: LlmAttemptObserver): Promise<LlmResponse> {
    const response = await this.inner.complete(request, observer);
    const outputTokens = request.maxOutputTokens ?? response.usage.outputTokens;
    const inputTokens = estimateInputTokens(request);
    const usage = { ...response.usage, inputTokens, outputTokens, cachedInputTokens: 0 };
    return { ...response, usage };
  }
}

function joined(description: string, parts: readonly Recording[]): Recording {
  return { schemaVersion: 1, description, calls: parts.flatMap((part) => part.calls) };
}

async function provider(scenario: EvalScenario): Promise<LlmProvider> {
  const reader = await loadRecording(join(recordings, scenario.reader));
  const judged = await Promise.all(
    scenario.verifier.map((n) => loadRecording(join(recordings, n))),
  );
  return new RoleRecordings(
    joined('three understand runs', [reader, reader, reader]),
    joined('the judgements of the three runs', judged),
  );
}

/** What the evaluation replays: a fixture, the reader's answers per run, the verifier's answers in all. */
export interface EvalScenario {
  readonly fixture: FixtureRepository;
  readonly reader: string;
  readonly verifier: readonly string[];
  readonly fileCount: number;
}

/** The webforms-csharp fixture: two runs judged by the recording, then one all Supported. */
const csharpScenario: EvalScenario = {
  fixture: 'webforms-csharp',
  reader: 'understand-csharp-full.json',
  verifier: [
    'verifier-csharp-full.json',
    'verifier-csharp-full.json',
    'verifier-all-supported.json',
  ],
  fileCount: 13,
};

/** RF-260..RF-262: the webforms-shop fixture, with flows, screens and entities, one recording of judgements. */
export const shopScenario: EvalScenario = {
  fixture: 'webforms-shop',
  reader: 'understand-shop-model.json',
  verifier: ['verifier-shop-model.json'],
  fileCount: 10,
};

export interface EvalHarnessOptions {
  readonly dataDir: string;
  readonly outputDir: string;
  readonly settings?: ProjectSettings;
  readonly totalCapMicros?: number;
  /** The shipped price table; the budget harness table (the fake models free) by default. */
  readonly priceTable?: PriceTable;
  /** The server keys of the environment; none by default (the fake models need no key). */
  readonly serverKeys?: { readonly openai?: string };
  /** Every call uses the worst case its reservation covers, so it costs the most it may. */
  readonly worstCase?: boolean;
  /** The fixture and recordings to replay; the webforms-csharp ones by default. */
  readonly scenario?: EvalScenario;
}

/** The runner's parts with the fake GitHub and the fake provider in front of the fixture. */
export async function evalParts(options: EvalHarnessOptions): Promise<EvaluationParts> {
  const clock = new FixedClock('2026-10-17T09:30:00.000Z');
  const masker = new SecretMasker();
  const scenario = options.scenario ?? csharpScenario;
  const recorded = await provider(scenario);
  const fake = options.worstCase === true ? new WorstCaseUsage(recorded) : recorded;
  const fetcher = new FakeSourceFetcher(
    [
      {
        ...{ owner: 'octo', repo: 'demo', defaultBranch: 'main' },
        refs: { main: 'c'.repeat(40), ['c'.repeat(40)]: 'c'.repeat(40) },
        rootDir: fixtureRoot(scenario.fixture),
        snapshotHash: `sha256:${'cd'.repeat(32)}`,
        fileCount: scenario.fileCount,
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
    snapshotRoot: () => fixtureRoot(scenario.fixture),
    providers: (guards) => new GuardedProviderFactory({ ...guards, adapters: () => fake }),
    serverKeys: options.serverKeys ?? {},
    ollamaUrl: undefined,
    priceTable: options.priceTable ?? budgetTable,
    models: NO_LISTED_MODELS,
    totalCapMicros: options.totalCapMicros ?? 1_000_000,
    rosettaVersion: '1.2.3-test',
    promptsFolder: 'prompts',
    packs: new LanguagePackRegistry([await CSharpPack.create()]),
  };
}
