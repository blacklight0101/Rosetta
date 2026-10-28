import type { CardDraft } from '../../domain/cards/card-ids.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { asCardList, cardItems } from './card-items.js';
import { agentCardsSchema, missingSuggestedAnswers } from './card-schema.js';
import { cardLimits } from './card-limits.js';
import { searchJson, type JsonSearch } from './extract-json.js';
import { readCard } from './lenient-cards.js';
import type { OutputProblem } from './output-problem.js';
import { mapRowCitations, type RowIndex } from './row-citations.js';

// RF-202, RF-208: parses an agent's final answer into card drafts. The JSON is taken out of prose
// or a code fence; the valid cards and claims are kept and the invalid ones are dropped and listed
// with their problems, so one formatting slip no longer costs the whole area. What happens after
// that (repairs, continuation, retry) belongs to the agent loop and the orchestrator.

const noJson: OutputProblem = {
  path: '',
  message: 'No JSON found in the answer. Reply with one JSON object {"cards": [ ... ]}.',
};

const cutOff: OutputProblem = {
  path: '',
  message:
    'The JSON in the answer is cut off or not valid JSON. Reply with one complete JSON object {"cards": [ ... ]}, shorter if needed.',
};

const capped: OutputProblem = {
  path: '',
  message: `The answer has many code blocks or JSON-like parts and only the first ${String(cardLimits.maxJsonCandidates)} were checked. Reply with one JSON object {"cards": [ ... ]} and nothing else.`,
};

const tooLong: OutputProblem = {
  path: '',
  message: `The answer is larger than the limit of ${String(cardLimits.maxOutputChars)} characters.`,
};

const tooMany: OutputProblem = {
  path: `cards.${String(cardLimits.maxCards)}`,
  message: `Only the first ${String(cardLimits.maxCards)} cards are used; send the rest in a separate answer.`,
};

function bounded(problems: readonly OutputProblem[]): readonly OutputProblem[] {
  return problems.slice(0, cardLimits.maxProblems).map((problem) => ({
    path: problem.path,
    message: problem.message.slice(0, cardLimits.maxProblemChars),
  }));
}

/** RF-645: `required` for the card format that asks for suggested answers (v3 on). */
export interface ParseOptions {
  readonly suggestedAnswers?: 'required' | 'optional';
}

/** What one answer gave: the cards that are valid and why the rest was dropped. */
export interface CardParse {
  readonly drafts: readonly CardDraft[];
  /** Empty when the whole answer was valid; otherwise what was dropped, or why nothing was found. */
  readonly problems: readonly OutputProblem[];
  /** No card was found and the answer ends inside JSON it started: ask it to continue (RF-208). */
  readonly cutOff: boolean;
}

function strictProblems(value: unknown): readonly OutputProblem[] {
  const parsed = agentCardsSchema.safeParse(asCardList(value));
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

/** RF-645: an OQ card of the format that asks for suggested answers is refused without them. */
function lacksAnswers(draft: CardDraft, options: ParseOptions): boolean {
  return (
    options.suggestedAnswers === 'required' &&
    draft.type === 'OQ' &&
    draft.suggestedAnswers === undefined
  );
}

function readValue(
  value: unknown,
  rows: RowIndex,
  options: ParseOptions,
): Pick<CardParse, 'drafts' | 'problems'> {
  const items = cardItems(value);
  if (items === undefined) return { drafts: [], problems: strictProblems(value) };
  const drafts: CardDraft[] = [];
  const problems: OutputProblem[] = items.length > cardLimits.maxCards ? [tooMany] : [];
  items.slice(0, cardLimits.maxCards).forEach((item, index) => {
    const card = readCard(mapRowCitations(item, rows), index);
    if (card.draft !== undefined && lacksAnswers(card.draft, options)) {
      problems.push({
        path: `cards.${String(index)}.suggestedAnswers`,
        message: missingSuggestedAnswers,
      });
    } else if (card.draft !== undefined) drafts.push(card.draft);
    problems.push(...card.problems);
  });
  return { drafts, problems };
}

/** A value that is a card list with nothing wrong in it, even an empty list. */
function isClean(read: Pick<CardParse, 'drafts' | 'problems'>): boolean {
  return read.problems.length === 0;
}

/** The best of the JSON values of an answer: a clean one first, else the one with most cards. */
function bestRead(
  values: readonly unknown[],
  rows: RowIndex,
  options: ParseOptions,
): Pick<CardParse, 'drafts' | 'problems'> | undefined {
  let best: Pick<CardParse, 'drafts' | 'problems'> | undefined;
  for (const value of values) {
    const read = readValue(value, rows, options);
    if (isClean(read)) return read;
    if (best === undefined || read.drafts.length > best.drafts.length) best = read;
  }
  return best;
}

/** No card was found: the answer was cut off, held too much to search, or held no JSON of cards. */
function nothingFound(search: JsonSearch, found: readonly OutputProblem[]): CardParse {
  if (search.capped) return { drafts: [], problems: bounded([capped, ...found]), cutOff: false };
  if (search.truncated) return { drafts: [], problems: [cutOff], cutOff: search.unclosed };
  return { drafts: [], problems: bounded(found.length > 0 ? found : [noJson]), cutOff: false };
}

/**
 * `rows` holds the row spans of the rendered workbook files the answer cites by row (RF-202,
 * Q-47); a citation like `values.md:R8` is read as the lines of that row.
 */
// RF-208
export function parseCardsLenient(
  raw: string,
  rows: RowIndex = new Map(),
  options: ParseOptions = {},
): CardParse {
  if (raw.length > cardLimits.maxOutputChars) {
    return { drafts: [], problems: [tooLong], cutOff: false };
  }
  const search = searchJson(raw);
  const best = bestRead(search.values, rows, options);
  if (best !== undefined && (best.drafts.length > 0 || isClean(best))) {
    return { ...best, problems: bounded(best.problems), cutOff: false };
  }
  return nothingFound(search, best?.problems ?? []);
}

/** Strict reading, for the answers that must be entirely valid: every card and claim, or why not. */
export function parseCardOutput(
  raw: string,
): Result<readonly CardDraft[], readonly OutputProblem[]> {
  const parsed = parseCardsLenient(raw);
  return parsed.problems.length === 0 ? ok(parsed.drafts) : err(parsed.problems);
}
