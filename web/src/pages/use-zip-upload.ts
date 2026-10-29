import { useEffect, useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import type { Project } from '../api/project-schemas.js';
import {
  createUploadProject,
  defaultUploadLimitMb,
  isAccepted,
  loadUploadLimitMb,
  uploadSource,
  type UploadState,
  type UploadSummary,
} from '../api/source-upload.js';
import { useApp } from '../app/app-context.js';
import { projectNameOf, zipProblem } from '../lib/zip-check.js';
import { useAbortOnLeave } from './use-abort-on-leave.js';
import { useZipBatch, type Ending, type UploadPhase } from './use-zip-batch.js';

// RF-128, RF-134, RFC-004 section 4.2: the state of the Upload a zip form. A chosen file is checked
// at once (name, size, first bytes), so a bad file is refused before anything is sent. Sending
// makes the project first (unless the form is for a project that exists), then uploads the archive
// and follows its progress. A failed upload keeps the project, so Upload again reuses it.

export interface ZipUploadOptions {
  /** The project whose source is uploaded; absent on the New project form, which makes one. */
  readonly existing?: Project;
  /** A project this form made; the file may not be stored yet. */
  readonly onCreated?: (project: Project) => void;
  /** The zip is stored: the project as it is now. */
  readonly onStored: (project: Project) => void;
}

export interface ZipUpload {
  readonly file: File | undefined;
  readonly problem: string | undefined;
  /** The file passed every check, so it may be sent. */
  readonly ready: boolean;
  readonly name: string;
  readonly setName: (name: string) => void;
  readonly limitMb: number;
  /** A new project would get an empty name: the user must type one. */
  readonly needsName: boolean;
  readonly phase: UploadPhase;
  readonly percent: number;
  /** RF-159, DEC-188: the batch the server reads a zip that holds workbooks in; absent until it answers. */
  readonly processing: UploadState | undefined;
  readonly summary: UploadSummary | undefined;
  readonly failure: ApiFailure | undefined;
  /** The project the zip goes to, once there is one. */
  readonly project: Project | undefined;
  readonly choose: (file: File | undefined) => void;
  readonly submit: () => void;
  /** RF-159: stops the zip being stored; nothing is published, unless it had already ended. */
  readonly cancel: () => void;
}

interface Checked {
  readonly file: File;
  readonly problem: string | undefined;
}

export function useUploadLimit(): number {
  const { client } = useApp();
  const [limitMb, setLimitMb] = useState(defaultUploadLimitMb);
  useEffect(() => {
    const abort = new AbortController();
    void loadUploadLimitMb(client, abort.signal).then((limit) => {
      if (!abort.signal.aborted) setLimitMb(limit);
    });
    return () => {
      abort.abort();
    };
  }, [client]);
  return limitMb;
}

interface Chosen {
  readonly file: File | undefined;
  readonly problem: string | undefined;
  readonly ready: boolean;
  readonly name: string;
  readonly setName: (name: string) => void;
  readonly choose: (file: File | undefined) => void;
}

/** The file chosen, checked at once and again when the limit changes; a late check never wins. */
function useChosenFile(limitMb: number): Chosen {
  const [file, setFile] = useState<File | undefined>();
  const [checked, setChecked] = useState<Checked | undefined>();
  const [name, setName] = useState('');
  useEffect(() => {
    setChecked(undefined);
    if (file === undefined) return undefined;
    let current = true;
    void zipProblem(file, limitMb).then((found) => {
      if (current) setChecked({ file, problem: found });
    });
    return () => {
      current = false;
    };
  }, [file, limitMb]);
  const choose = (chosen: File | undefined): void => {
    setFile(chosen);
    if (chosen !== undefined) setName(projectNameOf(chosen.name));
  };
  const problem = checked?.problem;
  const ready = file !== undefined && checked?.file === file && problem === undefined;
  return { file, problem, ready, name, setName, choose };
}

interface Flow {
  readonly project: Project | undefined;
  readonly phase: UploadPhase;
  readonly percent: number;
  readonly processing: UploadState | undefined;
  readonly summary: UploadSummary | undefined;
  readonly failure: ApiFailure | undefined;
  readonly send: (zip: File, name: string) => Promise<void>;
  readonly cancel: () => void;
  readonly reset: () => void;
}

/** The project as the server now holds it: the stored zip's name and date, and whether the code changed. */
function projectAfter(project: Project, zip: File | undefined, stored: UploadSummary): Project {
  const { fileName = zip?.name ?? project.name, uploadedAt = new Date().toISOString() } = stored;
  const { codeChangedSinceLastRun = project.codeChangedSinceLastRun } = stored;
  return { ...project, source: { fileName, uploadedAt }, codeChangedSinceLastRun };
}

interface Outcome {
  readonly phase: UploadPhase;
  readonly processing: UploadState | undefined;
  readonly summary: UploadSummary | undefined;
  readonly failure: ApiFailure | undefined;
  readonly fail: (error: ApiFailure) => void;
  readonly set: (phase: UploadPhase, state: UploadState | undefined) => void;
  readonly reset: () => void;
  readonly ending: Ending;
}

/** Where the upload is and how it ended: the summary of the zip, or the failure. */
function useOutcome(options: ZipUploadOptions): Outcome {
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [processing, setProcessing] = useState<UploadState | undefined>();
  const [summary, setSummary] = useState<UploadSummary | undefined>();
  const [failure, setFailure] = useState<ApiFailure | undefined>();
  const fail = (error: ApiFailure): void => {
    setFailure(error);
    setPhase('failed');
  };
  const set = (next: UploadPhase, state: UploadState | undefined): void => {
    setPhase(next);
    setProcessing(state);
  };
  const reset = (): void => {
    setSummary(undefined);
    setFailure(undefined);
    set('idle', undefined);
  };
  const ending: Ending = (target, result, zip) => {
    if (!result.ok) {
      fail(result.error);
      return;
    }
    setSummary(result.value);
    setPhase('done');
    options.onStored(projectAfter(target, zip, result.value));
  };
  return { phase, processing, summary, failure, fail, set, reset, ending };
}

/** Makes the project (unless there is one), sends the archive and follows it. */
function useUploadFlow(options: ZipUploadOptions): Flow {
  const { client } = useApp();
  const [project, setProject] = useState(options.existing);
  const [percent, setPercent] = useState(0);
  const out = useOutcome(options);
  const watching = useZipBatch(options.existing, out.ending, out.set);
  const abort = useAbortOnLeave();
  /** The project the zip goes to: the one that exists, or a new one named by the user. */
  const make = async (name: string): Promise<Project | undefined> => {
    const created = await createUploadProject(client, name.trim());
    if (!created.ok) {
      out.fail(created.error);
      return undefined;
    }
    setProject(created.value);
    options.onCreated?.(created.value);
    return created.value;
  };
  const send = async (zip: File, name: string): Promise<void> => {
    out.reset();
    out.set('sending', undefined);
    setPercent(0);
    const target = project ?? (await make(name));
    if (target === undefined) return;
    const onProgress = (loaded: number, total: number): void => {
      setPercent(Math.floor((loaded * 100) / total));
    };
    const answer = await uploadSource(client, target.id, zip, { onProgress, signal: abort });
    if (!answer.ok) out.fail(answer.error);
    // DEC-188: a zip that holds workbooks is accepted at once; the server stores it after the request.
    else if (isAccepted(answer.value)) watching.follow(target, answer.value, zip);
    else out.ending(target, { ok: true, value: answer.value }, zip);
  };
  const cancel = (): void => {
    watching.cancel(project, out.processing);
  };
  const { phase, processing, summary, failure, reset } = out;
  return { project, phase, percent, processing, summary, failure, send, cancel, reset };
}

// RF-128, RF-134
export function useZipUpload(options: ZipUploadOptions): ZipUpload {
  const limitMb = useUploadLimit();
  const chosen = useChosenFile(limitMb);
  const flow = useUploadFlow(options);
  const { file, ready } = chosen;
  const name = chosen.name.trim() || projectNameOf(file?.name ?? '').trim();
  const needsName = flow.project === undefined && name === '';
  const submit = (): void => {
    if (file === undefined || !ready || needsName) return;
    if (flow.phase === 'sending' || flow.phase === 'processing') return;
    void flow.send(file, name);
  };
  const choose = (picked: File | undefined): void => {
    flow.reset();
    chosen.choose(picked);
  };
  return { ...chosen, ...flow, limitMb, needsName, choose, submit };
}
