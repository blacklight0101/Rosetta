import type { Card } from '../../domain/cards/card.js';
import {
  applyMerges,
  disjointMerges,
  type CardMerge,
  type MergeMoves,
  type MergeResult,
} from '../../domain/cards/card-merge.js';
import type { CardType } from '../../domain/cards/card-vocabulary.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { PromptFile } from '../agent/prompt-file.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { LlmProvider, LlmResponse } from '../ports/llm-provider.js';
import type { Logger } from '../ports/logger.js';
import type { RoleProvider } from '../providers/provider-set.js';
import { parseMergeAnswer } from './merge-answer.js';
import { mergeBatches, mergeMessage, typesToMerge } from './merge-request.js';

// RF-250, ADR-005, architecture section 8 (summariser): once the readers of all areas have ended,
// the summariser is asked, for each type that two reader tasks wrote (Q-52), which cards describe the same
// entity or rule. It sees only the cards. The domain then merges the cards it names, keeping
// every claim and citation. A call that fails, an answer that is not a list of merges, or a merge
// that is not valid leaves the cards as they were: consolidation never costs a card. A type with
// more cards than `batchTokens` is shown in batches, one call each (P2-35). A cap that refuses a
// call ends the step: the cards not merged yet stay as they are and the run goes on (RF-422).

export interface ConsolidationParts {
  readonly provider: LlmProvider;
  readonly role: Pick<RoleProvider, 'model' | 'maxOutputTokens' | 'temperature'>;
  /** `summariser/merge.v<n>.md`, the system prompt. */
  readonly prompt: PromptFile;
  readonly logger: Logger;
  readonly ids: Pick<IdGenerator, 'dataBlockTag'>;
  readonly runId: string;
  /** One per run, 32 hexadecimal characters. */
  readonly traceId: string;
  /** P2-35: the most tokens of cards one call is shown. */
  readonly batchTokens: number;
  readonly nextCallId: () => string;
  readonly signal: AbortSignal;
  /** Called with every answer the summariser gave (manifest records). */
  readonly onAnswer: (response: LlmResponse) => Promise<void>;
}

export interface Consolidation {
  readonly cards: readonly Card[];
  readonly merges: readonly CardMerge[];
  /** Where the claims of each merge went (RF-250); the run publishes them as `cards.merged`. */
  readonly moves: readonly MergeMoves[];
  /** P2-35: the types the summariser answered about, every batch of them. */
  readonly answered: readonly CardType[];
  /** P2-35: a cap refused a call, so the step ended there. */
  readonly capped: boolean;
}

const SUMMARISER = 'summariser';

function log(parts: ConsolidationParts, level: 'info' | 'warn', message: string): Promise<void> {
  return parts.logger.log({ level, logger: 'understand', message, runId: parts.runId });
}

/** What one call came to: the answer's text, nothing usable, or a cap that refused the call. */
type Asked =
  | { readonly kind: 'answer'; readonly text: string }
  | { readonly kind: 'none' }
  | { readonly kind: 'capped' };

interface Batch {
  readonly type: CardType;
  readonly cards: readonly Card[];
  /** `summariser-ent`, or `summariser-ent-2` when the type is sent in several batches. */
  readonly agentTaskId: string;
}

async function ask(parts: ConsolidationParts, batch: Batch): Promise<Asked> {
  const { role, signal } = parts;
  const { agentTaskId, type } = batch;
  try {
    const response = await parts.provider.complete({
      context: {
        ...{ runId: parts.runId, agentTaskId, role: SUMMARISER, callId: parts.nextCallId() },
        ...{ traceId: parts.traceId, parentSpanId: `${parts.traceId.slice(0, 13)}fff` },
      },
      model: role.model,
      system: parts.prompt.text,
      messages: [
        { role: 'user', content: mergeMessage(batch.cards, type, parts.ids.dataBlockTag()) },
      ],
      tools: [],
      maxOutputTokens: role.maxOutputTokens,
      ...(role.temperature === undefined ? {} : { temperature: role.temperature }),
      signal,
    });
    await parts.onAnswer(response);
    return { kind: 'answer', text: response.text };
  } catch (error) {
    if (signal.aborted) return { kind: 'none' };
    const code = error instanceof RosettaError ? error.code : ERROR_CODES.providerCallFailed;
    const capped = code === ERROR_CODES.budgetCapReached;
    const message = capped
      ? `A cap refused the summariser call for the ${type} cards; the merge ends here and the cards stay as they are.`
      : `The summariser could not compare the ${type} cards; they stay as they are.`;
    await parts.logger.log({
      ...{ level: 'warn', logger: 'understand', code, runId: parts.runId, agentTaskId },
      message,
    });
    return { kind: capped ? 'capped' : 'none' };
  }
}

