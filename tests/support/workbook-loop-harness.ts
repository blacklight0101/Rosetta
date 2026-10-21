import type { AgentTaskRequest } from '../../src/application/agent/agent-loop.js';
import { ReadOnlyTools } from '../../src/application/agent/read-only-tools.js';
import { createCodeMap, type CodeMap } from '../../src/domain/code-map/code-map.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import type { ScenarioOutcome } from '../contracts/llm-provider.contract.js';
import { testReaderPrompts } from './agent-fixtures.js';
import { loopSetup, type Call, type LoopSetup } from './agent-loop-harness.js';
import { entry } from './code-map-builders.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryLogger } from './memory-logger.js';
import { MemoryRepositoryReader } from './memory-repository-reader.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';

// RF-202 (Q-47): the reader's loop over a rendered workbook held in memory, the way the workbook
// renderer writes it (one `R<n> | ` row prefix per line; a long row continues on the next line).

export const valuesPath = 'Loan.xlsx/Sheet1/values.md';

/** Line 1 is R1, lines 2-3 R2 (a long row), 4 R3, 5 R8, 6 R9. */
const valuesLines: readonly string[] = [
  'R1 | A1 "Rate" | B1 "Amount"',
  'R2 | A2 0.05 | B2 1000',
  'R2 | C2 0.07 | D2 (f)',
  'R3 | A3 "Total"',
  'R8 | A8 "Payment" | B8 55 (f)',
  'R9 | A9 "End"',
];

function workbookMap(paths: readonly string[]): CodeMap {
  const built = createCodeMap({
    source: { owner: 'octo', repo: 'loan', commitSha: 'c'.repeat(40), subpath: '' },
    files: paths.map((path) => entry(path, 20, { language: 'markdown', lines: 6 })),
    areas: [
      {
        name: 'loan',
        files: paths,
        estimatedTokens: paths.length * 20,
        mapLevel: 'coarse',
        origin: 'folder',
      },
    ],
    symbols: [],
    links: [],
    sqlStatements: [],
    entities: [],
    languagePacks: [],
  });
  if (!built.ok) throw new Error(`test code map is invalid: ${built.error}`);
  return built.value;
}

export const readValues: Call = {
  name: 'read_file',
  args: { path: valuesPath, startLine: 1, endLine: 6 },
};

export interface WorkbookLoop {
  readonly loop: LoopSetup;
  readonly request: (signal?: AbortSignal) => AgentTaskRequest;
}

/** A task over the workbook folder whose provider replays `outcomes`. */
export function workbookLoop(
  outcomes: readonly ScenarioOutcome[],
  files: Readonly<Record<string, string>> = { [valuesPath]: valuesLines.join('\n') },
): WorkbookLoop {
  const loop = loopSetup(outcomes);
  const codeMap = workbookMap(Object.keys(files));
  const area = codeMap.areas[0];
  if (area === undefined) throw new Error('no area');
  const logger = new MemoryLogger(new FixedClock('2026-10-12T09:00:00.000Z'), new SecretMasker());
  const tools = new ReadOnlyTools({
    reader: new MemoryRepositoryReader(files),
    codeMap,
    area,
    logger,
    ids: new SequenceIdGenerator(),
  });
  const request = (signal?: AbortSignal): AgentTaskRequest => ({
    ...loop.request(loop.fake, signal),
    tools,
    prompts: testReaderPrompts,
  });
  return { loop, request };
}
