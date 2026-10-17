import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { recordManifestPriceTable } from '../../domain/runs/run-manifest.js';
import type { Run } from '../../domain/runs/run.js';
import { buildCostReport } from '../budget/cost-report.js';
import type { CostLedger } from '../ports/cost-ledger.js';
import type { CostReportWriter } from '../ports/cost-report-writer.js';
import type { Logger } from '../ports/logger.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import { ManifestUpdates } from './manifest-updates.js';
import { scopeOf } from './run-scope.js';

// RF-426: `cost.json` and `cost.md` of a run at every end, and the price table in its manifest.

interface CostReportDependencies {
  readonly manifests: RunManifestStore;
  readonly ledger: Pick<CostLedger, 'runEntries'>;
  readonly costReports: CostReportWriter;
  readonly logger: Logger;
}

/** A write that fails is logged, never thrown. */
export async function writeCostReport(deps: CostReportDependencies, run: Run): Promise<void> {
  try {
    const entries = await deps.ledger.runEntries(run.userId, run.id);
    const report = buildCostReport(run.runKey, entries);
    const [first] = entries;
    if (first !== undefined) {
      const priceTable = { version: report.priceTableVersion, currency: first.currency };
      const updates = new ManifestUpdates(deps.manifests, scopeOf(run));
      await updates.update((stored) => recordManifestPriceTable(stored, priceTable));
    }
    await deps.costReports.write(scopeOf(run), report);
  } catch (error) {
    const code = error instanceof RosettaError ? error.code : ERROR_CODES.costRecordFailed;
    await deps.logger.log({
      ...{ level: 'error', logger: 'understand', code, data: {} },
      ...{ message: 'The cost report of the run could not be written.' },
      ...{ runId: run.runKey, userId: run.userId },
    });
  }
}
