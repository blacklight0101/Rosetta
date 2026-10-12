import type { RunEvent } from '../../api/run-events.js';
import { endedData, resolvedData, startedData } from './event-data.js';
import type { RunState, SourceState } from './run-state.js';

// RF-1002, RF-1003, RF-1004: what the events of the run itself change: where it started, which
// source and which caps it has, and how it ended.

const GITHUB_REPOSITORY = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/u;

// RF-1003, RF-1004
export function onRunStarted(state: RunState, event: RunEvent): RunState {
  const parsed = startedData.safeParse(event.data);
  if (!parsed.success) return { ...state, startedAt: event.at };
  const { stage, source, caps } = parsed.data;
  const given: SourceState | undefined =
    source === undefined
      ? undefined
      : {
          owner: source.owner,
          repo: source.repo,
          subpath: source.subpath ?? '',
          commitSha: source.commitSha ?? undefined,
        };
  return {
    ...state,
    startedAt: event.at,
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
  const { endState, errorCode, totals } = parsed.data;
  return { ...state, ended: { endState, errorCode, costMicros: totals?.costMicros } };
}
