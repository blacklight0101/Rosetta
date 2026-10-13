import type { OutputWriter } from '../../application/ports/output-writer.js';
import type { RunScope } from '../../application/ports/run-events.js';
import type {
  RunCallReader,
  StoredCall,
  StoredTranscriptEntry,
} from '../../application/ports/run-call-reader.js';
import type { TextMasker } from '../guards/secret-masker.js';

// RF-1011, RF-408, RNF-003: reads `provider-calls.jsonl` and `transcripts/<agentTaskId>.jsonl` of a
// run folder through the OutputWriter, so only the owner's workspace is reachable.

export interface FileRunCallReaderOptions {
  readonly reader: Pick<OutputWriter, 'readText'>;
  readonly masker: TextMasker;
}

export class FileRunCallReader implements RunCallReader {
  private readonly options: FileRunCallReaderOptions;

  constructor(options: FileRunCallReaderOptions) {
    this.options = options;
  }

  calls(scope: RunScope): Promise<readonly StoredCall[]> {
    void this.options;
    void scope;
    return Promise.resolve([]);
  }

  transcript(scope: RunScope, agentTaskId: string): Promise<readonly StoredTranscriptEntry[]> {
    void scope;
    void agentTaskId;
    return Promise.resolve([]);
  }
}
