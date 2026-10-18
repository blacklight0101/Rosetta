import { z } from 'zod';
import type { UxDraft } from '../../domain/planning/target-ux.js';
import { cardLimits } from '../cards/card-limits.js';
import { searchJson } from '../cards/extract-json.js';

// RF-626, ADR-013: the planner's screens are untrusted text. They are read as one JSON object
// (fenced or inside prose, like the other planner answers) with every list and text bounded; which
// cards are allowed, and what a wireframe lists, is decided by the domain (target-ux-assembly.ts),
// not here. A part the answer leaves out takes its empty value; an answer that neither plans a
// screen nor drops one is no answer.

const MAX_SCREENS = 200;
const MAX_CARDS = 100;
const MAX_COMPONENTS = 50;
const ID = 40;
const NAME = 200;
const TEXT = 2000;

const optionalText = z.string().trim().max(TEXT).default('');

const screen = z.object({
  name: z.string().trim().max(NAME).default(''),
  purpose: optionalText,
  reason: optionalText,
  cards: z.array(z.string().trim().min(1).max(ID)).min(1).max(MAX_CARDS),
});

const dropped = z.object({ card: z.string().trim().min(1).max(ID), reason: optionalText });

const designBrief = z
  .object({
    audience: optionalText,
    tone: optionalText,
    components: z.array(z.string().trim().max(NAME)).max(MAX_COMPONENTS).default([]),
  })
  .default({ audience: '', tone: '', components: [] });

const answer = z
  .object({
    screens: z.array(screen).max(MAX_SCREENS).default([]),
    dropped: z.array(dropped).max(MAX_SCREENS).default([]),
    designBrief,
  })
  .refine((value) => value.screens.length + value.dropped.length > 0);

/** The draft of the answer, or undefined when no JSON object of the answer reads as screens. */
// RF-626
export function parseUxAnswer(output: string): UxDraft | undefined {
  for (const value of searchJson(output.slice(0, cardLimits.maxOutputChars)).values) {
    const parsed = answer.safeParse(value);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}
