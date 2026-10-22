import type { CardDraft } from '../../domain/cards/card-ids.js';
import type { Result } from '../../domain/errors/result.js';
import type { AgentTaskEnd } from './agent-task-result.js';
import { readCutCards } from '../cards/cut-cards.js';
import { parseCardsLenient, type CardParse } from '../cards/parse-cards.js';
import type { OutputProblem } from '../cards/output-problem.js';
import { renderRepairRequest } from '../cards/repair-request.js';
import { loadRowIndex, type RowLookup } from '../cards/row-citations.js';
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
  /** Q-55: the answer ended cut off, so its complete cards were kept and the cut one dropped. */
  readonly cutKept?: true;
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
  private readonly rows: RowLookup;
  private drafts: readonly CardDraft[] = [];
  private readonly raws: string[] = [];
  private text = '';
  private last = '';
  private read: CardParse = { drafts: [], problems: [], cutOff: false };
  private repairs = 0;
  private continuations = 0;
  private cutKept = false;

  constructor(ask: AskModel, prompts: ReaderPrompts, rows: RowLookup) {
    this.ask = ask;
    this.prompts = prompts;
    this.rows = rows;
  }

  async collect(first: string): Promise<CollectedAnswer> {
    this.raws.push(first);
    await this.take(first);
    for (;;) {
      const message = this.nextMessage();
      if (message === undefined) return this.result();
      const answer = await this.ask(this.last, message.text);
      if (!answer.ok) return this.result(answer.error);
      this.raws.push(answer.value);
      // P3-104: a repair that gives back the same answer cannot fix it; the readable cards are
      // kept, the unreadable ones stay listed in the problems, and no further repair is sent.
      const answered = answer.value.trim();
      const same = !message.continuation && answered !== '' && answered === this.last.trim();
      if (message.continuation) await this.takeContinuation(answer.value);
      else await this.take(answer.value);
      if (same) return this.result();
    }
  }

  private async take(text: string): Promise<void> {
    this.text = text;
    this.last = text;
    await this.readText();
  }

  /** The answer after a continuation is the earlier text with the new fragment joined to it. */
  private async takeContinuation(fragment: string): Promise<void> {
    this.text = `${this.text}${fragment}`;
    this.last = fragment;
    await this.readText();
  }

  /** RF-202: row citations are read as the lines of their rows before the cards are checked. */
  private async readText(): Promise<void> {
    const rows = await loadRowIndex(this.text, this.rows);
    this.read = parseCardsLenient(this.text, rows);
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

  /**
   * Q-55: an answer still cut off when the follow-ups end (none could be asked, or the
   * continuations did not finish it) keeps the cards finished before the cut.
   */
  private async keepFinishedCards(): Promise<void> {
    if (!this.read.cutOff) return;
    const rows = await loadRowIndex(this.text, this.rows);
    const kept = readCutCards(this.text, rows);
    if (kept === undefined) return;
    this.read = kept;
    this.drafts = mergeDrafts(this.drafts, kept.drafts);
    this.cutKept = true;
  }

  private async result(stopped?: AgentTaskEnd): Promise<CollectedAnswer> {
    await this.keepFinishedCards();
    const { drafts, read } = this;
    return {
      drafts,
      problems: read.problems,
      rawOutputs: this.raws,
      ...(stopped === undefined ? {} : { stopped }),
      ...(this.cutKept ? { cutKept: true as const } : {}),
    };
  }
}

// RF-208
export function collectCards(
  first: string,
  ask: AskModel,
  prompts: ReaderPrompts,
  rows: RowLookup,
): Promise<CollectedAnswer> {
  return new Collector(ask, prompts, rows).collect(first);
}
