import { NO_LISTED_MODELS } from '../../src/application/models/model-list.js';
import { fileURLToPath } from 'node:url';
import type {
  LlmAttemptObserver,
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../src/application/ports/llm-provider.js';
import type { CalibrationSet } from '../../src/application/eval/calibration-set-schema.js';
import { ERROR_CODES } from '../../src/domain/errors/codes.js';
import { RosettaError } from '../../src/domain/errors/rosetta-error.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { FakeProvider } from '../../src/infrastructure/providers/fake/fake-provider.js';
import type { Recording } from '../../src/infrastructure/providers/fake/recording.js';
import { GuardedProviderFactory } from '../../src/infrastructure/providers/provider-factory.js';
import type { CalibrationParts } from '../../src/presentation/eval/compose-calibration.js';
import { budgetTable } from './budget-harness.js';
import { fakeResponse } from './fake-recordings.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryLogger } from './memory-logger.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';
import { understandSettings } from './understand-run-harness.js';

// RF-305, ADR-008: `npm run eval -- --calibration` with the fake provider. Each model replays a
// recording of its own answers, in the order the claims are judged, behind the real guarded
// provider factory; no network and no real model.

export const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
export const evalFolder = fileURLToPath(new URL('../../eval/', import.meta.url));

const usage = { inputTokens: 400, outputTokens: 30, cachedInputTokens: 0 } as const;

function answerOf(text: string): LlmResponse {
  return fakeResponse({
    text,
    toolCalls: [],
    usage: { ...usage, usageSource: 'reported' },
    finishReason: 'stop',
  });
}

/** `Reason: ...` then the verdict, the form the verifier prompt asks for. */
function verdictText(index: number, verdict: 'Supported' | 'Rejected'): string {
  return `Reason: Judgement ${String(index + 1)} says so.\nVerdict: ${verdict}`;
}

export interface ModelScript {
  /** Claim positions (0-based) answered against the hand label. */
  readonly wrong?: readonly number[];
  /** Claim positions answered with text that is no verdict, twice (the retry fails too). */
  readonly unreadable?: readonly number[];
}

/** The answers of a model that follows the labels of the set except where the script says. */
export function answersFor(set: CalibrationSet, script: ModelScript = {}): string[] {
  return set.claims.flatMap((claim, index) => {
    if (script.unreadable?.includes(index) === true) return ['Maybe.', 'Perhaps.'];
    const agrees = script.wrong?.includes(index) !== true;
    const verdict = claim.supported === agrees ? 'Supported' : 'Rejected';
    return [verdictText(index, verdict)];
  });
}

function recordingOf(answers: readonly string[]): Recording {
  return {
    schemaVersion: 1,
    description: 'calibration answers built in memory by a test',
    calls: answers.map((text) => ({ attempts: [{ response: answerOf(text) }] })),
  };
}

/** Routes each call to the recording of the model it names; can refuse from a given call on. */
export class ModelRouter implements LlmProvider {
  /** Every request received, in order. */
  readonly requests: LlmRequest[] = [];
  private readonly fakes = new Map<string, FakeProvider>();
  private readonly refusals: ReadonlyMap<string, number>;
  private readonly counts = new Map<string, number>();

  constructor(
    answers: Readonly<Record<string, readonly string[]>>,
    refuseFrom: Readonly<Record<string, number>> = {},
  ) {
    for (const [model, texts] of Object.entries(answers)) {
      this.fakes.set(model, new FakeProvider({ testMode: true, recording: recordingOf(texts) }));
    }
    this.refusals = new Map(Object.entries(refuseFrom));
  }

  complete(request: LlmRequest, observer?: LlmAttemptObserver): Promise<LlmResponse> {
    this.requests.push(request);
    const model = request.model;
    const count = (this.counts.get(model) ?? 0) + 1;
    this.counts.set(model, count);
    const limit = this.refusals.get(model);
    if (limit !== undefined && count >= limit) {
      return Promise.reject(new RosettaError(ERROR_CODES.budgetCapReached));
    }
    const fake = this.fakes.get(model);
    if (fake === undefined) return Promise.reject(new RosettaError(ERROR_CODES.recordingExhausted));
    return fake.complete(request, observer);
  }
}

export interface CalibrationHarnessOptions {
  readonly outputDir: string;
  readonly router: ModelRouter;
  readonly capMicros?: number;
  /** The folder the set's source folder is relative to; this repository by default. */
  readonly repositoryRoot?: string;
  /** The server keys of the environment; none by default (the fake models need no key). */
  readonly serverKeys?: { readonly openai?: string };
}

/** The calibration's parts with the fake router behind the guarded provider factory. */
export function calibrationParts(options: CalibrationHarnessOptions): CalibrationParts {
  const clock = new FixedClock('2026-10-17T09:30:00.000Z');
  const masker = new SecretMasker();
  return {
    ...{ outputDir: options.outputDir, promptsFolder: 'prompts' },
    repositoryRoot: options.repositoryRoot ?? repositoryRoot,
    providers: (guards) =>
      new GuardedProviderFactory({ ...guards, adapters: () => options.router }),
    serverKeys: options.serverKeys ?? {},
    ollamaUrl: undefined,
    priceTable: budgetTable,
    models: NO_LISTED_MODELS,
    settings: understandSettings(),
    capMicros: options.capMicros ?? 1_000_000,
    rosettaVersion: '1.2.3-test',
    ...{ clock, ids: new SequenceIdGenerator(), logger: new MemoryLogger(clock, masker), masker },
  };
}
