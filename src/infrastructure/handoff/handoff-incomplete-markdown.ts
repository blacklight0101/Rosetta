import type { HandoffPackage, IncompleteDocument } from '../../application/plan/handoff-package.js';
import { documentSet, handoffFiles } from './handoff-links.js';

// RF-604: a document whose planner answer stayed cut off at the output limit is kept, its file
// opens with an Incomplete notice that names the limit and the setting to raise, and the README
// lists it. The notice holds only the code's own words and the limit: no model text. A package with
// no cut-off document gets no notice and no README section, so its files stay as they were.

type Kind = IncompleteDocument['document'];

/** The index file of each kind: the README entry links it, and it is written when the kind is. */
const fileOf: Readonly<Record<Kind, string>> = {
  prd: handoffFiles.prd,
  dataModel: handoffFiles.dataModel,
  flows: handoffFiles.flows,
  apiContract: handoffFiles.apiContract,
  ux: handoffFiles.ux,
};

const explanation = (document: IncompleteDocument): string =>
  `The planner answer for this document was cut off at ${String(document.outputTokens)} output tokens, even after its continuations. The text below is what the planner wrote before the cut. To complete it, raise Project settings > Planner max output tokens and plan again.`;

/**
 * The document a file of the package belongs to. Every per-flow file and the flows index come from
 * the flows answer; the design brief and the wireframes from the user-interface answer.
 */
function kindOf(path: string): Kind | undefined {
  if (path === handoffFiles.prd) return 'prd';
  if (path === handoffFiles.dataModel) return 'dataModel';
  if (path === handoffFiles.apiContract) return 'apiContract';
  if (path.startsWith('flows/')) return 'flows';
  if (path.startsWith('ux/')) return 'ux';
  return undefined;
}

/** The notice in the file's own syntax: a YAML comment, an HTML comment or a Markdown quote. */
function noticeOf(path: string, text: string): string {
  if (path.endsWith('.yaml')) return `# Incomplete. ${text}\n`;
  if (path.endsWith('.html')) return `<!-- Incomplete. ${text} -->\n`;
  return `> **Incomplete.** ${text}\n\n`;
}

/** The notice a file opens with, or '' when its document was not cut off. */
// RF-604
export function incompleteNotice(handoff: HandoffPackage, path: string): string {
  const kind = kindOf(path);
  const found = handoff.incomplete.find((each) => each.document === kind);
  if (found === undefined) return '';
  return noticeOf(path, explanation(found));
}

/**
 * RF-604: the API contract section's notice when its answer was cut off and no contract file was
 * written, since that section then holds the only place the document can be named.
 */
export function incompleteApiLines(handoff: HandoffPackage): string[] {
  const found = handoff.incomplete.find((each) => each.document === 'apiContract');
  if (found === undefined || handoff.apiContract.kind === 'openapi') return [];
  return [`> **Incomplete.** ${explanation(found)}`, ''];
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
