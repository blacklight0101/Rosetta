import { describe, expect, it } from 'vitest';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';
import { ReadOnlyTools } from '../../../../src/application/agent/read-only-tools.js';
import { createCodeMap, type CodeMap } from '../../../../src/domain/code-map/code-map.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { blockOf } from '../../../support/agent-tools-harness.js';
import { entry } from '../../../support/code-map-builders.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { MemoryRepositoryReader } from '../../../support/memory-repository-reader.js';

// RF-201, P1-90: list_area_files on a large area names up to the listing limit (200 entries by
// default) and says how many more there are.

function pathsOf(count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `src/Big/F${String(index + 1).padStart(3, '0')}.cs`,
  );
}

function bigMap(paths: readonly string[]): CodeMap {
  const built = createCodeMap({
    source: { owner: 'octo', repo: 'shop', commitSha: 'c'.repeat(40), subpath: '' },
    files: paths.map((path) => entry(path, 10)),
    areas: [
      {
        name: 'big',
        files: [...paths],
        estimatedTokens: paths.length * 10,
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

function listing(count: number): Promise<string> {
  const paths = pathsOf(count);
  const codeMap = bigMap(paths);
  const [area] = codeMap.areas;
  if (area === undefined) throw new Error('no area');
  const tools = new ReadOnlyTools({
    reader: new MemoryRepositoryReader({}),
    codeMap,
    area,
    logger: new MemoryLogger(new FixedClock('2026-10-12T09:00:00.000Z'), new SecretMasker()),
    ids: new SequenceIdGenerator(),
  });
  const ids = { runId: 'run-1', agentTaskId: 'task-big', callId: 'run-1#1' };
  return tools
    .run({ id: 'call-1', name: 'list_area_files', arguments: {} }, ids)
    .then((outcome) => blockOf(outcome.content).text);
}

describe('list_area_files on a large area', () => {
  it('RF-201 a 200-entry listing names every file and nothing is left out', async () => {
    const text = await listing(200);

    expect(text).toContain('src/Big/F001.cs (x, 10 lines)');
    expect(text).toContain('src/Big/F200.cs (x, 10 lines)');
    expect(text.match(/^src\/Big\//gm)).toHaveLength(200);
    expect(text).not.toContain('not shown');
  });

  it('RF-201 a 201-entry listing names the first 200 and says one more is not shown', async () => {
    const text = await listing(201);

    expect(text.match(/^src\/Big\//gm)).toHaveLength(200);
    expect(text).not.toContain('src/Big/F201.cs');
    expect(text).toContain('(1 more files not shown)');
  });
});
