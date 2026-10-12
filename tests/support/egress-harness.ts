import type { OutputWriter, WriteRefusal } from '../../src/application/ports/output-writer.js';
import type {
  LlmMessage,
  LlmRequest,
  ProviderKind,
} from '../../src/application/ports/llm-provider.js';
import type { RunScope } from '../../src/application/ports/run-events.js';
import type { RunManifestStore } from '../../src/application/ports/run-manifest-store.js';
import { ManifestSecurityRecorder } from '../../src/application/runs/run-security-record.js';
import { renderDataBlock, type DataBlock } from '../../src/domain/egress/data-block.js';
import type { Result } from '../../src/domain/errors/result.js';
import type { RunManifest } from '../../src/domain/runs/run-manifest.js';
import { MemoryRunManifestStore } from '../../src/infrastructure/files/memory-run-manifest-store.js';
import { runPath } from '../../src/infrastructure/files/workspace-paths.js';
import { EgressGuard } from '../../src/infrastructure/guards/egress-guard.js';
import { JsonlEgressLog } from '../../src/infrastructure/guards/jsonl-egress-log.js';
import { SecretMasker, type TextMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { FakeProvider } from '../../src/infrastructure/providers/fake/fake-provider.js';
import type { Recording } from '../../src/infrastructure/providers/fake/recording.js';
import { contractRequest, contractScenarios } from '../contracts/llm-provider.contract.js';
import { recordingOf } from './fake-recordings.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryLogger } from './memory-logger.js';
import { MemoryOutputWriter } from './memory-output-writer.js';
import { scopeFor } from './run-event-fixtures.js';
import { sampleManifest } from './run-fixtures.js';

// RF-141..RF-143, RF-145: an EgressGuard around a fake provider that keeps every request it
// receives, writing its egress log and manifest counts in memory unless a test hands it others.

export const egressInstant = '2026-10-11T09:05:03.007Z';
/** The run of the contract request's context. */
export const egressScope: RunScope = scopeFor('20261011-090503-understand');
const egressLogPath = `${runPath(egressScope.projectId, egressScope.runKey)}/egress.log.jsonl`;

export interface EgressHarnessOptions {
  readonly kind?: ProviderKind;
  readonly cloudConsent?: boolean;
  /** The masker of the guard; the egress log and the logger always mask with a working one. */
  readonly masker?: TextMasker;
  readonly recording?: Recording;
  readonly writer?: OutputWriter;
  readonly manifests?: RunManifestStore;
}

export interface EgressHarness {
  readonly guard: EgressGuard;
  readonly fake: FakeProvider;
  readonly logger: MemoryLogger;
  readonly manifest: () => Promise<RunManifest | undefined>;
  /** The parsed lines of `egress.log.jsonl`; empty when the file does not exist. */
  readonly egressLines: () => Promise<unknown[]>;
}

/** Answers every call with the contract's text answer, `calls` times. */
function textRecording(calls = 3): Recording {
  return recordingOf(...Array.from({ length: calls }, () => contractScenarios.text));
}

export async function egressHarness(options: EgressHarnessOptions = {}): Promise<EgressHarness> {
  const clock = new FixedClock(egressInstant);
  const logMasker = new SecretMasker();
  const fake = new FakeProvider({
    testMode: true,
    recording: options.recording ?? textRecording(),
  });
  const manifests = options.manifests ?? new MemoryRunManifestStore();
  if ((await manifests.read(egressScope)) === undefined) {
    await manifests.write(egressScope, sampleManifest({ runId: egressScope.runKey }));
  }
  const logger = new MemoryLogger(clock, logMasker);
  const writer = options.writer ?? new MemoryOutputWriter();
  const guard = new EgressGuard({
    inner: fake,
    target: { provider: 'main', kind: options.kind ?? 'ollama', endpointHost: 'ollama.test' },
    cloudConsent: options.cloudConsent ?? false,
    masker: options.masker ?? new SecretMasker(),
    egressLog: new JsonlEgressLog({
      writer,
      masker: logMasker,
      scope: egressScope,
    }),
    security: new ManifestSecurityRecorder({ manifests, scope: egressScope }),
    logger,
    clock,
  });
  return {
    guard,
    fake,
    logger,
    manifest: () => manifests.read(egressScope),
    egressLines: async () =>
      linesOf(await writer.readText({ userId: egressScope.userId, path: egressLogPath })),
  };
}

function linesOf(read: Result<string, WriteRefusal>): unknown[] {
  if (!read.ok) return [];
  return read.value
    .split('\n')
    .filter((line) => line !== '')
    .map((line): unknown => JSON.parse(line));
}

/** The contract request with these messages (and system prompt). */
export function requestWith(messages: readonly LlmMessage[], system?: string): LlmRequest {
  const base = contractRequest();
  return { ...base, messages, system: system ?? base.system };
}

/** A read_file result as the agent loop sends it: one data block. */
export function toolResult(block: Partial<DataBlock> & { readonly text: string }): LlmMessage {
  return {
    role: 'tool',
    toolCallId: 'call-1',
    content: renderDataBlock({
      source: 'read_file',
      excerpts: [{ path: 'src/Web.config', startLine: 1, endLine: block.text.split('\n').length }],
      ...block,
    }),
  };
}

/** A complete conversation: the task, the model's tool call and its result. */
export function readConversation(result: LlmMessage): LlmMessage[] {
  return [
    { role: 'user', content: 'Describe the Catalog area.' },
    {
      role: 'assistant',
      content: '',
      toolCalls: [
        { id: 'call-1', name: 'read_file', arguments: { path: 'src/Web.config', startLine: 1 } },
      ],
    },
    result,
  ];
}
