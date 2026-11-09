import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LlmProvider, LlmRequest } from '../../src/application/ports/llm-provider.js';
import type { SkipLookup } from '../../src/application/verifier/cited-lines.js';
import type { ClaimJudgementParts } from '../../src/application/understand/claim-judgement.js';
import { defaultEvidenceLimits } from '../../src/application/verifier/cited-lines.js';
import type { ClaimJudgeParts } from '../../src/application/verifier/judge-claim.js';
import type { VerifierPrompts } from '../../src/application/verifier/verifier-prompts.js';
import type { RunEvent } from '../../src/domain/runs/run-event.js';
import { FakeProvider } from '../../src/infrastructure/providers/fake/fake-provider.js';
import {
  loadRecording,
  type Recording,
} from '../../src/infrastructure/providers/fake/recording.js';
import { loadVerifierPrompts } from '../../src/infrastructure/prompts/verifier-prompt-files.js';
import { eventFor, scopeFor } from './run-event-fixtures.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryRepositoryReader } from './memory-repository-reader.js';
import { fixtureRoot } from './scan-harness.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';

// RF-301, ADR-008: the judgement step outside a run: the real prompts, the files of the
// webforms-csharp fixture in memory and the fake provider replaying a verifier recording.

const runId = '20260101-000002-understand';
const traceId = '0123456789abcdef0123456789abcdef';

/** The fixture files the verifier recordings judge. */
const fixtureFiles = [
  'Default.aspx.cs',
  'Catalog/Details.aspx',
  'Catalog/Details.aspx.cs',
  'Database/schema.sql',
  'Services/CatalogService.cs',
];

async function fixtureReader(): Promise<MemoryRepositoryReader> {
  const root = fixtureRoot('webforms-csharp');
  const entries = await Promise.all(
    fixtureFiles.map(async (path) => [path, await readFile(join(root, path), 'utf8')] as const),
  );
  return new MemoryRepositoryReader(Object.fromEntries(entries));
}

/** P8-58: the verdict events of a step; the call events (start and end) come with the calls. */
export function verdictEvents(events: readonly RunEvent[]): RunEvent[] {
  return events.filter((event) => event.type === 'verify.claim.judged');
}

const CALL_WORDS: Readonly<Record<string, string>> = {
  'verify.claim.started': 'start',
  'verify.claim.callEnded': 'end',
};

/** P8-58: the call events of a step in log order, for example `start BR-001.c1`, `end BR-001.c1`. */
export function callEvents(events: readonly RunEvent[]): string[] {
  return events.flatMap((event) => {
    const word = CALL_WORDS[event.type];
    return word === undefined ? [] : [`${word} ${String(event.data['claimId'])}`];
  });
}

/**
 * P8-58: what a consumer of the log counts: starts minus ends after each event, never negative.
 * This is not the rule of RF-1002 (`docs/data-model.md` 3.9: a set of claim ids, an unknown end changes
 * nothing, emptied at the judgement and run events); the two agree only on a well-formed log, which
 * is what these tests feed. The page's reducer tests (P8-60) prove the set rule; this helper does not.
 */
export function callsInFlight(events: readonly RunEvent[]): {
  readonly peak: number;
  readonly min: number;
  readonly final: number;
} {
  let now = 0;
  let [peak, min] = [0, 0];
  for (const { type } of events) {
    if (type !== 'verify.claim.started' && type !== 'verify.claim.callEnded') continue;
    now += type === 'verify.claim.started' ? 1 : -1;
    peak = Math.max(peak, now);
    min = Math.min(min, now);
  }
  return { peak, min, final: now };
}

export function verifierRecording(name: string): Promise<Recording> {
  return loadRecording(join('tests', 'recordings', 'fake', name));
}

export interface VerifierHarness {
  readonly parts: ClaimJudgeParts;
  readonly prompts: VerifierPrompts;
  readonly reader: MemoryRepositoryReader;
  /** The requests the provider received, in order. */
  readonly requests: () => readonly LlmRequest[];
  /** The events the step published, in order. */
  readonly events: RunEvent[];
  readonly step: (parallelism?: number) => ClaimJudgementParts;
  /** Stops the run: with no reason as the Stop button does, or with the refusal of a cap. */
  readonly abort: (reason?: unknown) => void;
}

interface HarnessOptions {
  readonly recording: Recording;
  /** Wraps the fake, for a test that fails or watches calls; the fake by default. */
  readonly provider?: (fake: FakeProvider) => LlmProvider;
  /** The files the scan skipped (RF-100); none by default. */
  readonly skipReason?: SkipLookup;
}

export async function verifierHarness(options: HarnessOptions): Promise<VerifierHarness> {
  const fake = new FakeProvider({ testMode: true, recording: options.recording });
  const prompts = await loadVerifierPrompts('prompts');
  const reader = await fixtureReader();
  const controller = new AbortController();
  let calls = 0;
  const parts: ClaimJudgeParts = {
    role: {
      provider: options.provider?.(fake) ?? fake,
      model: 'judge-model',
      maxOutputTokens: 512,
    },
    ...{ prompts, reader, ids: new SequenceIdGenerator(), limits: defaultEvidenceLimits },
    skipReason: options.skipReason ?? (() => undefined),
    call: {
      ...{ runId, traceId, signal: controller.signal },
      nextCallId: () => {
        calls += 1;
        return `${runId}#${String(calls)}`;
      },
    },
  };
  const events: RunEvent[] = [];
  const emit = (type: string, data: Readonly<Record<string, unknown>>, agentTaskId?: string) => {
    const base = eventFor(scopeFor(runId), events.length + 1, type, data);
    const event = agentTaskId === undefined ? base : { ...base, agentTaskId };
    events.push(event);
    return Promise.resolve(event);
  };
  const step = (parallelism = 1): ClaimJudgementParts => ({
    ...{ judge: parts, parallelism, events: { emit }, model: 'judge-model' },
    clock: new FixedClock('2026-10-12T10:00:00.000Z'),
  });
  const abort = (reason?: unknown) => {
    controller.abort(reason);
  };
  return { parts, prompts, reader, requests: () => fake.requests, events, step, abort };
}
