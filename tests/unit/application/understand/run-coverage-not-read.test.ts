import { describe, expect, it } from 'vitest';
import { RunCoverage } from '../../../../src/application/understand/run-coverage.js';
import type { ReaderTask } from '../../../../src/application/understand/reader-tasks.js';
import { entry } from '../../../support/code-map-builders.js';

// P7-02, RF-230, RF-206: an area no reader started is listed in the coverage as not read, so its
// tokens are in the denominator (EV-62: the run page said 100% of 25 areas while 12 were unread).

const files = [entry('src/a.cs', 100), entry('src/b.cs', 300)];
const task = (id: string, area: string, paths: string[]): ReaderTask => ({
  agentTaskId: id,
  area: { name: area, files: paths, estimatedTokens: 400, mapLevel: 'coarse', origin: 'folder' },
});

describe('RunCoverage.recordNotRead', () => {
  it('P7-02 lists a skipped area with every file and no line read, noted not read', () => {
    const skipped = task('reader-002', 'src', ['src/a.cs', 'src/b.cs']);
    const coverage = new RunCoverage([skipped]);

    coverage.recordNotRead(skipped, { files, symbols: [] });

    expect(coverage.areas()).toMatchObject([
      {
        area: 'src',
        note: 'not read',
        tokens: 400,
        readTokens: 0,
        readTokenShare: 0,
        files: [
          { path: 'src/a.cs', read: [] },
          { path: 'src/b.cs', read: [] },
        ],
      },
    ]);
  });
});
