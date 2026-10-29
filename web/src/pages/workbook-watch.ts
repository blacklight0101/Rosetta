import type { z } from 'zod';
import type { ApiClient, ApiFailure, ApiResult } from '../api/client.js';
import { readStateOf, type BatchStateOf } from '../api/workbook-upload.js';

// RF-159, DEC-183: follows a batch the server reads after the finish. The page asks for its state every
// second (polling, not a stream) until it was stored or refused. A read that fails is tried again a few
// times; a batch the server no longer has (cancelled, expired) ends the wait.

/** How often the state is asked for. */
const WATCH_POLL_MS = 1000;
/** Reads in a row that may fail before the wait gives up. */
const FAILED_READS_ALLOWED = 5;

export interface BatchWatch<T> {
  readonly client: ApiClient;
  readonly projectId: string;
  /** Absent for a page that was reloaded: the batch of the project is read instead. */
  readonly batchId?: string;
  readonly signal: AbortSignal;
  /** What the summary of the batch looks like: the one of workbooks, or (DEC-188) of the zip that holds them. */
  readonly summary: z.ZodType<T>;
  /** Told each state the server answers. */
  readonly onState: (state: BatchStateOf<T>) => void;
  /** What the page shows when the batch is gone without an outcome. */
  readonly stopped?: ApiFailure;
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
export function outcomeOf<T>(
  state: BatchStateOf<T>,
  stopped: ApiFailure = STOPPED,
): ApiResult<T> | undefined {
  if (state.phase === 'stored' && state.summary !== undefined) {
    return { ok: true, value: state.summary };
  }
  return state.phase === 'refused' ? { ok: false, error: refusalOf(state, stopped) } : undefined;
}

/** RF-158: the refusal the server kept, as the failure the page always showed. */
function refusalOf<T>(state: BatchStateOf<T>, stopped: ApiFailure): ApiFailure {
  const { refusal } = state;
  if (refusal === undefined) return stopped;
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
export async function watchBatch<T>(watch: BatchWatch<T>): Promise<ApiResult<T>> {
  const { client, projectId, signal, stopped = STOPPED } = watch;
  const batch = { projectId, batchId: watch.batchId };
  let failedReads = 0;
  while (!signal.aborted) {
    const read = await readStateOf(client, batch, signal, watch.summary);
    if (read.ok) {
      failedReads = 0;
      const state = read.value;
      watch.onState(state);
      const ended = outcomeOf(state, stopped);
      if (ended !== undefined) return ended;
    } else if (read.error.status === 404) {
      return { ok: false, error: stopped };
    } else {
      failedReads += 1;
      if (failedReads >= FAILED_READS_ALLOWED) return read;
    }
    await pause(WATCH_POLL_MS, signal);
  }
  return { ok: false, error: stopped };
}
