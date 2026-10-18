import { z } from 'zod';
import type { FlowsDraft } from '../../domain/planning/target-flows.js';
import { cardLimits } from '../cards/card-limits.js';
import { searchJson } from '../cards/extract-json.js';

// RF-625, ADR-013: the planner's target flows are untrusted text. They are read as one JSON object
// (fenced or inside prose, like the other planner answers) with every list and text bounded; which
// cards, steps and components are allowed is decided by the domain (target-flows-assembly.ts),
// not here. A part the answer leaves out takes its empty value; an answer without a flow is no
// answer.

const MAX_FLOWS = 200;
const MAX_STEPS = 200;
const ID = 40;
const NAME = 200;
const TEXT = 2000;

const optionalText = z.string().trim().max(TEXT).default('');

const step = z.object({
  claim: z.string().trim().min(1).max(ID),
  component: z.string().trim().min(1).max(NAME),
  action: optionalText,
});

const flow = z.object({
  card: z.string().trim().min(1).max(ID),
  inScope: z.boolean(),
  reason: optionalText,
  steps: z.array(step).max(MAX_STEPS).default([]),
});

const answer = z.object({ flows: z.array(flow).min(1).max(MAX_FLOWS) });

/** The draft of the answer, or undefined when no JSON object of the answer reads as flows. */
// RF-625
export function parseFlowsAnswer(output: string): FlowsDraft | undefined {
  for (const value of searchJson(output.slice(0, cardLimits.maxOutputChars)).values) {
    const parsed = answer.safeParse(value);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}
