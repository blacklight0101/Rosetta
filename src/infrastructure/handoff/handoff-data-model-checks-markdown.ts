import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';

// P7-13, RF-623, RF-627, EV-74: the checks of the data model the package keeps, in their own section
// of checks.md, apart from "Left out", which lists only what the model dropped. The item is a name
// from the planner's answer (or a card id) and goes through the escaper; the field and the reason
// are the plan's own words, never a sentence of the answer.

/** The rows of the data model that are checks of a part the model keeps. */
export function isDataModelCheck(item: HandoffPackage['leftOut'][number]): boolean {
  return item.kind === 'check';
}

// RF-627
export function dataModelCheckLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const checks = handoff.leftOut.filter(isDataModelCheck);
  if (checks.length === 0) return [];
  return [
    '## Data model',
    '',
    'The model keeps every part listed here. Each is a check to settle before the first migration is written; the package is written either way.',
    '',
    ...checks.map(
      (each) => `- ${esc.code(each.item)} (${esc.inline(each.field)}): ${esc.inline(each.reason)}`,
    ),
    '',
  ];
}
