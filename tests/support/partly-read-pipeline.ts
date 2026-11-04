import { ReadRunPartlyRead } from '../../src/application/use-cases/read-run-partly-read.js';
import { ReadUnderstanding } from '../../src/application/use-cases/read-understanding.js';
import type { TaskResult } from '../../src/application/ports/task-results.js';
import type { Area } from '../../src/domain/code-map/area.js';
import { MemoryRunIndex } from '../../src/infrastructure/db/memory-run-index.js';
import { cardOf, claimOf, coverageOf, deepenFiles } from './deepen-fixtures.js';
import { FixedScans } from './estimate-harness.js';
import { MapRunTextFiles } from './report-doubles.js';
import { RecordingLogger } from './recording-logger.js';
import { sampleManifest } from './run-fixtures.js';

// RF-230, RF-231 (P8-130): the real reader of what the run lists need, over memory files: the real
// `ReadUnderstanding` measures of one run result, so a test sees a real share and not a double's.

const area: Area = {
  name: 'src',
  files: ['src/a.cs', 'src/b.cs', 'src/c.cs'],
  estimatedTokens: 450,
  mapLevel: 'coarse',
  origin: 'folder',
};

const result: TaskResult = {
  agentTaskId: 'reader-001',
  area: 'src',
  state: 'Done',
  turns: 3,
  withoutCards: false,
  cards: [cardOf('src', [claimOf('BR-001.c1', 'Supported', ['src/a.cs'])])],
  coverage: coverageOf('src', [
    { path: 'src/a.cs', read: 2 },
    { path: 'src/b.cs', read: 0 },
    { path: 'src/c.cs', read: 2 },
  ]),
};

/** The default coverage of the run: the `src` area read at 30% of its first-party tokens. */
const partlyReadCoverage = JSON.stringify({
  schemaVersion: 1,
  areas: [{ area: 'src', files: [], firstPartyShare: 0.3 }],
});

/** The real reader over one coverage file and the results of the run, the scan being `FixedScans`. */
export function realPartlyRead(coverage: string = partlyReadCoverage): ReadRunPartlyRead {
  const manifest = sampleManifest({ codemapHash: 'a'.repeat(64) });
  return new ReadRunPartlyRead({
    files: new MapRunTextFiles({ 'coverage.json': coverage }),
    logger: new RecordingLogger(),
    understanding: new ReadUnderstanding({
      runs: new MemoryRunIndex(),
      scans: new FixedScans([area], deepenFiles),
      taskResults: { read: () => Promise.resolve([result]) },
      manifests: { read: () => Promise.resolve(manifest) },
    }),
  });
}
