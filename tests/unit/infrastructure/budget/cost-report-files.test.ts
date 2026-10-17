import { describe, expect, it } from 'vitest';
import { buildCostReport } from '../../../../src/application/budget/cost-report.js';
import { FileCostReportWriter } from '../../../../src/infrastructure/budget/cost-report-files.js';
import { runPath } from '../../../../src/infrastructure/files/workspace-paths.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { entryOf, reservationOf } from '../../../support/ledger-fixtures.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';
import { scopeFor } from '../../../support/run-event-fixtures.js';

// RF-426, data-model.md section 3.12: `cost.json` and `cost.md` are written into the run folder
// when the run ends; the Markdown file is the readable table.

const scope = scopeFor('20261012-100000-understand');
const folder = runPath(scope.projectId, scope.runKey);

async function written(path: string, writer: MemoryOutputWriter): Promise<string> {
  const read = await writer.readText({ userId: scope.userId, path: `${folder}/${path}` });
  return read.ok ? read.value : '';
}

describe('FileCostReportWriter', () => {
  const report = buildCostReport(scope.runKey, [
    entryOf(reservationOf({ userId: scope.userId, runId: scope.id }), { costMicros: 1_234_567n }),
  ]);

  it('RF-426 writes cost.json with the report and schema version', async () => {
    const writer = new MemoryOutputWriter();

    await new FileCostReportWriter({ writer, masker: new SecretMasker() }).write(scope, report);

    expect(JSON.parse(await written('cost.json', writer))).toEqual(report);
  });

  it('RF-426 writes cost.md with the totals, the price table version and one table per breakdown', async () => {
    const writer = new MemoryOutputWriter();

    await new FileCostReportWriter({ writer, masker: new SecretMasker() }).write(scope, report);

    const text = await written('cost.md', writer);
    expect(text).toContain('# Cost of run 20261012-100000-understand');
    expect(text).toContain('Price table: 2026-10-11 (USD)');
    expect(text).toContain(
      '| Role | Calls | Input tokens | Output tokens | Cached input tokens | Cache-write tokens | Cache-write cost | Cost |',
    );
    expect(text).toContain('| reader | 1 | 1,200 | 80 | 1,024 | 0 | $0.0000 | $1.23 |');
    for (const heading of ['## By role', '## By agent task', '## By provider', '## By model']) {
      expect(text).toContain(heading);
    }
  });
});
