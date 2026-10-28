import type { CardDraft } from '../../domain/cards/card-ids.js';
import type { Result } from '../../domain/errors/result.js';
import { isCutAnswer, joinFragment, type AnswerText } from './cut-answer.js';
import type { AgentTaskEnd } from './agent-task-result.js';
import { readCutCards } from '../cards/cut-cards.js';
import { parseCardsLenient, type CardParse, type ParseOptions } from '../cards/parse-cards.js';
import type { OutputProblem } from '../cards/output-problem.js';
import { valuesOnlyRuleProblems } from '../cards/rule-citations.js';
import { renderRepairRequest } from '../cards/repair-request.js';
import { loadRowIndex, type RowLookup } from '../cards/row-citations.js';
import { asksSuggestedAnswers, type ReaderPrompts } from './reader-prompts.js';

// RF-202, RF-208: what an agent's final answer is worth, with the follow-ups it earns. The first
// answer is read leniently (valid cards and claims are kept, the rest is listed). Problems earn up
// to two targeted repairs, each asking only about what is still wrong; an answer that is cut off
// (the provider says `length`, or its JSON never closes) earns one continuation instead of a new
// start (P5-03); a second cut goes to the repairs. Every follow-up is one more model turn, so
// the turn limit, the context share, a stop and the caps apply to it like to any other turn.

/** Repairs after the first answer: the second one gets only the problems that remain. */
const maxRepairs = 2;
/** Continuations of an answer cut off by the output limit. */
const maxContinuations = 1;

/** Sends a follow-up message after the model's previous text; the answer, or why no turn could run. */
export type AskModel = (
  previous: string,
  message: string,
) => Promise<Result<AnswerText, AgentTaskEnd>>;

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
  asked: ReadonlySet<string> = new Set(),
): readonly CardDraft[] {
  const merged = [...earlier];
  for (const draft of later) {
    const at = merged.findIndex((each) => keyOf(each) === keyOf(draft));
    // P3-105: a card the repair asked about is replaced by the answer, even with fewer claims.
    if (at < 0) merged.push(draft);
    else if (asked.has(keyOf(draft)) || draft.claims.length >= (merged[at]?.claims.length ?? 0)) {
      merged[at] = draft;
    }
  }
  return merged;
}

class Collector {
  private readonly ask: AskModel;
  private readonly prompts: ReaderPrompts;
  private readonly rows: RowLookup;
  private readonly workbookFolders: readonly string[];
  private drafts: readonly CardDraft[] = [];
  private readonly raws: string[] = [];
  private text = '';
  private last = '';
  private read: CardParse = { drafts: [], problems: [], cutOff: false };
  private repairs = 0;
  private continuations = 0;
  private cutKept = false;
  /** P5-03: the latest answer was cut off at the output limit (stop reason or unclosed JSON). */
  private cut = false;
  /** P3-105: the rule citations were asked about once; the cards asked about, until the answer. */
  private ruleAsked = false;
  private asked: ReadonlySet<string> = new Set();

  constructor(
    ask: AskModel,
    prompts: ReaderPrompts,
    rows: RowLookup,
    workbookFolders: readonly string[],
  ) {
    this.workbookFolders = workbookFolders;
    this.ask = ask;
    this.prompts = prompts;
    this.rows = rows;
  }

  async collect(first: AnswerText): Promise<CollectedAnswer> {
    this.raws.push(first.text);
    await this.take(first);
    for (;;) {
      const message = this.nextMessage();
      if (message === undefined) return this.result();
      const answer = await this.ask(this.last, message.text);
      if (!answer.ok) return this.result(answer.error);
      this.raws.push(answer.value.text);
      // P3-104: a repair that gives back the same answer cannot fix it; the readable cards are
      // kept, the unreadable ones stay listed in the problems, and no further repair is sent.
      const answered = answer.value.text.trim();
      const same = !message.continuation && answered !== '' && answered === this.last.trim();
      if (message.continuation) await this.takeContinuation(answer.value);
      else await this.take(answer.value);
      if (same) return this.result();
    }
  }

  private async take(answer: AnswerText): Promise<void> {
    this.text = answer.text;
    this.last = answer.text;
    await this.readText(answer);
  }

  /** The answer after a continuation is the earlier text with the new fragment joined to it. */
  private async takeContinuation(answer: AnswerText): Promise<void> {
    this.text = joinFragment(this.text, answer.text);
    this.last = answer.text;
    await this.readText(answer);
  }

  /** RF-202: row citations are read as the lines of their rows before the cards are checked. */
  private async readText(answer: AnswerText): Promise<void> {
    const rows = await loadRowIndex(this.text, this.rows);
    this.read = parseCardsLenient(this.text, rows, this.parseOptions());
    this.cut = isCutAnswer({ text: this.text, finishReason: answer.finishReason }, this.read);
    this.drafts = mergeDrafts(this.drafts, this.read.drafts, this.asked);
    this.asked = new Set();
  }

  /** RF-645: the card format from v3 requires suggested answers on OQ cards, whole or cut off. */
  private parseOptions(): ParseOptions {
    return {
      suggestedAnswers: asksSuggestedAnswers(this.prompts.cardFormat) ? 'required' : 'optional',
    };
  }

  /** The next follow-up, or undefined when the answer is clean or the follow-ups are used up. */
  private nextMessage(): { text: string; continuation: boolean } | undefined {
    const rules = this.ruleHints();
    if (this.read.problems.length === 0 && rules.length === 0 && !this.cut) return undefined;
    if (this.cut && this.continuations < maxContinuations) {
      this.continuations += 1;
      return { text: this.prompts.continue.text.trimEnd(), continuation: true };
    }
    if (this.repairs >= maxRepairs) return undefined;
    this.repairs += 1;
    const problems = [...this.read.problems, ...rules];
    const text = renderRepairRequest(this.prompts.repair.text, problems).trimEnd();
    return { text, continuation: false };
  }

  /**
   * P3-105: the rule claims that cite only values, the first time the answer is otherwise
   * readable or a repair is sent anyway; the cards they sit on are then replaced by the answer.
   */
  private ruleHints(): readonly OutputProblem[] {
    if (this.ruleAsked || this.cut || this.repairs >= maxRepairs) return [];
    const hints = valuesOnlyRuleProblems(this.read.drafts, this.workbookFolders);
    if (hints.length === 0) return [];
    const hinted = this.read.drafts.filter(
      (draft) => valuesOnlyRuleProblems([draft], this.workbookFolders).length > 0,
    );
    this.ruleAsked = true;
    this.asked = new Set(hinted.map(keyOf));
    return hints;
  }

  /**
   * Q-55: an answer still cut off when the follow-ups end (none could be asked, or the
   * continuations did not finish it) keeps the cards finished before the cut.
   */
  private async keepFinishedCards(): Promise<void> {
    if (!this.cut) return;
    const rows = await loadRowIndex(this.text, this.rows);
    const kept = readCutCards(this.text, rows, this.parseOptions());
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

/** What the answer's citations are read against: the row spans and the rendered workbook folders. */
interface CitationScope {
  readonly rows: RowLookup;
  readonly workbookFolders?: readonly string[] | undefined;
}

// RF-208
export function collectCards(
  first: AnswerText,
  ask: AskModel,
  prompts: ReaderPrompts,
  scope: CitationScope,
): Promise<CollectedAnswer> {
  return new Collector(ask, prompts, scope.rows, scope.workbookFolders ?? []).collect(first);
}
