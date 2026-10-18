import type { HandoffPackage, IncompleteDocument } from '../../application/plan/handoff-package.js';
import { documentSet, handoffFiles } from './handoff-links.js';

// RF-604: a document whose planner answer stayed cut off at the output limit is kept, its file
// opens with an Incomplete notice that names the limit and the setting to raise, and the README
// lists it. The notice holds only the code's own words and the limit: no model text. A package with
// no cut-off document gets no notice and no README section, so its files stay as they were.

const fileOf: Readonly<Record<IncompleteDocument['document'], string>> = {
  prd: handoffFiles.prd,
  dataModel: handoffFiles.dataModel,
  flows: handoffFiles.flows,
  apiContract: handoffFiles.apiContract,
  ux: handoffFiles.ux,
};

const explanation = (document: IncompleteDocument): string =>
  `The planner answer for this document was cut off at ${String(document.outputTokens)} output tokens, even after its continuations. The text below is what the planner wrote before the cut. To complete it, raise Project settings > Planner max output tokens and plan again.`;

/** The notice a file opens with, or '' when its document was not cut off. YAML gets a comment. */
// RF-604
export function incompleteNotice(handoff: HandoffPackage, path: string): string {
  const found = handoff.incomplete.find((each) => fileOf[each.document] === path);
  if (found === undefined) return '';
  return path.endsWith('.yaml')
    ? `# Incomplete. ${explanation(found)}\n`
    : `> **Incomplete.** ${explanation(found)}\n\n`;
}

/** Whether the document's file is written in the package. */
function writtenOf(handoff: HandoffPackage, document: IncompleteDocument['document']): boolean {
  return document !== 'apiContract' || handoff.apiContract.kind === 'openapi';
}

function listed(handoff: HandoffPackage, each: IncompleteDocument): string {
  const file = fileOf[each.document];
  const title = documentSet.find((document) => document.file === file)?.title ?? file;
  const cut = `cut off at ${String(each.outputTokens)} output tokens`;
  if (!writtenOf(handoff, each.document)) return `${title} (${cut}; no file was written)`;
  return `[${title}](${file}) (${cut})`;
}

/** The README section that lists the cut-off documents; no lines when none was cut off. */
// RF-604
export function incompleteLines(handoff: HandoffPackage): string[] {
  if (handoff.incomplete.length === 0) return [];
  return [
    '## Incomplete documents',
    '',
    'The planner answer for each document below stayed cut off at its output limit, even after its continuations. A document that is written opens with an Incomplete notice. Raise Project settings > Planner max output tokens and plan again to complete them.',
    '',
    ...handoff.incomplete.map((each) => `- ${listed(handoff, each)}`),
    '',
  ];
}
