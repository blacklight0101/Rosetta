import type { Card } from '../../domain/cards/card.js';
import {
  applyMerges,
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
import { mergeMessage, typesToMerge } from './merge-request.js';

// RF-250, ADR-005, architecture section 8 (summariser): once the readers of all areas have ended,
// the summariser is asked, for each type that two areas wrote, which cards describe the same
// entity or rule. It sees only the cards. The domain then merges the cards it names, keeping
// every claim and citation. A call that fails, an answer that is not a list of merges, or a merge
// that is not valid leaves the cards as they were: consolidation never costs a card.

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

/** The summariser's answer to one type, or undefined when the call failed or the run stopped. */
async function ask(
  parts: ConsolidationParts,
  cards: readonly Card[],
  type: CardType,
): Promise<string | undefined> {
  const { role, signal } = parts;
  const agentTaskId = `${SUMMARISER}-${type.toLowerCase()}`;
  try {
    const response = await parts.provider.complete({
      context: {
        ...{ runId: parts.runId, agentTaskId, role: SUMMARISER, callId: parts.nextCallId() },
        ...{ traceId: parts.traceId, parentSpanId: `${parts.traceId.slice(0, 13)}fff` },
      },
      model: role.model,
      system: parts.prompt.text,
      messages: [{ role: 'user', content: mergeMessage(cards, type, parts.ids.dataBlockTag()) }],
      tools: [],
      maxOutputTokens: role.maxOutputTokens,
      ...(role.temperature === undefined ? {} : { temperature: role.temperature }),
      signal,
    });
    await parts.onAnswer(response);
    return response.text;
  } catch (error) {
    if (signal.aborted) return undefined;
    const code = error instanceof RosettaError ? error.code : ERROR_CODES.providerCallFailed;
    await parts.logger.log({
      ...{ level: 'warn', logger: 'understand', code, runId: parts.runId, agentTaskId },
      message: `The summariser could not compare the ${type} cards; they stay as they are.`,
    });
    return undefined;
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

async function consolidateType(
  parts: ConsolidationParts,
  cards: readonly Card[],
  type: CardType,
): Promise<Consolidation> {
  const none = { cards, merges: [], moves: [], answered: [], capped: false };
  const output = await ask(parts, cards, type);
  if (output === undefined) return none;
  const merges = parseMergeAnswer(output);
  if (merges === undefined) {
    await log(parts, 'warn', `The summariser answer for the ${type} cards could not be used.`);
    return none;
  }
  // The summariser was shown the cards of this type only; an id it was not shown is not a merge.
  const shown = new Set(cards.filter((card) => card.type === type).map((card) => card.id));
  const usable = merges.filter((merge) => merge.ids.every((id) => shown.has(id)));
  const result = applyMerges(cards, usable);
  await logResult(
    parts,
    result,
    merges.filter((merge) => !usable.includes(merge)),
  );
  return {
    ...{ cards: result.cards, merges: result.applied, moves: result.moves },
    ...{ answered: [], capped: false },
  };
}

/** The cards with the duplicates of several areas merged, and the merges made. */
// RF-250
export async function consolidateCards(
  parts: ConsolidationParts,
  cards: readonly Card[],
  options: { readonly skip?: ReadonlySet<CardType> } = {},
): Promise<Consolidation> {
  let current: Consolidation = { cards, merges: [], moves: [], answered: [], capped: false };
  for (const type of typesToMerge(cards)) {
    if (parts.signal.aborted || (options.skip?.size ?? 0) < 0) break;
    const next = await consolidateType(parts, current.cards, type);
    current = {
      cards: next.cards,
      merges: [...current.merges, ...next.merges],
      moves: [...current.moves, ...next.moves],
      answered: [],
      capped: false,
    };
  }
  return current;
}
