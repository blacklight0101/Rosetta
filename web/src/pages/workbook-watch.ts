import type { ApiClient, ApiFailure, ApiResult } from '../api/client.js';
import { readBatchState, type BatchState, type WorkbookSummary } from '../api/workbook-upload.js';

// RF-159, DEC-183: follows a batch the server reads after the finish. The page asks for its state every
// second (polling, not a stream) until it was stored or refused. A read that fails is tried again a few
// times; a batch the server no longer has (cancelled, expired) ends the wait.

/** How often the state is asked for. */
const WATCH_POLL_MS = 1000;
/** Reads in a row that may fail before the wait gives up. */
const FAILED_READS_ALLOWED = 5;

export interface BatchWatch {
  readonly client: ApiClient;
  readonly projectId: string;
  /** Absent for a page that was reloaded: the batch of the project is read instead. */
  readonly batchId?: string;
  readonly signal: AbortSignal;
  /** Told each state the server answers. */
  readonly onState: (state: BatchState) => void;
}

/** What the page shows when the batch ended without an outcome: cancelled, expired or gone. */
const STOPPED: ApiFailure = {
  status: 0,
  code: 'RST-2010',
  message: 'The upload was stopped before it finished.',
  nextStep: 'Nothing was published. Choose the workbooks and upload them again.',
  problems: [],
};

/** The end the state tells of, or undefined while the batch is still being read. */
export function outcomeOf(state: BatchState): ApiResult<WorkbookSummary> | undefined {
  if (state.phase === 'stored' && state.summary !== undefined) {
    return { ok: true, value: state.summary };
  }
  return state.phase === 'refused' ? { ok: false, error: refusalOf(state) } : undefined;
}

/** RF-158: the refusal the server kept, as the failure the page always showed. */
function refusalOf(state: BatchState): ApiFailure {
  const { refusal } = state;
  if (refusal === undefined) return STOPPED;
  const { status, code, message, nextStep, problems = [] } = refusal;
  return { status, code, message, nextStep, problems };
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

// RF-159
export async function watchBatch(watch: BatchWatch): Promise<ApiResult<WorkbookSummary>> {
  const { client, projectId, signal } = watch;
  const batch = { projectId, batchId: watch.batchId };
  let failedReads = 0;
  while (!signal.aborted) {
    const read = await readBatchState(client, batch, signal);
    if (read.ok) {
      failedReads = 0;
      const state = read.value;
      watch.onState(state);
      const ended = outcomeOf(state);
      if (ended !== undefined) return ended;
    } else if (read.error.status === 404) {
      return { ok: false, error: STOPPED };
    } else {
      failedReads += 1;
      if (failedReads >= FAILED_READS_ALLOWED) return read;
    }
    await pause(WATCH_POLL_MS, signal);
  }
  return { ok: false, error: STOPPED };
}
