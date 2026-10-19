import { useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import type { Project } from '../api/project-schemas.js';
import type { WorkbookSummary } from '../api/workbook-upload.js';
import { useApp } from '../app/app-context.js';
import { runBatch, type BatchEvents, type FileState, type OpenBatch } from './workbook-batch.js';
import { useAbortOnLeave } from './use-zip-upload.js';

// RF-150, RFC-005 section 4.2: what the Excel workbooks form remembers while it sends: the project
// it made, the batch a failed run left open, where each file is and what the server answered. A
// failure keeps the project (and the batch while it is open), so Upload again does not make a second
// project.

export type WorkbookPhase = 'idle' | 'sending' | 'finishing' | 'done' | 'failed';

export interface WorkbookFlowOptions {
  /** The project whose source is uploaded (the start page); absent on the New project form. */
  readonly existing?: Project;
  /** A project this form made; the batch may not be finished yet. */
  readonly onCreated?: (project: Project) => void;
  /** The batch is finished: the list reads again. */
  readonly onStored: (summary: WorkbookSummary) => void;
}

interface Where {
  readonly states: readonly FileState[];
  readonly percents: readonly number[];
}

export interface WorkbookFlow {
  readonly project: Project | undefined;
  readonly phase: WorkbookPhase;
  readonly where: Where;
  readonly summary: WorkbookSummary | undefined;
  readonly failure: ApiFailure | undefined;
  readonly send: (name: string, files: readonly File[]) => void;
  /** New files were chosen: forget the last result and place every file at Waiting. */
  readonly reset: (count: number) => void;
}

const replaceAt = <T>(list: readonly T[], index: number, value: T): T[] =>
  list.map((item, at) => (at === index ? value : item));

const all = <T>(count: number, value: T): T[] => Array.from({ length: count }, () => value);

interface Placement {
  readonly where: Where;
  /** Every file is at Waiting, with nothing sent. */
  readonly place: (count: number) => void;
  readonly mark: (index: number, state: FileState) => void;
  readonly percent: (index: number, percent: number) => void;
  /** After a failure, a file that was never reached reads Not sent. */
  readonly settle: () => void;
}

/** Where each file is: its state and how much of it has gone. */
function usePlacement(): Placement {
  const [where, setWhere] = useState<Where>({ states: [], percents: [] });
  return {
    where,
    place: (count) => {
      setWhere({ states: all(count, 'waiting'), percents: all(count, 0) });
    },
    mark: (index, state) => {
      setWhere((now) => ({ ...now, states: replaceAt(now.states, index, state) }));
    },
    percent: (index, percent) => {
      setWhere((now) => ({ ...now, percents: replaceAt(now.percents, index, percent) }));
    },
    settle: () => {
      setWhere((now) => ({
        ...now,
        states: now.states.map((state) => (state === 'waiting' ? 'unsent' : state)),
      }));
    },
  };
}

// RF-150
export function useWorkbookFlow(options: WorkbookFlowOptions): WorkbookFlow {
  const { client } = useApp();
  const signal = useAbortOnLeave();
  const placement = usePlacement();
  const [project, setProject] = useState(options.existing);
  const [batch, setBatch] = useState<OpenBatch | undefined>();
  const [phase, setPhase] = useState<WorkbookPhase>('idle');
  const [summary, setSummary] = useState<WorkbookSummary | undefined>();
  const [failure, setFailure] = useState<ApiFailure | undefined>();

  const reset = (count: number): void => {
    setSummary(undefined);
    setFailure(undefined);
    setPhase('idle');
    placement.place(count);
  };

  const send = (name: string, files: readonly File[]): void => {
    if (phase === 'sending' || phase === 'finishing') return;
    reset(files.length);
    setPhase('sending');
    const events: BatchEvents = {
      project: (made) => {
        setProject(made);
        options.onCreated?.(made);
      },
      batch: setBatch,
      file: placement.mark,
      progress: placement.percent,
      finishing: () => {
        setPhase('finishing');
      },
    };
    void runBatch({ client, signal, name, files, project, batch, events }).then((result) => {
      if (result.ok) {
        setSummary(result.value);
        setPhase('done');
        options.onStored(result.value);
        return;
      }
      setFailure(result.error);
      setPhase('failed');
      placement.settle();
    });
  };

  return { project, phase, where: placement.where, summary, failure, send, reset };
}
