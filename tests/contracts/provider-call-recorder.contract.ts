import { describe, expect, it } from 'vitest';
import type {
  ProviderCallRecord,
  ProviderCallRecorder,
  TranscriptEntry,
} from '../../src/application/ports/provider-call-recorder.js';
import { ERROR_CODES } from '../../src/domain/errors/codes.js';
import { SecretMasker, type TextMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { FailingMasker } from '../support/failing-masker.js';
import { secretCases } from '../support/secret-fixture.js';
import { failureOf } from '../support/failure-of.js';

// RF-408, RNF-003: every ProviderCallRecorder (the JSON Lines log and the memory log) passes this
// suite.

interface RecorderHarness {
  readonly recorder: ProviderCallRecorder;
  /** Everything written to `provider-calls.jsonl`. */
  readonly calls: () => Promise<string>;
  /** Everything written to the agent task's transcript. */
  readonly transcript: (agentTaskId: string) => Promise<string>;
}

export type RecorderFactory = (masker: TextMasker) => Promise<RecorderHarness>;

/** A complete record of one successful attempt. */
export const sampleRecord: ProviderCallRecord = {
  traceId: '0123456789abcdef0123456789abcdef',
  spanId: '8000000000000001',
  parentSpanId: '0123456789abcdef',
  callId: '20261011-090503-understand#1',
  attempt: 1,
  runId: '20261011-090503-understand',
  agentTaskId: 'task-1',
  role: 'reader',
  provider: 'local',
  kind: 'ollama',
  model: 'qwen2.5-coder:7b',
  modelVersion: 'sha256-0123',
  endpointHost: 'host.docker.internal',
  requestId: 'req-1',
  startedAt: '2026-10-11T09:05:03.007Z',
  timeToFirstTokenMs: 420,
  latencyMs: 1500,
  inputTokens: 1200,
  outputTokens: 80,
  cachedInputTokens: 0,
  usageSource: 'reported',
  costMicros: 0,
  currency: 'USD',
  finishReason: 'stop',
  status: 'ok',
  ollama: {
    loadDurationMs: 10,
    promptEvalDurationMs: 300,
    evalDurationMs: 900,
    tokensPerSecond: 42,
  },
  transcriptRef: 'transcripts/task-1.jsonl#1',
};

const sampleEntry: TranscriptEntry = {
  at: '2026-10-11T09:05:03.007Z',
  callId: '20261011-090503-understand#1',
  role: 'user',
  content: 'Describe the Catalog area.',
};

function linesOf(text: string): unknown[] {
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line): unknown => JSON.parse(line));
}

type NewHarness = (masker?: TextMasker) => Promise<RecorderHarness>;

function recordTests(newHarness: NewHarness): void {
  it('RF-408 appends one JSON line per attempt with schemaVersion and seq in order', async () => {
    const harness = await newHarness();
    await harness.recorder.record(sampleRecord);
    await harness.recorder.record({ ...sampleRecord, attempt: 2 });

    expect(linesOf(await harness.calls())).toEqual([
      { schemaVersion: 1, seq: 1, ...sampleRecord },
      { schemaVersion: 1, seq: 2, ...sampleRecord, attempt: 2 },
    ]);
  });

  it('RF-408 numbers the transcript lines per agent task and links to the first new one', async () => {
    const harness = await newHarness();
    const first = await harness.recorder.transcript('task-1', [sampleEntry, sampleEntry]);
    const other = await harness.recorder.transcript('task-2', [sampleEntry]);
    const third = await harness.recorder.transcript('task-1', [
      { ...sampleEntry, role: 'assistant', content: '', toolCalls: [] },
    ]);

    expect([first, other, third]).toEqual([
      'transcripts/task-1.jsonl#1',
      'transcripts/task-2.jsonl#1',
      'transcripts/task-1.jsonl#3',
    ]);
    expect(linesOf(await harness.transcript('task-1'))).toEqual([
      { schemaVersion: 1, seq: 1, ...sampleEntry },
      { schemaVersion: 1, seq: 2, ...sampleEntry },
      { schemaVersion: 1, seq: 3, ...sampleEntry, role: 'assistant', content: '', toolCalls: [] },
    ]);
  });

  it('RF-408 refuses an agent task id that would leave the transcripts folder', async () => {
    const harness = await newHarness();

    const error = await failureOf(harness.recorder.transcript('../escape', [sampleEntry]));

    expect(error).toMatchObject({ code: ERROR_CODES.providerCallLogFailed });
  });
}

function maskingTests(newHarness: NewHarness): void {
  it('RNF-003 no record or transcript line holds a fixture secret', async () => {
    const harness = await newHarness();
    for (const { text } of secretCases) {
      await harness.recorder.record({ ...sampleRecord, model: text, requestId: text });
      await harness.recorder.transcript('task-1', [
        {
          ...sampleEntry,
          content: text,
          toolCalls: [{ id: text, name: text, arguments: { [text]: [text] } }],
        },
      ]);
    }

    const written = (await harness.calls()) + (await harness.transcript('task-1'));
    expect(written).toContain('[MASKED:');
    for (const secret of secretCases.flatMap((secretCase) => secretCase.secrets)) {
      expect(written).not.toContain(secret);
    }
  });

  it('RF-141 fails closed with RST-2101 and writes nothing when masking fails', async () => {
    const harness = await newHarness(new FailingMasker());

    const recordError = await failureOf(harness.recorder.record(sampleRecord));
    const transcriptError = await failureOf(harness.recorder.transcript('task-1', [sampleEntry]));

    expect(recordError).toMatchObject({ code: ERROR_CODES.secretMaskingFailed });
    expect(transcriptError).toMatchObject({ code: ERROR_CODES.secretMaskingFailed });
    expect(await harness.calls()).toBe('');
    expect(await harness.transcript('task-1')).toBe('');
  });
}

/** Contract of the ProviderCallRecorder port (RF-408). */
export function providerCallRecorderContract(name: string, create: RecorderFactory): void {
  describe(`ProviderCallRecorder contract: ${name}`, () => {
    const newHarness: NewHarness = (masker = new SecretMasker()) => create(masker);

    recordTests(newHarness);
    maskingTests(newHarness);
  });
}
