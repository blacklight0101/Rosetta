import { useEffect, useRef } from 'preact/hooks';
import type { ApiFailure, ApiResult } from '../api/client.js';
import type { Project } from '../api/project-schemas.js';
import { uploadSummarySchema, type UploadState, type UploadSummary } from '../api/source-upload.js';
import { cancelBatch, readStateOf } from '../api/workbook-upload.js';
import { useApp } from '../app/app-context.js';
import { useAbortOnLeave } from './use-abort-on-leave.js';
import { outcomeOf, watchBatch } from './workbook-watch.js';

// RF-159, DEC-188: the page side of a zip that holds workbooks. The server accepts it at once and stores it
// after the request; the form follows the state of its batch like the workbooks form follows its own,
// stops it with Cancel, and, opened on a project whose zip is being stored, picks it up again.

export type UploadPhase = 'idle' | 'sending' | 'processing' | 'done' | 'failed';

/** What the page shows when the zip's batch is gone without an outcome: cancelled, expired or lost. */
const STOPPED: ApiFailure = {
  status: 0,
  code: 'RST-2010',
  message: 'The upload was stopped before it finished.',
  nextStep: 'Nothing was published. Choose the zip and upload it again.',
  problems: [],
};

/** RF-159: a form opened on a project asks for its batch once; one being read is followed from there. */
function useResume(existing: Project | undefined, follow: Follow): void {
  const { client } = useApp();
  useEffect(() => {
    if (existing === undefined) return undefined;
    const reading = new AbortController();
    void readStateOf(client, { projectId: existing.id }, reading.signal, uploadSummarySchema).then(
      (read) => {
        if (!read.ok || reading.signal.aborted) return;
        if (read.value.phase !== 'open') follow(existing, read.value);
      },
    );
    return () => {
      reading.abort();
    };
    // Asked once for the project the form opened on.
  }, [client, existing?.id]);
}

type Follow = (target: Project, first: UploadState, zip?: File) => void;

/** The end of the work on a zip: the summary, or the failure. */
export type Ending = (
  project: Project,
  result: ApiResult<UploadSummary>,
  zip: File | undefined,
) => void;

export interface ZipBatch {
  /** Follows the batch the server answered, until it ends. */
  readonly follow: Follow;
  /** Stops the batch; a Cancel the server answers with 409 leaves the wait going. */
  readonly cancel: (project: Project | undefined, state: UploadState | undefined) => void;
}

/** RF-159, DEC-188: follows the batch of a zip that holds workbooks, and stops it. */
export function useZipBatch(
  existing: Project | undefined,
  ending: Ending,
  set: (phase: UploadPhase, state: UploadState | undefined) => void,
): ZipBatch {
  const { client } = useApp();
  const leave = useAbortOnLeave();
  const stop = useRef(new AbortController());
  const follow = (target: Project, first: UploadState, zip?: File): void => {
    stop.current = new AbortController();
    set('processing', first);
    const ended = outcomeOf(first, STOPPED);
    if (ended !== undefined) {
      ending(target, ended, zip);
      return;
    }
    const signal = AbortSignal.any([leave, stop.current.signal]);
    const watch = {
      ...{ client, projectId: target.id, batchId: first.batchId, signal, stopped: STOPPED },
      summary: uploadSummarySchema,
      onState: (state: UploadState) => {
        set('processing', state);
      },
    };
    void watchBatch(watch).then((result) => {
      ending(target, result, zip);
    });
  };
  const cancel = (project: Project | undefined, state: UploadState | undefined): void => {
    const stopping = stop.current;
    if (project === undefined || state === undefined) {
      stopping.abort();
      return;
    }
    void cancelBatch(client, { projectId: project.id, batchId: state.batchId }).then((answer) => {
      // DEC-188: 409 means the work had already ended; the wait goes on and shows how it ended.
      if (answer.ok || answer.error.status !== 409) stopping.abort();
    });
  };
  useResume(existing, follow);
  return { follow, cancel };
}
