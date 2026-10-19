import type { z } from 'zod';
import type { RunEvent } from '../../api/run-events.js';
import { endedData, resolvedData, scanData, startedData } from './event-data.js';
import type { RunState, SourceState } from './run-state.js';

// RF-1002, RF-1003, RF-1004: what the events of the run itself change: where it started, which
// source and which caps it has, and how it ended.

const GITHUB_REPOSITORY = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/u;

type StartedSource = NonNullable<z.output<typeof startedData>['source']>;

/** RF-131: the zip of an upload run, or the repository and commit of a GitHub run. */
function sourceStateOf(source: StartedSource): SourceState {
  if (source.kind === 'upload') {
    return {
      kind: 'upload',
      fileName: source.fileName,
      uploadedAt: source.uploadedAt,
      snapshotHash: source.snapshotHash ?? undefined,
      runId: undefined,
    };
  }
  return {
    owner: source.owner,
    repo: source.repo,
    subpath: source.subpath ?? '',
    commitSha: source.commitSha ?? undefined,
  };
}

// RF-1003, RF-1004, RF-006: a run that starts after it ended was resumed, so it is not ended any more,
// and its judgement step will run again (RF-1014: the claims a stop left unjudged wait for it).
export function onRunStarted(state: RunState, event: RunEvent): RunState {
  const restarted = { startedAt: event.at, ended: undefined, judgement: 'idle' } as const;
  const parsed = startedData.safeParse(event.data);
  if (!parsed.success) return { ...state, ...restarted };
  const { stage, source, caps } = parsed.data;
  const given = source === undefined ? undefined : sourceStateOf(source);
  return {
    ...state,
    ...restarted,
    stage: stage ?? state.stage,
    source: given ?? state.source,
    caps: caps === undefined ? state.caps : caps.run,
  };
}

/** The commit the source was pinned to, and the repository when the page has not seen it start. */
// RF-1004
export function onSourceResolved(state: RunState, event: RunEvent): RunState {
  const parsed = resolvedData.safeParse(event.data);
  if (!parsed.success || parsed.data.commitSha === undefined) return state;
  const { commitSha, url } = parsed.data;
  if (state.source?.kind === 'upload') return state;
  if (state.source !== undefined) return { ...state, source: { ...state.source, commitSha } };
  const match = url === undefined ? null : GITHUB_REPOSITORY.exec(url);
  const [, owner, repo] = match ?? [];
  if (owner === undefined || repo === undefined) return state;
  return { ...state, source: { owner, repo, subpath: '', commitSha } };
}

// RF-1003, RF-1108
export function onRunEnded(state: RunState, event: RunEvent): RunState {
  const parsed = endedData.safeParse(event.data);
  if (!parsed.success) return state;
  const { endState, errorCode, totals, failedAreas } = parsed.data;
  const costMicros = totals?.costMicros;
  return { ...state, ended: { endState, errorCode, costMicros, failedAreas } };
}

/** The files and areas the scan found; an event that does not carry both changes nothing. */
// RF-1002
export function onScanCompleted(state: RunState, event: RunEvent): RunState {
  const parsed = scanData.safeParse(event.data);
  if (!parsed.success) return state;
  return { ...state, scan: { files: parsed.data.files, areas: parsed.data.areas } };
}
