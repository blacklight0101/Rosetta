import { fileURLToPath } from 'node:url';
import type { AnswersFile } from '../application/ports/answers-file.js';
import type { Clock } from '../application/ports/clock.js';
import type { Logger } from '../application/ports/logger.js';
import type { RunEventHistory } from '../application/ports/run-events.js';
import type { RunIndex } from '../application/ports/run-index.js';
import type { RunManifestStore } from '../application/ports/run-manifest-store.js';
import type { ScanResults } from '../application/ports/scan-results.js';
import { BuildReport } from '../application/use-cases/build-report.js';
import { FilePriorCards } from '../infrastructure/cards/prior-cards.js';
import { FileReportCards } from '../infrastructure/cards/file-report-cards.js';
import { PgCostTotals } from '../infrastructure/db/pg-cost-totals.js';
import type { DatabasePool } from '../infrastructure/db/pool.js';
import { YazlArchiveWriter } from '../infrastructure/files/yazl-archive-writer.js';
import { FileRunTextFiles } from '../infrastructure/files/file-run-text-files.js';
import { NodeRunFileReader } from '../infrastructure/files/node-run-file-reader.js';
import type { NodeOutputWriter } from '../infrastructure/files/node-output-writer.js';
import type { TextMasker } from '../infrastructure/guards/secret-masker.js';
import { FileReportWriter } from '../infrastructure/report/file-report-writer.js';
import { ReportZipWriter } from '../infrastructure/report/report-zip-writer.js';

// Architecture section 2 (composition root), RF-500, RF-504, RF-1010: the Build report use case over
// the run folder, the answers file and the ledger.

// This file is at the same depth in `src/` and in the built `dist/`, so `../../` is the repository root.
const reportTemplates = fileURLToPath(new URL('../../templates/report/', import.meta.url));

export interface ReportParts {
  /** The data folder; the card files are read from the run folders in it. */
  readonly dataDir: string;
  readonly pool: DatabasePool;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly masker: TextMasker;
  readonly writer: NodeOutputWriter;
  readonly runs: RunIndex;
  readonly manifests: RunManifestStore;
  readonly history: RunEventHistory;
  readonly scans: ScanResults;
  readonly answers: AnswersFile;
}

// RF-500, RF-504, RF-1010
export function composeBuildReport(parts: ReportParts): BuildReport {
  const { pool, logger, clock, masker, writer } = parts;
  return new BuildReport({
    ...{ runs: parts.runs, manifests: parts.manifests, history: parts.history },
    ...{ scans: parts.scans, answers: parts.answers, logger, clock },
    priorCards: new FilePriorCards(writer),
    files: new FileRunTextFiles(writer),
    cards: new FileReportCards(new NodeRunFileReader(parts.dataDir)),
    costs: new PgCostTotals(pool),
    writer: new FileReportWriter({ writer, masker, assetsFolder: reportTemplates }),
    downloads: new ReportZipWriter(parts.dataDir, new YazlArchiveWriter(parts.dataDir)),
  });
}
