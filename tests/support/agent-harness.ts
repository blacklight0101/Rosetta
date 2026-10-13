import { join } from 'node:path';
import { SequenceIdGenerator } from './sequence-id-generator.js';
import { runAgentTask } from '../../src/application/agent/agent-loop.js';
import type { AgentTaskResult } from '../../src/application/agent/agent-task-result.js';
import { ReadOnlyTools } from '../../src/application/agent/read-only-tools.js';
import type { CodeMap } from '../../src/domain/code-map/code-map.js';
import { NodeRepositoryReader } from '../../src/infrastructure/files/node-repository-reader.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { loadReaderPrompts } from '../../src/infrastructure/prompts/prompt-files.js';
import { loadRecording } from '../../src/infrastructure/providers/fake/recording.js';
import { buildCodeMap } from '../../src/infrastructure/scan/codemap/build-code-map.js';
import { LanguagePackRegistry } from '../../src/infrastructure/scan/packs/pack-registry.js';
import { analyseWithPacks } from '../../src/infrastructure/scan/packs/pack-scan.js';
import { scanRepository } from '../../src/infrastructure/scan/universal/universal-scan.js';
import { egressHarness, type EgressHarness } from './egress-harness.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryLogger } from './memory-logger.js';

// RF-201, RF-145, ADR-008: one reader agent task over a fixture repository on disk, with the real
// prompt files, the real read-only tools and a recorded fake provider behind the egress guard.

type AgentFixture = 'webforms-csharp' | 'injection';

const maxFileBytes = 1_000_000;

async function mapFixture(root: string, logger: MemoryLogger) {
  const masker = new SecretMasker();
  const reader = await NodeRepositoryReader.open({
    root,
    ignoreRules: '',
    allowDenied: [],
    logger,
  });
  const scan = await scanRepository(reader, { maxFileBytes, masker });
  const packs = await analyseWithPacks({
    files: scan.files,
    reader,
    registry: new LanguagePackRegistry([]),
    logger,
    maxFileBytes,
  });
  const built = buildCodeMap({
    source: { owner: 'octo', repo: 'demo', commitSha: 'c'.repeat(40), subpath: '' },
    scan,
    packs,
    areaTokenBudget: 60_000,
    configuredAreas: [],
    masker,
  });
  if (!built.ok) throw new Error(`code map failed: ${built.error}`);
  return { reader, codeMap: built.value };
}

export interface AgentRun {
  readonly result: AgentTaskResult;
  readonly codeMap: CodeMap;
  /** The logger of the reader and the tools (security events, tool errors, the task's end). */
  readonly logger: MemoryLogger;
  readonly egress: EgressHarness;
}

export interface AgentRunOptions {
  readonly fixture: AgentFixture;
  /** A file name under tests/recordings/fake/. */
  readonly recording: string;
  /** The area to read; the code map's first area by default. */
  readonly area?: string;
  readonly maxTurns?: number;
}

export async function runRecordedAgent(options: AgentRunOptions): Promise<AgentRun> {
  const logger = new MemoryLogger(new FixedClock('2026-10-12T09:00:00.000Z'), new SecretMasker());
  const root = join(process.cwd(), 'tests', 'fixtures', 'repos', options.fixture);
  const { reader, codeMap } = await mapFixture(root, logger);
  const area = codeMap.areas.find(
    (candidate) => candidate.name === (options.area ?? candidate.name),
  );
  if (area === undefined) throw new Error(`no area ${options.area ?? '(first)'}`);
  const recording = await loadRecording(join('tests', 'recordings', 'fake', options.recording));
  const egress = await egressHarness({ recording });
  let calls = 0;
  const result = await runAgentTask({
    provider: egress.guard,
    tools: new ReadOnlyTools({ reader, codeMap, area, logger, ids: new SequenceIdGenerator() }),
    prompts: await loadReaderPrompts('prompts'),
    logger,
    settings: {
      model: 'fake-model',
      maxTurns: options.maxTurns ?? 8,
      contextTokens: 32_768,
      contextShare: 0.8,
    },
    context: {
      runId: '20261011-090503-understand',
      agentTaskId: `reader-${area.name}`,
      role: 'reader',
      traceId: 'a'.repeat(32),
      parentSpanId: 'b'.repeat(16),
    },
    nextCallId: () => {
      calls += 1;
      return `20261011-090503-understand#${String(calls)}`;
    },
    signal: new AbortController().signal,
  });
  return { result, codeMap, logger, egress };
}
