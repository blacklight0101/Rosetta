import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import type { PlanControl } from '../../domain/planning/technical-content.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import { decisionLink, sourceLinks } from './handoff-links.js';

// RF-622, DEC-135: the security controls of the technical requirements document. A control that
// works by listing forbidden patterns (a denylist) is named as one, with the invariant it must
// keep and a recommendation of an allowlist, or of a rule that does not depend on the shape of the
// input, where one exists: a list of forbidden patterns fails open on every form it did not list.
// Only a control the planner marked as a denylist gets that wording.

const NO_INVARIANT = 'Not stated; define what must always hold before building.';
const DEFAULT_RECOMMENDATION =
  'Prefer an allowlist of what is permitted, or a rule that does not depend on the shape of the input, where one exists.';

/**
 * A control the planner did not mark as a denylist can still read like one. This short word list
 * is only a fallback for the recommendation; the label and the denylist wording stay the planner's.
 */
const denylistWords =
  /block ?list|black ?list|deny ?list|forbidden|blocked|blocks the|rejects .* list/iu;

function readsLikeDenylist(control: PlanControl): boolean {
  return (
    control.approach === 'other' && denylistWords.test(`${control.name} ${control.description}`)
  );
}

function approachLine(control: PlanControl): string {
  return control.approach === 'denylist'
    ? 'Approach: denylist. It works by listing forbidden patterns.'
    : `Approach: ${control.approach}.`;
}

function guardLines(control: PlanControl, esc: MarkdownEscaper): string[] {
  const { invariant, alternative } = control;
  if (control.approach !== 'denylist') {
    const fallback = alternative === '' && readsLikeDenylist(control);
    return [
      ...(invariant === '' ? [] : [`Invariant: ${esc.inline(invariant)}`, '']),
      ...(alternative === '' && !fallback
        ? []
        : [
            `Recommendation: ${alternative === '' ? DEFAULT_RECOMMENDATION : esc.inline(alternative)}`,
            '',
          ]),
    ];
  }
  return [
    `Invariant: ${invariant === '' ? NO_INVARIANT : esc.inline(invariant)}`,
    '',
    `Recommendation: ${alternative === '' ? DEFAULT_RECOMMENDATION : esc.inline(alternative)}`,
    '',
  ];
}

function controlLines(control: PlanControl, esc: MarkdownEscaper): string[] {
  const decision = control.decision === '' ? 'none' : decisionLink(control.decision);
  return [
    `### ${esc.inline(control.name)}`,
    '',
    approachLine(control),
    '',
    esc.inline(control.description),
    '',
    ...guardLines(control, esc),
    `Source cards: ${sourceLinks(control.sources)}`,
    '',
    `Decision: ${decision}`,
    '',
  ];
}

/** The chosen security practices of the catalogue, each with its rule. */
function practiceLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const chosen = handoff.principles.filter((principle) => principle.group === 'security');
  if (chosen.length === 0) return [];
  return [
    'Security practices the owner chose:',
    '',
    ...chosen.map((each) => `- **${esc.inline(each.title)}**: ${esc.inline(each.rule)}`),
    '',
  ];
}

/** The body of the security section, after its decision-records line. */
// RF-622
export function securityLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const { security } = handoff.content.technical;
  return [
    ...practiceLines(handoff, esc),
    ...(security.length === 0
      ? ['No security control was planned.', '']
      : security.flatMap((control) => controlLines(control, esc))),
  ];
}
