import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import { MAX_FINDINGS } from '../../domain/planning/claim-meaning.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';

// P5-43, RF-602, RF-507: the section of checks.md on the meaning of the source claims. Where a
// statement sits and the roles and values are plan text and go through the escaper; the labels of the
// sides are Rosetta's own words from the catalogue. Each list stops at a bound and says how many it left out.

function bounded<T>(items: readonly T[], line: (item: T) => string): string[] {
  const shown = items.slice(0, MAX_FINDINGS).map((item) => `- ${line(item)}`);
  const more = items.length - shown.length;
  return more > 0 ? [...shown, `- ${String(more)} more not listed.`] : shown;
}

// RF-602
export function meaningLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const meaning = handoff.meaning;
  if (meaning === undefined) return [];
  const parts = [
    {
      title: 'Verbs that contradict the claim',
      about:
        'The statement takes one side of a pair of opposite verbs, and a linked Supported claim on the same topic takes the other. Check the statement against the claim before the team builds from it.',
      lines: bounded(
        meaning.contradictions,
        (each) =>
          `${esc.inline(each.where)}: the statement says it ${each.statement}; ${esc.inline(each.claimId)} says it ${each.claim}.`,
      ),
    },
    {
      title: 'Values no linked claim states',
      about:
        'A number or a quoted text of the statement appears in none of the claims of its source cards.',
      lines: bounded(
        meaning.unstatedValues,
        (each) => `${esc.inline(each.where)}: "${esc.inline(each.value)}"`,
      ),
    },
    {
      title: 'Roles no claim states',
      about:
        'The product requirements document marks these roles as proposed; a statement that names one is listed with it.',
      lines: bounded(
        meaning.unstatedRoles,
        (each) => `${esc.inline(each.where)}: ${esc.inline(each.role)}`,
      ),
    },
    {
      title: 'Documentation claims overruled by the code',
      about:
        'A claim that cites only documentation said the opposite of a claim that cites other files. The code claim is used; the documentation claim is not in the package.',
      lines: bounded(
        meaning.overruled,
        (each) =>
          `${esc.inline(each.documentClaimId)} (${each.document}) overruled by ${esc.inline(each.codeClaimId)} (${each.code}).`,
      ),
    },
  ].filter((part) => part.lines.length > 0);
  if (parts.length === 0) return [];
  return [
    '## Meaning of the source claims',
    '',
    ...parts.flatMap((part) => [`### ${part.title}`, '', part.about, '', ...part.lines, '']),
  ];
}
