import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';

// RF-623, P9-15, EV-108: checks.md names each stored structure a decision record needs that the
// target data model lacks, by record and structure, and says when the check could not run. None of
// it fails the run. The record titles, the structures and the reasons are model text and go through
// the escaper; the sentences are Rosetta's. A check that found nothing, or was not asked, has no
// section.

const HEADING = '## Data model against the decisions';

function droppedLine(dropped: number): string[] {
  if (dropped === 0) return [];
  const one = dropped === 1;
  return [
    `${String(dropped)} structure${one ? '' : 's'} of the answer ${one ? 'was' : 'were'} left out: ${one ? 'it names' : 'each names'} a table the model has, a record the check was not sent, or a structure already listed.`,
    '',
  ];
}

// RF-623
export function adrModelCheckLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const check = handoff.adrModelCheck;
  if (check === undefined) return [];
  if (check.kind === 'not-run') {
    return [
      HEADING,
      '',
      `The check of the data model against the decision records could not run: ${esc.inline(check.reason)}. The records were not checked; read them against \`data-model.md\` before the migrations are written.`,
      '',
    ];
  }
  if (check.findings.length === 0) return [];
  return [
    HEADING,
    '',
    'Each decision record below needs a stored structure that the target data model does not have, as the planner read the record against the model. The plan is not failed for it; add the structure to the model, or change the record.',
    '',
    ...check.findings.map(
      (each) =>
        `- ${esc.inline(each.decision)} (${esc.inline(each.title)}): ${esc.inline(each.structure)}. ${esc.inline(each.reason)}`,
    ),
    '',
    ...droppedLine(check.dropped),
  ];
}
