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
const denylistWords = /\b(?:block ?list|black ?list|deny ?list)\b/iu;

function readsLikeDenylist(control: PlanControl): boolean {
  return (
    control.approach === 'other' && denylistWords.test(`${control.name} ${control.description}`)
  );
}

const signInWords = /\b(?:sign[\s-]?in|log[\s-]?in|authenticat\w*|password\w*)\b/iu;
const secretWords = /\b(?:secrets?|credentials?|api keys?|connection strings?|tokens?)\b/iu;

/**
 * RF-648, RF-649: for a workbook, a control that works by "other" and is about signing in or about
 * secrets names the owner's answer, which the code could not show.
 */
function workbookApproach(control: PlanControl, handoff: HandoffPackage): string | undefined {
  const { workbook } = handoff;
  if (workbook === undefined || control.approach !== 'other') return undefined;
  const text = `${control.name} ${control.description}`;
  if (signInWords.test(text)) return workbook.signIn.words;
  return secretWords.test(text) ? workbook.secrets.words : undefined;
}

function approachLine(control: PlanControl, handoff: HandoffPackage, esc: MarkdownEscaper): string {
  const owner = workbookApproach(control, handoff);
  if (owner !== undefined) return `Approach: ${esc.inline(owner)}.`;
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

function controlLines(
  control: PlanControl,
  handoff: HandoffPackage,
  esc: MarkdownEscaper,
): string[] {
  const decision = control.decision === '' ? 'none' : decisionLink(control.decision);
  return [
    `### ${esc.inline(control.name)}`,
    '',
    approachLine(control, handoff, esc),
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

/** RF-648, RF-649: the owner's sign-in and secrets store of a workbook, with their records. */
function workbookLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const { workbook } = handoff;
  if (workbook === undefined) return [];
  const record = (id: string | undefined): string =>
    id === undefined || id === '' ? '' : ` (decision ${decisionLink(id)})`;
  const mark = (defaulted: boolean): string => (defaulted ? ' (default, to be confirmed)' : '');
  return [
    `Sign-in: ${esc.inline(workbook.signIn.words)}${mark(workbook.signIn.defaulted)}${record(handoff.choices.signIn)}`,
    '',
    `Secrets store: ${esc.inline(workbook.secrets.words)}${mark(workbook.secrets.defaulted)}${record(handoff.choices.secrets)}`,
    '',
  ];
}

/** The body of the security section, after its decision-records line. */
// RF-622
export function securityLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const { security } = handoff.content.technical;
  return [
    ...workbookLines(handoff, esc),
    ...practiceLines(handoff, esc),
    ...(security.length === 0
      ? ['No security control was planned.', '']
      : security.flatMap((control) => controlLines(control, handoff, esc))),
  ];
}
