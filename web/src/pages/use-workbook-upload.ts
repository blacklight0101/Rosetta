import { useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import type { Project } from '../api/project-schemas.js';
import { defaultWorkbookMaxFiles, type WorkbookSummary } from '../api/workbook-upload.js';
import { workbookProblems, workbookProjectName } from '../lib/workbook-check.js';
import {
  useWorkbookFlow,
  type WorkbookFlowOptions,
  type WorkbookPhase,
} from './use-workbook-flow.js';
import { useUploadLimit } from './use-zip-upload.js';
import type { FileState } from './workbook-batch.js';

// RF-150, RF-158, RFC-005 section 4.2: the state of the Excel workbooks form. The files chosen are
// checked at every render (so a limit that arrives late applies to them), which refuses a bad set
// before anything is sent. Sending is the flow of `use-workbook-flow.ts`.

export interface WorkbookItem {
  readonly file: File;
  readonly state: FileState;
  readonly percent: number;
}

export interface WorkbookUpload {
  readonly items: readonly WorkbookItem[];
  readonly problems: readonly string[];
  readonly ready: boolean;
  readonly name: string;
  readonly setName: (name: string) => void;
  readonly limitMb: number;
  readonly maxFiles: number;
  /** A new project would get an empty name: the user must type one. */
  readonly needsName: boolean;
  readonly phase: WorkbookPhase;
  /** The number (from 1) of the file going out; 0 when none is. */
  readonly current: number;
  readonly summary: WorkbookSummary | undefined;
  readonly failure: ApiFailure | undefined;
  readonly project: Project | undefined;
  readonly choose: (files: readonly File[]) => void;
  readonly submit: () => void;
}

// RF-150, RF-158
export function useWorkbookUpload(options: WorkbookFlowOptions): WorkbookUpload {
  const limitMb = useUploadLimit();
  const flow = useWorkbookFlow(options);
  const [files, setFiles] = useState<readonly File[]>([]);
  const [typedName, setName] = useState('');
  const maxFiles = defaultWorkbookMaxFiles;
  const problems = workbookProblems(files, { maxFiles, limitMb });
  const first = files[0];
  const name =
    typedName.trim() || (first === undefined ? '' : workbookProjectName(first.name).trim());
  const needsName = flow.project === undefined && name === '';
  const ready = files.length > 0 && problems.length === 0;

  const choose = (chosen: readonly File[]): void => {
    flow.reset(chosen.length);
    setFiles(chosen);
    setName(chosen[0] === undefined ? '' : workbookProjectName(chosen[0].name));
  };
  const submit = (): void => {
    if (ready && !needsName) flow.send(name, files);
  };
  const items = files.map((file, index) => ({
    file,
    state: flow.where.states[index] ?? 'waiting',
    percent: flow.where.percents[index] ?? 0,
  }));
  const current = flow.where.states.indexOf('sending') + 1;
  return {
    ...flow,
    items,
    problems,
    ready,
    name: typedName,
    setName,
    limitMb,
    maxFiles,
    needsName,
    current,
    choose,
    submit,
  };
}