async function logResult(
  parts: ConsolidationParts,
  result: MergeResult,
  unseen: readonly CardMerge[],
): Promise<void> {
  for (const merge of result.applied) {
    await log(parts, 'info', `The summariser merged ${merge.ids.join(', ')} into one card.`);
  }
  const refused = [
    ...unseen.map((merge) => ({ merge, problem: 'unknown-card' })),
    ...result.skipped,
  ];
  for (const { merge, problem } of refused) {
    await log(parts, 'warn', `A merge of ${merge.ids.join(', ')} was skipped: ${problem}.`);
  }
}

/** What one batch changed, and whether the summariser gave a usable answer for it. */
interface BatchEnd {
  readonly changes: Pick<Consolidation, 'cards' | 'merges' | 'moves'>;
  readonly outcome: 'answered' | 'unusable' | 'capped';
}

async function consolidateBatch(
  parts: ConsolidationParts,
  cards: readonly Card[],
  batch: Batch,
): Promise<BatchEnd> {
  const none = { cards, merges: [], moves: [] };
  const asked = await ask(parts, batch);
  if (asked.kind !== 'answer') {
    return { changes: none, outcome: asked.kind === 'capped' ? 'capped' : 'unusable' };
  }
  const merges = parseMergeAnswer(asked.text);
  if (merges === undefined) {
    await log(
      parts,
      'warn',
      `The summariser answer for the ${batch.type} cards could not be used.`,
    );
    return { changes: none, outcome: 'unusable' };
  }
  // The summariser was shown the cards of this batch only; an id it was not shown is not a merge.
  const shown = new Set(batch.cards.map((card) => card.id));
  const usable = merges.filter((merge) => merge.ids.every((id) => shown.has(id)));
  const result = applyMerges(cards, disjointMerges(usable));
  await logResult(
    parts,
    result,
    merges.filter((merge) => !usable.includes(merge)),
  );
  const changes = { cards: result.cards, merges: result.applied, moves: result.moves };
  return { changes, outcome: 'answered' };
}

async function consolidateType(
  parts: ConsolidationParts,
  cards: readonly Card[],
  type: CardType,
): Promise<Consolidation> {
  const batches = mergeBatches(cards, type, parts.batchTokens);
  let current: Consolidation = { cards, merges: [], moves: [], answered: [], capped: false };
  let answeredAll = batches.length > 0;
  for (const [index, batchCards] of batches.entries()) {
    if (parts.signal.aborted) return current;
    const suffix = batches.length > 1 ? `-${String(index + 1)}` : '';
    const agentTaskId = `${SUMMARISER}-${type.toLowerCase()}${suffix}`;
    const { changes, outcome } = await consolidateBatch(parts, current.cards, {
      ...{ type, agentTaskId, cards: batchCards },
    });
    current = {
      ...{ cards: changes.cards, answered: [], capped: outcome === 'capped' },
      merges: [...current.merges, ...changes.merges],
      moves: [...current.moves, ...changes.moves],
    };
    if (outcome === 'capped') return current;
    answeredAll &&= outcome === 'answered';
  }
  return { ...current, answered: answeredAll ? [type] : [] };
}

/** The cards with the duplicates of several areas or of one area merged, and the merges made. */
// RF-250
export async function consolidateCards(
  parts: ConsolidationParts,
  cards: readonly Card[],
  options: { readonly skip?: ReadonlySet<CardType> } = {},
): Promise<Consolidation> {
  let current: Consolidation = { cards, merges: [], moves: [], answered: [], capped: false };
  for (const type of typesToMerge(cards)) {
    if (options.skip?.has(type) === true) continue;
    if (parts.signal.aborted) break;
    const next = await consolidateType(parts, current.cards, type);
    current = {
      cards: next.cards,
      merges: [...current.merges, ...next.merges],
      moves: [...current.moves, ...next.moves],
      answered: [...current.answered, ...next.answered],
      capped: next.capped,
    };
    if (next.capped) break;
  }
  return current;
}
