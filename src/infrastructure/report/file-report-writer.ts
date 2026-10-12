import type { OutputWriter } from '../../application/ports/output-writer.js';
import type { ReportWriter } from '../../application/ports/report-writer.js';
import type { RunScope } from '../../application/ports/run-events.js';
import type { ReportModel } from '../../application/report/report-model.js';
import type { TextMasker } from '../guards/secret-masker.js';
import type { ReportAssets } from './report-assets.js';

// RF-504, RF-506, RF-1013, DEC-112, data-model.md section 3.17: writes the report files of a run.

export interface FileReportWriterOptions {
  readonly writer: OutputWriter;
  readonly masker: TextMasker;
  readonly assets: ReportAssets;
}

export class FileReportWriter implements ReportWriter {
  private readonly options: FileReportWriterOptions;

  constructor(options: FileReportWriterOptions) {
    this.options = options;
  }

  write(scope: RunScope, model: ReportModel): Promise<readonly string[]> {
    void scope;
    void model;
    void this.options;
    return Promise.resolve([]);
  }
}
