import type { ReportWriter } from '../../src/application/ports/report-writer.js';
import type { RunScope } from '../../src/application/ports/run-events.js';
import type { RunTextFiles } from '../../src/application/ports/run-text-files.js';
import type { ReportModel } from '../../src/application/report/report-model.js';

// RF-504, RF-506: stand-ins for the report ports in unit and route tests.

/** Keeps the models it was asked to write and says it wrote the two main files. */
export class RecordingReportWriter implements ReportWriter {
  readonly written: { readonly scope: RunScope; readonly model: ReportModel }[] = [];

  write(scope: RunScope, model: ReportModel): Promise<readonly string[]> {
    this.written.push({ scope, model });
    return Promise.resolve(['report/report.md', 'report/report.html']);
  }
}

/** Text files by path, the same for every run. */
export class MapRunTextFiles implements RunTextFiles {
  private readonly files: Readonly<Record<string, string>>;

  constructor(files: Readonly<Record<string, string>> = {}) {
    this.files = files;
  }

  read(_scope: RunScope, path: string): Promise<string | undefined> {
    return Promise.resolve(this.files[path]);
  }
}
