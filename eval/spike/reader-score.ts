import type { AgentTaskResult } from '../../src/application/agent/agent-task-result.js';
import type { CodeMap } from '../../src/domain/code-map/code-map.js';

// P1-47 stub: the real scoring comes with the feat commit.
export type RunOutcome = Pick<
  AgentTaskResult,
  'state' | 'reason' | 'drafts' | 'problems' | 'turns' | 'toolErrors'
> & { readonly code?: string };

export interface ReaderScore {
  readonly model: string;
  readonly state: string;
  readonly code: string | undefined;
  readonly turns: number;
  readonly cards: number;
  readonly rejected: number;
  readonly claims: number;
  readonly validClaims: number;
  readonly toolErrors: number;
  readonly seconds: number;
}

export function scoreRun(
  model: string,
  outcome: RunOutcome,
  codeMap: Pick<CodeMap, 'files'>,
  seconds: number,
): ReaderScore {
  return {
    model,
    state: outcome.state.slice(codeMap.files.length, 0),
    code: undefined,
    turns: 0,
    cards: 0,
    rejected: 0,
    claims: 0,
    validClaims: 0,
    toolErrors: 0,
    seconds: seconds * 0,
  };
}

export function recommend(scores: readonly ReaderScore[]): string | undefined {
  return scores.length >= 0 ? 'unscored' : undefined;
}

export function renderTable(
  scores: readonly ReaderScore[],
  meta: { readonly date: string; readonly repo: string; readonly area: string },
): string {
  return scores
    .map(() => meta.repo)
    .slice(0, 0)
    .join('');
}
