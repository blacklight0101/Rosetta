import { useEffect, useRef, useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import type { Project } from '../api/project-schemas.js';
import { getHistory } from '../api/history.js';
import { startRun } from '../api/runs.js';
import { useApp } from '../app/app-context.js';

// RF-160, RF-1001, ADR-027: adding a source starts the free scan by itself, so the page never asks
// for "scan only". A project with a source and no finished scan is looked up in its history: with
// no scan run, one is started; with one queued or running, the page waits for it (the history is
// read again every 2 s) and calls `onScanned` when it has ended; with one that ended without
// finishing, the page says so and offers "Scan again". Starting the scan does not leave the page:
// the user's next click is Analyse. A page is not left to scan again by itself, so a scan that
// fails is not repeated on every visit.

const POLL_MS = 2000;

type ScanState =
  /** Not asked: the project has no source yet, or a scan has finished. */
  | { readonly kind: 'idle' }
  | { readonly kind: 'starting' }
  | { readonly kind: 'scanning'; readonly position: number | null }
  | { readonly kind: 'failed'; readonly error: ApiFailure | undefined };

export interface AutoScan {
  readonly state: ScanState;
  /** Starts a new scan (after a failed one, or for an out-of-date code map). */
  readonly scanAgain: () => void;
}

/** RF-160: the project holds something to scan: a repository address, or a stored zip or workbooks. */
export function hasSourceOf(project: Project): boolean {
  return project.sourceKind === 'github' ? project.sourceUrl !== '' : project.source !== null;
}

/** The newest scan run of the history, or undefined when it has none (the history is newest first). */
async function newestScan(
  client: ReturnType<typeof useApp>['client'],
  projectId: string,
  signal: AbortSignal,
) {
  const history = await getHistory(client, projectId, signal);
  if (!history.ok) return history;
  return { ok: true as const, value: history.value.runs.find((run) => run.stage === 'scan') };
}

interface Follow {
  readonly client: ReturnType<typeof useApp>['client'];
  readonly projectId: string;
  /** Start a new scan at once, instead of looking at the history first. */
  readonly ask: boolean;
  readonly setState: (state: ScanState) => void;
  readonly done: () => void;
}

/** Starts or watches the project's scan until it ends; returns what stops the watching. */
function followScan({ client, projectId, ask, setState, done }: Follow): () => void {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const again = (): void => {
    timer = setTimeout(() => void watch(), POLL_MS);
  };
  const launch = async (): Promise<void> => {
    setState({ kind: 'starting' });
    const started = await startRun(client, projectId, { stage: 'scan' });
    if (abort.signal.aborted) return;
    if (started.ok) await watch();
    else setState({ kind: 'failed', error: started.error });
  };
  const watch = async (): Promise<void> => {
    const found = await newestScan(client, projectId, abort.signal);
    if (abort.signal.aborted) return;
    const scan = found.ok ? found.value : undefined;
    if (scan === undefined) {
      // No scan yet: start one; a history that could not be read is read again.
      if (found.ok) await launch();
      else again();
      return;
    }
    if (scan.queueState === 'Ended') {
      if (scan.endState === 'Completed') {
        setState({ kind: 'idle' });
        done();
      } else setState({ kind: 'failed', error: undefined });
      return;
    }
    setState({ kind: 'scanning', position: scan.position });
    again();
  };
  void (ask ? launch() : watch());
  return () => {
    abort.abort();
    clearTimeout(timer);
  };
}

// RF-160
/** `unscanned`: the page has no code map yet (the estimate says none), so a project with a source is scanned. */
export function useAutoScan(project: Project, unscanned: boolean, onScanned: () => void): AutoScan {
  const { client } = useApp();
  const projectId = project.id;
  const needsScan = unscanned && hasSourceOf(project);
  const [state, setState] = useState<ScanState>({ kind: 'idle' });
  const [round, setRound] = useState(0);
  const [wanted, setWanted] = useState(false);
  const forced = useRef(false);
  const told = useRef(onScanned);
  told.current = onScanned;

  const scanAgain = (): void => {
    forced.current = true;
    setWanted(true);
    setRound((current) => current + 1);
  };
  // RF-160: a source that replaces the one the project held is a new source, so it is scanned again.
  const sourceKey =
    project.source === null ? '' : `${project.source.fileName}|${project.source.uploadedAt}`;
  const seen = useRef(sourceKey);
  useEffect(() => {
    const replaced = seen.current !== '' && sourceKey !== '' && seen.current !== sourceKey;
    seen.current = sourceKey;
    if (replaced) scanAgain();
  }, [sourceKey]);

  useEffect(() => {
    if (!needsScan && !wanted) {
      setState({ kind: 'idle' });
      return undefined;
    }
    const ask = forced.current;
    forced.current = false;
    const done = (): void => {
      setWanted(false);
      told.current();
    };
    return followScan({ client, projectId, ask, setState, done });
  }, [client, projectId, needsScan, wanted, round]);

  return { state, scanAgain };
}
