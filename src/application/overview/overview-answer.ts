import { z } from 'zod';
import { OVERVIEW_SECTIONS } from '../../domain/overview/overview.js';
import type { OverviewDraft } from '../../domain/overview/build-overview.js';
import { cardLimits } from '../cards/card-limits.js';
import { searchJson } from '../cards/extract-json.js';

// RF-264, ADR-013: the summariser's answer is untrusted text. It is read as one object with a list
// of statements per section (fenced or inside prose, like the readers' answers); which cards a
// statement may link is decided by the domain, not here. A section the answer leaves out is empty.

const MAX_STATEMENTS = 20;

const statement = z.object({
  text: z.string().max(cardLimits.maxSummaryChars),
  cards: z.array(z.string().max(cardLimits.maxPathChars)).max(cardLimits.maxCards),
});

const list = z.array(statement).max(MAX_STATEMENTS).default([]);

const answer = z.object({
  application: list,
  users: list,
  features: list,
  screens: list,
  data: list,
  integrations: list,
});

/** The draft of the answer, or undefined when the answer holds no object with a known section. */
// RF-264
export function parseOverviewAnswer(output: string): OverviewDraft | undefined {
  for (const value of searchJson(output.slice(0, cardLimits.maxOutputChars)).values) {
    const parsed = answer.safeParse(value);
    // `{}` or an object of other keys is not an answer: it is not taken for an empty overview.
    if (parsed.success && hasSection(value)) return parsed.data;
  }
  return undefined;
}

function hasSection(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    OVERVIEW_SECTIONS.some((id) => Object.hasOwn(value, id))
  );
}
