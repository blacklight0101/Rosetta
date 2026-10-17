import { z } from 'zod';
import { CARD_TYPES } from '../../domain/cards/card-vocabulary.js';
import {
  OVERVIEW_SECTIONS,
  OVERVIEW_STATES,
  type Overview,
} from '../../domain/overview/overview.js';
import { cardLimits } from '../cards/card-limits.js';

// RF-264, data-model.md section 3.8a: `overview.json`, the overview of a run as data. The page, the
// report and the specification all read it, so none of them parses Markdown back. The text of the
// file is bounded when it is read, like every file a model had a hand in.

const MAX_STATEMENTS = 50;
const MAX_LINES = 200;
const MAX_LINE_CHARS = 1000;
const MAX_FILE_CHARS = 1_000_000;

const ref = z.object({ id: z.string().min(1).max(40), type: z.enum(CARD_TYPES) });
const statement = z.object({
  text: z.string().min(1).max(cardLimits.maxClaimChars),
  cards: z.array(ref).min(1).max(cardLimits.maxCards),
});
const section = z.object({
  id: z.enum(OVERVIEW_SECTIONS),
  statements: z.array(statement).min(1).max(MAX_STATEMENTS),
});

const fileSchema = z.object({
  schemaVersion: z.literal(1),
  state: z.enum(OVERVIEW_STATES),
  notice: z.string().max(MAX_LINE_CHARS).optional(),
  sections: z.array(section).max(OVERVIEW_SECTIONS.length),
  notCovered: z.array(z.string().max(MAX_LINE_CHARS)).max(MAX_LINES),
  questions: z
    .array(z.object({ cardId: z.string().min(1).max(40), section: z.enum(OVERVIEW_SECTIONS) }))
    .max(cardLimits.maxCards),
});

/** The text of `overview.json`; keys in a fixed order. */
// RF-264
export function serialiseOverview(overview: Overview): string {
  const { state, notice, sections, notCovered, questions } = overview;
  const body = {
    schemaVersion: 1,
    state,
    ...(notice === undefined ? {} : { notice }),
    sections,
    notCovered,
    questions,
  };
  return `${JSON.stringify(body, null, 2)}\n`;
}

/** The overview of an `overview.json` text; undefined when the text is missing or not that file. */
// RF-264
export function parseOverview(text: string | undefined): Overview | undefined {
  if (text === undefined || text.length > MAX_FILE_CHARS) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    // A torn or foreign file is no overview: the page and the report then show none.
    return undefined;
  }
  const parsed = fileSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const { state, notice, sections, notCovered, questions } = parsed.data;
  const base = { state, sections, notCovered, questions };
  return notice === undefined ? base : { ...base, notice };
}
