import type { OutputWriter } from '../../application/ports/output-writer.js';
import type { ReportCardFiles } from '../../application/ports/report-card-files.js';
import type { RunScope } from '../../application/ports/run-events.js';
import type { CardFile } from '../../application/report/card-evidence.js';

// RF-502, data-model.md section 3.7: the card files of a run read for the pages of the report.

export class FileReportCards implements ReportCardFiles {
  protected readonly writer: OutputWriter;

  constructor(writer: OutputWriter) {
    this.writer = writer;
  }

  // RF-502
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- stub of the red commit, replaced by the reader
  read(_scope: RunScope, _paths: readonly string[]): Promise<readonly CardFile[]> {
    return Promise.resolve([]);
  }
}
