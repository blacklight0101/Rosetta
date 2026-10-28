import { useEffect, useRef, useState } from 'preact/hooks';
import type { ApiFailure, ApiResult } from '../api/client.js';
import type { Project } from '../api/project-schemas.js';
import {
  cancelBatch,
  readBatchState,
  type BatchState,
  type WorkbookSummary,
} from '../api/workbook-upload.js';
import { useApp } from '../app/app-context.js';
import { usePlacement, type Placement, type Where } from './use-file-placement.js';
import { runBatch, type BatchEvents, type OpenBatch } from './workbook-batch.js';
import { outcomeOf, watchBatch } from './workbook-watch.js';
import { useAbortOnLeave } from './use-zip-upload.js';

// RF-150, RF-159, RFC-005 section 4.2: what the Excel workbooks form remembers while it sends: the
// project it made, the batch a failed run left open, where each file is and what the server answered.
// A failure keeps the project (and the batch while it is open), so Upload again does not make a second
// project. After the finish the server reads the workbooks and the form follows its state; a form
// opened on a project whose batch is still being read (a reload, a later visit) follows it too.

export type WorkbookPhase = 'idle' | 'sending' | 'finishing' | 'done' | 'failed';

export interface WorkbookFlowOptions {
  /** The project whose source is uploaded (the start page); absent on the New project form. */
  readonly existing?: Project;
  /** A project this form made; the batch may not be finished yet. */
  readonly onCreated?: (project: Project) => void;
  /** The batch is finished: the list reads again. */
  readonly onStored: (summary: WorkbookSummary) => void;
}

export interface WorkbookFlow {
  readonly project: Project | undefined;
  readonly phase: WorkbookPhase;
  readonly where: Where;
  readonly summary: WorkbookSummary | undefined;
  readonly failure: ApiFailure | undefined;
  /** RF-159: what the server says of the batch it is reading; absent until it answers. */
  readonly processing: BatchState | undefined;
  readonly send: (name: string, files: readonly File[]) => void;
  /** RF-159: stops the batch being read; nothing is published. */
  readonly cancel: () => void;
  /** New files were chosen: forget the last result and place every file at Waiting. */
  readonly reset: (count: number) => void;
}

interface Ending {
  readonly summary: (summary: WorkbookSummary) => void;
  readonly failure: (error: ApiFailure) => void;
}

/** RF-159: a form opened on a project asks for its batch once; one being read is followed from there. */
function useResume(project: Project | undefined, idle: boolean, follow: Follow): void {
  const { client } = useApp();
  const signal = useAbortOnLeave();
  const projectId = project?.id;
  useEffect(() => {
    if (projectId === undefined || !idle) return;
    void readBatchState(client, { projectId }, signal).then((read) => {
      if (!read.ok || signal.aborted) return;
      const { phase } = read.value;
      if (phase === 'processing' || phase === 'stored' || phase === 'refused') {
        follow(projectId, read.value);
      }
    });
    // Asked once for the project the form opened on; `idle` and `follow` are read at that moment.
  }, [client, projectId]);
}

type Follow = (projectId: string, first: BatchState) => void;

interface Outcome {
  readonly phase: WorkbookPhase;
  readonly setPhase: (phase: WorkbookPhase) => void;
  readonly summary: WorkbookSummary | undefined;
  readonly failure: ApiFailure | undefined;
  readonly processing: BatchState | undefined;
  readonly setProcessing: (state: BatchState | undefined) => void;
  readonly ending: Ending;
  readonly clear: () => void;
}

