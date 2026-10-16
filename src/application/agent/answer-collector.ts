import type { CardDraft } from '../../domain/cards/card-ids.js';
import type { Result } from '../../domain/errors/result.js';
import type { AgentTaskEnd } from './agent-task-result.js';
import { parseCardsLenient, type CardParse } from '../cards/parse-cards.js';
import type { OutputProblem } from '../cards/output-problem.js';
import { renderRepairRequest } from '../cards/repair-request.js';
import type { ReaderPrompts } from './reader-prompts.js';

// RF-202, RF-208: what an agent's final answer is worth, with the follow-ups it earns. The first
// answer is read leniently (valid cards and claims are kept, the rest is listed). Problems earn up
// to two targeted repairs, each asking only about what is still wrong; an answer that is cut off
// earns up to two continuations instead of a new start. Every follow-up is one more model turn, so
// the turn limit, the context share, a stop and the caps apply to it like to any other turn.

/** Repairs after the first answer: the second one gets only the problems that remain. */
const maxRepairs = 2;
/** Continuations of an answer cut off by the output limit. */
const maxContinuations = 2;

/** Sends a follow-up message after the model's previous text; the answer, or why no turn could run. */
export type AskModel = (previous: string, message: string) => Promise<Result<string, AgentTaskEnd>>;

export interface CollectedAnswer {
  /** Valid cards of every answer, a card seen twice kept once (the one with more claims). */
  readonly drafts: readonly CardDraft[];
  /** What is still wrong after the last answer: dropped claims and cards, or why nothing was read. */
  readonly problems: readonly OutputProblem[];
  /** Every answer of the model that was read, in order, for the user to look at. */
  readonly rawOutputs: readonly string[];
  /** Set when a follow-up could not run: the end the task takes, with the drafts so far. */
  readonly stopped?: AgentTaskEnd;
}

function keyOf(draft: CardDraft): string {
  return `${draft.type}\u0000${draft.title.trim().toLowerCase()}`;
}

/** The cards of both lists; one that appears in both is kept once, with the most claims. */
// RF-208
export function mergeDrafts(
  earlier: readonly CardDraft[],
  later: readonly CardDraft[],
): readonly CardDraft[] {
  const merged = [...earlier];
  for (const draft of later) {
    const at = merged.findIndex((each) => keyOf(each) === keyOf(draft));
    if (at < 0) merged.push(draft);
    else if (draft.claims.length >= (merged[at]?.claims.length ?? 0)) merged[at] = draft;
  }
  return merged;
}

class Collector {
  private readonly ask: AskModel;
  private readonly prompts: ReaderPrompts;
  private drafts: readonly CardDraft[] = [];
  private readonly raws: string[] = [];
  private text = '';
  private last = '';
  private read: CardParse = { drafts: [], problems: [], cutOff: false };
  private repairs = 0;
  private continuations = 0;

  constructor(ask: AskModel, prompts: ReaderPrompts) {
    this.ask = ask;
    this.prompts = prompts;
  }

  async collect(first: string): Promise<CollectedAnswer> {
    this.raws.push(first);
    this.take(first);
    for (;;) {
      const message = this.nextMessage();
      if (message === undefined) return this.result();
      const answer = await this.ask(this.last, message.text);
      if (!answer.ok) return this.result(answer.error);
      this.raws.push(answer.value);
      if (message.continuation) this.takeContinuation(answer.value);
      else this.take(answer.value);
    }
  }

  private take(text: string): void {
    this.text = text;
    this.last = text;
    this.read = parseCardsLenient(text);
    this.drafts = mergeDrafts(this.drafts, this.read.drafts);
  }

  /** The answer after a continuation is the earlier text with the new fragment joined to it. */
  private takeContinuation(fragment: string): void {
    this.text = `${this.text}${fragment}`;
    this.last = fragment;
    this.read = parseCardsLenient(this.text);
    this.drafts = mergeDrafts(this.drafts, this.read.drafts);
  }

  /** The next follow-up, or undefined when the answer is clean or the follow-ups are used up. */
  private nextMessage(): { text: string; continuation: boolean } | undefined {
    if (this.read.problems.length === 0) return undefined;
    if (this.read.cutOff && this.continuations < maxContinuations) {
      this.continuations += 1;
      return { text: this.prompts.continue.text.trimEnd(), continuation: true };
    }
    if (this.repairs >= maxRepairs) return undefined;
    this.repairs += 1;
    const text = renderRepairRequest(this.prompts.repair.text, this.read.problems).trimEnd();
    return { text, continuation: false };
  }

  private result(stopped?: AgentTaskEnd): CollectedAnswer {
    const { drafts, read } = this;
    return {
      drafts,
      problems: read.problems,
      rawOutputs: this.raws,
      ...(stopped === undefined ? {} : { stopped }),
    };
  }
}

// RF-208
export function collectCards(
  first: string,
  ask: AskModel,
  prompts: ReaderPrompts,
): Promise<CollectedAnswer> {
  return new Collector(ask, prompts).collect(first);
}
