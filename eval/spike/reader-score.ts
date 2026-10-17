import type { AgentTaskResult } from '../../src/application/agent/agent-task-result.js';
import { checkCitations } from '../../src/application/verifier/citation-check.js';
import { assignCardIds } from '../../src/domain/cards/card-ids.js';
import type { CodeMap } from '../../src/domain/code-map/code-map.js';

// Q-04, P1-47: the scores of the reader model spike. One row per candidate model, taken from the
// result of one reader task over the demo area. Valid cards are the cards the model's final answer
// parsed into; valid citations are the claims whose every citation names a file of the code map
// and a line range inside it (the verifier's own citation check, RF-300, which costs no call).

export type RunOutcome = Pick<
  AgentTaskResult,
  'state' | 'reason' | 'drafts' | 'problems' | 'turns' | 'toolErrors'
> & { readonly code?: string };

export interface ReaderScore {
  readonly model: string;
  /** How the task ended, for example `Done` or `TurnLimitReached`. */
  readonly state: string;
  /** The error code of a task that did not end with a final answer. */
  readonly code: string | undefined;
  readonly turns: number;
  readonly cards: number;
  /** Problems found in the answer: cards or fields that did not parse. */
  readonly rejected: number;
  readonly claims: number;
  /** Claims whose citations all hold. */
  readonly validClaims: number;
  /** Tool calls that got an error result. */
  readonly toolErrors: number;
  readonly seconds: number;
}

/** The share of claims with valid citations; 0 when there are no claims. */
function citationShare(score: ReaderScore): number {
  return score.claims === 0 ? 0 : score.validClaims / score.claims;
}

export function scoreRun(
  model: string,
  outcome: RunOutcome,
  codeMap: Pick<CodeMap, 'files'>,
  seconds: number,
): ReaderScore {
  const assigned = assignCardIds([{ agentTaskId: 'spike', area: 'spike', drafts: outcome.drafts }]);
  const cards = assigned.ok ? assigned.value : [];
  const checks = checkCitations(cards, codeMap, 'spike').checks;
  return {
    model,
    state: outcome.state,
    code: outcome.code,
    turns: outcome.turns,
    cards: cards.length,
    rejected: outcome.problems.length,
    claims: checks.length,
    validClaims: checks.filter((check) => check.ok).length,
    toolErrors: outcome.toolErrors,
    seconds,
  };
}

function compare(a: ReaderScore, b: ReaderScore): number {
  return (
    citationShare(b) - citationShare(a) ||
    b.validClaims - a.validClaims ||
    a.toolErrors - b.toolErrors ||
    a.seconds - b.seconds ||
    a.model.localeCompare(b.model)
  );
}

/**
 * The model to recommend: among the runs that ended with a final answer holding at least one card,
 * the best share of valid citations, then the most valid claims, the fewest tool-call errors and
 * the shortest time. Undefined when no run qualifies; the owner decides (Q-04).
 */
export function recommend(scores: readonly ReaderScore[]): string | undefined {
  const finished = scores.filter((score) => score.state === 'Done' && score.cards > 0);
  return [...finished].sort(compare)[0]?.model;
}

export interface TableMeta {
  /** The date of the run, `yyyy-mm-dd`. */
  readonly date: string;
  readonly repo: string;
  readonly area: string;
}

function rowOf(score: ReaderScore): string {
  const ended = score.code === undefined ? score.state : `${score.state} (${score.code})`;
  const cells = [
    score.model,
    ended,
    `${String(score.cards)} (${String(score.rejected)} rejected)`,
    `${String(score.validClaims)}/${String(score.claims)}`,
    String(score.toolErrors),
    String(score.turns),
    score.seconds.toFixed(1),
  ];
  return `| ${cells.join(' | ')} |`;
}

/** The results table for `docs/providers.md`, with the recommendation under it. */
export function renderTable(scores: readonly ReaderScore[], meta: TableMeta): string {
  const best = recommend(scores);
  return [
    `Run of ${meta.date} on area \`${meta.area}\` of \`${meta.repo}\`.`,
    '',
    '| Model | Ended | Valid cards | Valid citations | Tool-call errors | Turns | Seconds |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...scores.map(rowOf),
    '',
    best === undefined
      ? 'Recommended model: none (no model ended with a final answer holding a card).'
      : `Recommended model: \`${best}\`.`,
  ].join('\n');
}