/** Where a run is and how it ended: the summary, or the failure with the files that did not make it. */
function useOutcome(options: WorkbookFlowOptions, placement: Placement): Outcome {
  const [phase, setPhase] = useState<WorkbookPhase>('idle');
  const [summary, setSummary] = useState<WorkbookSummary | undefined>();
  const [failure, setFailure] = useState<ApiFailure | undefined>();
  const [processing, setProcessing] = useState<BatchState | undefined>();
  const ending: Ending = {
    summary: (done) => {
      setSummary(done);
      setPhase('done');
      options.onStored(done);
    },
    failure: (error) => {
      setFailure(error);
      setPhase('failed');
      placement.settle();
    },
  };
  const clear = (): void => {
    setSummary(undefined);
    setFailure(undefined);
    setProcessing(undefined);
    setPhase('idle');
  };
  return { ...{ phase, setPhase, summary, failure, processing, setProcessing }, ending, clear };
}

/** The end of a run: the summary, or the failure. */
function endOf(result: ApiResult<WorkbookSummary>, ending: Ending): void {
  if (result.ok) ending.summary(result.value);
  else ending.failure(result.error);
}

interface RunnerInput {
  readonly options: WorkbookFlowOptions;
  readonly project: Project | undefined;
  readonly setProject: (project: Project) => void;
  readonly placement: Placement;
  readonly out: Outcome;
}

interface Runner {
  readonly send: (name: string, files: readonly File[]) => void;
  readonly follow: Follow;
  readonly cancel: () => void;
}

/** What a run tells the form as it goes. */
function eventsOf(
  input: RunnerInput,
  setBatch: (batch: OpenBatch | undefined) => void,
): BatchEvents {
  const { options, setProject, placement, out } = input;
  return {
    project: (made) => {
      setProject(made);
      options.onCreated?.(made);
    },
    batch: setBatch,
    file: placement.mark,
    progress: placement.percent,
    finishing: () => {
      out.setPhase('finishing');
    },
    processing: out.setProcessing,
  };
}

/** The runs of the form: sending a set of files, following a batch the server reads, and stopping it. */
function useRunner(input: RunnerInput): Runner {
  const { project, out } = input;
  const { setPhase, setProcessing, ending } = out;
  const { client } = useApp();
  const leave = useAbortOnLeave();
  const stop = useRef<AbortController>(new AbortController());
  const [batch, setBatch] = useState<OpenBatch | undefined>();

  const follow: Follow = (projectId, first) => {
    stop.current = new AbortController();
    setPhase('finishing');
    setProcessing(first);
    const ended = outcomeOf(first);
    if (ended !== undefined) {
      endOf(ended, ending);
      return;
    }
    const signal = AbortSignal.any([leave, stop.current.signal]);
    const batchId = first.batchId;
    void watchBatch({ client, projectId, batchId, signal, onState: setProcessing }).then(
      (result) => {
        endOf(result, ending);
      },
    );
  };

  const send = (name: string, files: readonly File[]): void => {
    setPhase('sending');
    stop.current = new AbortController();
    const events = eventsOf(input, setBatch);
    const signal = AbortSignal.any([leave, stop.current.signal]);
    void runBatch({ client, signal, name, files, project, batch, events }).then((result) => {
      endOf(result, ending);
    });
  };

  const cancel = (): void => {
    if (project !== undefined && out.processing !== undefined) {
      void cancelBatch(client, { projectId: project.id, batchId: out.processing.batchId });
    }
    stop.current.abort();
  };
  return { send, follow, cancel };
}

// RF-150, RF-159
export function useWorkbookFlow(options: WorkbookFlowOptions): WorkbookFlow {
  const placement = usePlacement();
  const [project, setProject] = useState(options.existing);
  const out = useOutcome(options, placement);
  const runner = useRunner({ options, project, setProject, placement, out });
  useResume(options.existing, out.phase === 'idle', runner.follow);
  const { phase, summary, failure, processing } = out;
  const reset = (count: number): void => {
    out.clear();
    placement.place(count);
  };
  const send = (name: string, files: readonly File[]): void => {
    if (phase === 'sending' || phase === 'finishing') return;
    reset(files.length);
    runner.send(name, files);
  };
  return {
    ...{ project, phase, where: placement.where, summary, failure, processing },
    ...{ send, cancel: runner.cancel, reset },
  };
}
