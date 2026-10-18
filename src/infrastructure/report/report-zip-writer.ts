import type { ArchiveWriter } from '../../application/ports/archive-writer.js';
import type { ReportDownloads } from '../../application/ports/report-downloads.js';

// RF-505: stub, replaced by the implementation in the next commit.

export class ReportZipWriter implements ReportDownloads {
  readonly dataDir: string;
  readonly archives: ArchiveWriter;

  constructor(dataDir: string, archives: ArchiveWriter) {
    this.dataDir = dataDir;
    this.archives = archives;
  }

  write(): Promise<void> {
    return Promise.resolve();
  }
}
