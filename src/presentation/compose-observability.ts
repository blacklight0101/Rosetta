import type { Clock } from '../application/ports/clock.js';
import type { FileStatReader, OutputWriter } from '../application/ports/output-writer.js';
import type { RunIndex } from '../application/ports/run-index.js';
import type { RunManifestStore } from '../application/ports/run-manifest-store.js';
import { GetCallTranscript } from '../application/use-cases/get-call-transcript.js';
import { ListRunCalls } from '../application/use-cases/list-run-calls.js';
import { ListRunLogs } from '../application/use-cases/list-run-logs.js';
import { MemoizedMasker } from '../infrastructure/guards/memoized-masker.js';
import type { TextMasker } from '../infrastructure/guards/secret-masker.js';
import { FileRunCallReader } from '../infrastructure/providers/file-run-call-reader.js';
import { FileApplicationLogReader } from '../infrastructure/system/file-log-reader.js';
import type { ObservabilityServices } from './web/observability-routes.js';

// Architecture section 2 (composition root), RF-1011: the use cases behind the "API calls" and
// "Logs" panels, over the run folders (through the output writer, so only the owner's workspace is
// reachable) and the daily application log files.

export interface ObservabilityParts {
  readonly runs: RunIndex;
  readonly manifests: RunManifestStore;
  readonly writer: Pick<OutputWriter, 'readText'> & FileStatReader;
  readonly masker: TextMasker;
  readonly clock: Clock;
  /** `ROSETTA_DATA_DIR`. */
  readonly dataDir: string;
}

// RF-1011
export function composeObservability(parts: ObservabilityParts): ObservabilityServices {
  const { runs, manifests, clock } = parts;
  const calls = new FileRunCallReader({
    reader: parts.writer,
    masker: new MemoizedMasker(parts.masker),
  });
  const logs = new FileApplicationLogReader({
    dataDir: parts.dataDir,
    masker: new MemoizedMasker(parts.masker),
  });
  return {
    listRunCalls: new ListRunCalls({ runs, calls, manifests }),
    getCallTranscript: new GetCallTranscript({ runs, calls }),
    listRunLogs: new ListRunLogs({ runs, logs, clock }),
  };
}
