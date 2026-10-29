import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import { brokenRuleReason, styleRoles } from '../../domain/planning/style-rules.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import { checkReference } from '../../domain/planning/typed-answers.js';
import { handoffFiles } from './handoff-links.js';
import { hasOwnAnswer } from './handoff-own-answers-markdown.js';

// RF-608, RF-507, DEC-76: what the package says about its components and the chosen style. The
// section of checks.md lists each dependency that breaks the rule of the style and each component
// whose role is not a role of the style. Component names and roles are model text and go through
// the escaper; the rules, the roles of the styles and the sentences are Rosetta's.

/** Whether a rule of the style is broken, so the architecture file cannot say the components follow it. */
export function followsStyle(handoff: HandoffPackage): boolean {
  return handoff.styleCheck.broken.length === 0;
}

function brokenLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const { broken } = handoff.styleCheck;
  if (broken.length === 0) return ['No dependency breaks the rule of the style.', ''];
  return [
    `${String(broken.length)} ${broken.length === 1 ? 'dependency breaks' : 'dependencies break'} the rule of the style; each is also a risk in [the risks](${handoffFiles.risks}).`,
    '',
    '| Component | Depends on | Why it breaks the rule |',
    '|---|---|---|',
    ...broken.map(
      (each) =>
        `| ${esc.inline(each.from)} | ${esc.inline(each.to)} | ${brokenRuleReason(each.rule)} |`,
    ),
    '',
  ];
}

function unknownLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const { unknownRole } = handoff.styleCheck;
  if (unknownRole.length === 0) return [];
  return [
    'These components have no role of the style, so Rosetta did not judge their dependencies and did not guess a role:',
    '',
    '| Component | Role the planner wrote |',
    '|---|---|',
    ...unknownRole.map(
      (each) =>
        `| ${esc.inline(each.name)} | ${each.role === '' ? 'none' : esc.inline(each.role)} |`,
    ),
    '',
  ];
}

// RF-608
export function styleLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  if (handoff.content.components.length === 0) return [];
  const roles = styleRoles[handoff.brief.architecture.style].join(', ');
  // DEC-184: with an own answer the style is only the reference of the checks.
  const reference = hasOwnAnswer(handoff, 'architecture') ? `, ${checkReference},` : ',';
  return [
    '## Components against the style',
    '',
    `Each component has a role in the ${esc.inline(handoff.style.title)} style (${roles})${reference} and the dependencies between components are checked against the rule of the style: ${esc.inline(handoff.style.rule)}`,
    '',
    ...brokenLines(handoff, esc),
    ...unknownLines(handoff, esc),
  ];
}
