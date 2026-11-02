import { describe, expect, it } from 'vitest';
import type { ReaderTask } from '../../../../src/application/understand/reader-tasks.js';
import { RunCoverage } from '../../../../src/application/understand/run-coverage.js';
import { recordUnread } from '../../../../src/application/understand/unread-areas.js';
import type { Area } from '../../../../src/domain/code-map/area.js';
import type { CodeMap } from '../../../../src/domain/code-map/code-map.js';
import { entry } from '../../../support/code-map-builders.js';

// P8-14, P7-02, DEC-194: a planned area with no token to read is not unread: a Deepen has nothing to
// plan for it (the same filter as `unreadPlannedAreas`), so the run is not Partly read because of it.

const files = [entry('src/a.cs', 100), entry('docs/empty.cs', 0), entry('lib/b.cs', 50)];
const area = (name: string, paths: string[]): Area => ({
  ...{ name, files: paths, estimatedTokens: 100 },
  ...{ mapLevel: 'coarse', origin: 'folder' },
});
const areas = [
  area('src', ['src/a.cs']),
  area('docs', ['docs/empty.cs']),
  area('lib', ['lib/b.cs']),
];
const codeMap = { areas, files, symbols: [] } as unknown as CodeMap;
const tasks: ReaderTask[] = areas.map((each, index) => ({
  agentTaskId: `reader-00${String(index + 1)}`,
  area: each,
}));

describe('recordUnread', () => {
  it('P8-14 P7-02 counts the areas no reader started that have tokens to read', () => {
    const coverage = new RunCoverage(tasks);

    const unread = recordUnread({ tasks, scanned: { codeMap } }, coverage, new Map());

    expect(unread).toBe(2);
  });

  it('P8-14 P7-02 does not count an area whose files hold no token, but still lists it as not read', () => {
    const coverage = new RunCoverage(tasks);

    const unread = recordUnread(
      { tasks, scanned: { codeMap } },
      coverage,
      new Map([['reader-001', true]]),
    );

    expect(unread).toBe(1);
    expect(coverage.of('reader-002')).toBeDefined();
  });
});
