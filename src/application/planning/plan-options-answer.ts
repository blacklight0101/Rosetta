import { z } from 'zod';
import type { OptionsDraft } from '../../domain/planning/plan-options.js';
import { cardLimits } from '../cards/card-limits.js';
import { searchJson } from '../cards/extract-json.js';

// RF-608, RF-609, ADR-013: the planner's answer is untrusted text. It is read as one object, fenced
// or inside prose like the readers' answers, with every list and text bounded; which styles and
// layers are acceptable, and which card ids exist, is decided by the domain, not here.

const MAX_NAME = 80;
const MAX_LIST = 10;
const MAX_STYLES = 6;
const MAX_LAYERS = 30;
const MAX_OPTIONS = 6;
const MAX_OPTION_TEXT = 500;

const text = z.string().max(cardLimits.maxSummaryChars);

const style = z.object({
  style: z.string().max(MAX_NAME),
  strengths: z.array(text).max(MAX_LIST),
  costs: z.array(text).max(MAX_LIST),
  evidence: z.array(z.string().max(cardLimits.maxPathChars)).max(cardLimits.maxCards),
});

const layer = z.object({
  layer: z.string().max(MAX_NAME),
  options: z.array(z.string().max(MAX_OPTION_TEXT)).max(MAX_OPTIONS),
});

const answer = z.object({
  architecture: z.object({
    recommended: z.string().max(MAX_NAME),
    options: z.array(style).max(MAX_STYLES),
  }),
  stack: z.array(layer).max(MAX_LAYERS),
});

/** The draft of the answer, or undefined when the answer holds no object of that shape. */
// RF-608, RF-609
export function parsePlanOptionsAnswer(output: string): OptionsDraft | undefined {
  for (const value of searchJson(output.slice(0, cardLimits.maxOutputChars)).values) {
    const parsed = answer.safeParse(value);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}
