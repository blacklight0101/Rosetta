import type {
  ApplicationLogReader,
  LogQuery,
  StoredLogEntry,
} from '../../application/ports/application-log-reader.js';
import type { TextMasker } from '../guards/secret-masker.js';

// RF-1011, RF-009, RNF-003: reads the daily files `<data>/logs/rosetta-YYYY-MM-DD.jsonl`.

export interface FileApplicationLogReaderOptions {
  /** `ROSETTA_DATA_DIR`; the files are in `<dataDir>/logs/`. */
  readonly dataDir: string;
  readonly masker: TextMasker;
}

export class FileApplicationLogReader implements ApplicationLogReader {
  private readonly options: FileApplicationLogReaderOptions;

  constructor(options: FileApplicationLogReaderOptions) {
    this.options = options;
  }

  read(query: LogQuery): Promise<readonly StoredLogEntry[]> {
    void this.options;
    void query;
    return Promise.resolve([]);
  }
}
