import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import {
  mustScreensOverCap,
  requirementsBuiltByNoCard,
  sourceCardsWithNoRequirement,
} from '../../domain/planning/coverage-checks.js';
import { checkFlowStyle } from '../../domain/planning/flow-style.js';
import { brokenRuleReason } from '../../domain/planning/style-rules.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';

// RF-627, RF-608, P5-40: the checks of checks.md that count what the package claims beyond the
// items: requirements no card lists, Must screens lost to the screen cap, source features no
// requirement cites, flows that break the style and phases whose name code replaced. Each section is
// written only when it has something to say. Titles and names are model text and go through the
// escaper; ids and sentences are Rosetta's.

function requirementLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const unbuilt = requirementsBuiltByNoCard(handoff.content);
  if (unbuilt.length === 0) return [];
  return [
    '## Requirements built by no card',
    '',
    'A task card lists the requirements it implements. No card lists these, so the package asks for nothing that builds them.',
    '',
    ...unbuilt.map((each) => `- ${each.id}: ${esc.inline(each.title)}`),
    '',
  ];
}

function screenLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const lost = mustScreensOverCap(handoff.ux.legacy, handoff.prd, handoff.content.requirements);
  if (lost.length === 0) return [];
  return [
    '## Must screens dropped over the cap',
    '',
    'These legacy screens are cited by a requirement of a Must feature, and no target screen replaces them only because the cap on screens was reached (Q-27).',
    '',
    ...lost.map((each) => `- ${esc.inline(each.cardId)}: ${esc.inline(each.title)}`),
    '',
  ];
}

function orphanLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const orphans = sourceCardsWithNoRequirement(handoff.sources, handoff.content.requirements);
  if (orphans.length === 0) return [];
  return [
    '## Source cards that reach no requirement',
    '',
    'These supported feature cards are cited by no requirement, so nothing in the plan carries what they found; the owner decides whether it is kept.',
    '',
    ...orphans.map((each) => `- ${esc.inline(each.id)}: ${esc.inline(each.title)}`),
    '',
  ];
}

function flowLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const { style } = handoff.brief.architecture;
  const broken = checkFlowStyle(style, handoff.content.components, handoff.flows.flows);
  if (broken.length === 0) return [];
  return [
    '## Flows against the style',
    '',
    `The rule of the style is also checked over the steps of each flow, in order. ${String(broken.length)} call${broken.length === 1 ? '' : 's'} break${broken.length === 1 ? 's' : ''} it.`,
    '',
    '| Flow | From | To | Why it breaks the rule |',
    '|---|---|---|---|',
    ...broken.map(
      (each) =>
        `| ${esc.inline(each.flow)} | ${esc.inline(each.from)} | ${esc.inline(each.to)} | ${brokenRuleReason(each.rule)} |`,
    ),
    '',
  ];
}

function phaseLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const notes = handoff.content.phaseNotes ?? [];
  if (notes.length === 0) return [];
  return [
    '## Phase titles',
    '',
    'A phase is titled from the cards it holds. The planner named these phases for other work, so the package renamed them; check the goal and exit criteria of each.',
    '',
    ...notes.map(
      (each) =>
        `- Phase ${String(each.phase)}: "${esc.inline(each.from)}" is now "${esc.inline(each.to)}"`,
    ),
    '',
  ];
}

// RF-627
export function truthfulCheckLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  return [
    ...requirementLines(handoff, esc),
    ...screenLines(handoff, esc),
    ...orphanLines(handoff, esc),
    ...flowLines(handoff, esc),
    ...phaseLines(handoff, esc),
  ];
}
