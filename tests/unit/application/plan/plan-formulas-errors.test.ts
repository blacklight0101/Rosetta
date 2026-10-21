import { expect, it } from 'vitest';
import { planWorkbookFormulas } from '../../../../src/application/plan/plan-formulas.js';
import type { ScanResults } from '../../../../src/application/ports/scan-results.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { sampleRun } from '../../../support/run-fixtures.js';

// RF-155, P3-94: a scan that fails for a reason that has no code of its own is logged with the
// code of a code map that cannot be read, and the package is written without workbook formulas.

it('RF-155 logs a scan that fails with a plain error and gives nothing', async () => {
  const snapshotKey = 'upload__p@0123456789abcdef';
  const failing: ScanResults = { open: () => Promise.reject(new Error('disk gone')) };
  const logger = new MemoryLogger(new FixedClock('2026-10-21T09:00:00.000Z'), new SecretMasker());
  const scanRun = sampleRun({ stage: 'scan', endState: 'Completed', snapshotKey });
  const deps = { runs: { list: () => Promise.resolve([scanRun]) }, scans: failing, logger };
  const inputs = {
    project: sampleProject({ sourceKind: 'upload' }),
    sourceRun: sampleRun({ stage: 'understand', snapshotKey }),
  };

  expect(await planWorkbookFormulas(deps, inputs)).toBeUndefined();
  expect(logger.entries).toMatchObject([
    { level: 'warn', code: ERROR_CODES.codeMapMissing, logger: 'plan' },
  ]);
});
