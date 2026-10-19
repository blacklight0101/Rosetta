import { useEffect, useRef, useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import type { Project } from '../api/project-schemas.js';
import {
  createUploadProject,
  defaultUploadLimitMb,
  loadUploadLimitMb,
  uploadSource,
  type UploadSummary,
} from '../api/source-upload.js';
import { useApp } from '../app/app-context.js';
import { projectNameOf, zipProblem } from '../lib/zip-check.js';

// RF-128, RF-134, RFC-004 section 4.2: the state of the Upload a zip form. A chosen file is checked
// at once (name, size, first bytes), so a bad file is refused before anything is sent. Sending
// makes the project first (unless the form is for a project that exists), then uploads the archive
// and follows its progress. A failed upload keeps the project, so Upload again reuses it.

type UploadPhase = 'idle' | 'sending' | 'done' | 'failed';

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
  readonly summary: UploadSummary | undefined;
  readonly failure: ApiFailure | undefined;
  /** The project the zip goes to, once there is one. */
  readonly project: Project | undefined;
  readonly choose: (file: File | undefined) => void;
  readonly submit: () => void;
}

interface Checked {
  readonly file: File;
  readonly problem: string | undefined;
}

function useUploadLimit(): number {
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
  readonly summary: UploadSummary | undefined;
  readonly failure: ApiFailure | undefined;
  readonly send: (zip: File, name: string) => Promise<void>;
  readonly reset: () => void;
}

/** A signal that fires when the form goes away (another tab, another page), so an upload stops. */
function useAbortOnLeave(): AbortSignal {
  const controller = useRef(new AbortController());
  useEffect(() => {
    const current = controller.current;
    return () => {
      current.abort();
    };
  }, []);
  return controller.current.signal;
}

/** Makes the project (unless there is one), sends the archive and follows it. */
function useUploadFlow(options: ZipUploadOptions): Flow {
  const { client } = useApp();
  const [project, setProject] = useState(options.existing);
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [percent, setPercent] = useState(0);
  const [summary, setSummary] = useState<UploadSummary | undefined>();
  const [failure, setFailure] = useState<ApiFailure | undefined>();
  const fail = (error: ApiFailure): void => {
    setFailure(error);
    setPhase('failed');
  };
  const reset = (): void => {
    setSummary(undefined);
    setFailure(undefined);
    setPhase('idle');
  };
  const abort = useAbortOnLeave();
  const send = async (zip: File, name: string): Promise<void> => {
    setPhase('sending');
    setFailure(undefined);
    setPercent(0);
    let target = project;
    if (target === undefined) {
      const created = await createUploadProject(client, name.trim());
      if (!created.ok) {
        fail(created.error);
        return;
      }
      target = created.value;
      setProject(target);
      options.onCreated?.(target);
    }
    const signal = abort;
    const stored = await uploadSource(client, target.id, zip, {
      onProgress: (loaded, total) => {
        setPercent(Math.floor((loaded * 100) / total));
      },
      signal,
    });
    if (!stored.ok) {
      fail(stored.error);
      return;
    }
    setSummary(stored.value);
    setPhase('done');
    const { fileName = zip.name, uploadedAt = new Date().toISOString() } = stored.value;
    options.onStored({ ...target, source: { fileName, uploadedAt } });
  };
  return { project, phase, percent, summary, failure, send, reset };
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
    if (file === undefined || !ready || needsName || flow.phase === 'sending') return;
    void flow.send(file, name);
  };
  const choose = (picked: File | undefined): void => {
    flow.reset();
    chosen.choose(picked);
  };
  return { ...chosen, ...flow, limitMb, needsName, choose, submit };
}
