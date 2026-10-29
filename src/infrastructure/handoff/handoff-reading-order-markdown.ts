import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import { decisionFile, documentSet, handoffFiles } from './handoff-links.js';
import { writesAgentFolder } from './handoff-agents-folder.js';

// RF-620, RF-601, RF-640: the reading order of the README: AGENTS.md and orchestration.md first for
// an AI-assisted build, then the documentation set, then the parts of RF-601, each linking its file.

function decisionLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const { decisions } = handoff.content;
  if (decisions.length === 0) return ['   No decision record was written.'];
  return decisions.map(
    (decision) =>
      `   - [${decision.id}](${decisionFile(decision.id)}): ${esc.inline(decision.title)}`,
  );
}

/** The reading-order line of a document of the set; the API contract links its file only when there is one. */
function documentLine(
  document: (typeof documentSet)[number],
  handoff: HandoffPackage,
  esc: MarkdownEscaper,
): string {
  const { title, file } = document;
  const { apiContract } = handoff;
  if (file !== handoffFiles.apiContract || apiContract.kind === 'openapi') {
    return `[${title}](${file})`;
  }
  return `${title}: no contract applies. ${esc.inline(apiContract.reason)}`;
}

/** RF-620, RF-601: the documentation set first, then the parts of RF-601, each linking its file. */
export function readingOrder(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const entries = [
    ...(handoff.brief.buildMethod.aiAssisted
      ? [
          [`[AGENTS.md](${handoffFiles.agents})`],
          [`[orchestration.md](${handoffFiles.orchestration})`],
        ]
      : []),
    ...documentSet.map((document) => [documentLine(document, handoff, esc)]),
    [`[Requirements specification](${handoffFiles.requirements})`],
    [`[Target architecture](${handoffFiles.architecture})`],
    ['Architecture decision records', ...decisionLines(handoff, esc)],
    [`[Entity mapping](${handoffFiles.entities})`],
    ...(handoff.workbookFormulas === undefined
      ? []
      : [[`[Workbook formulas](${handoffFiles.workbookFormulas})`]]),
    [`[Roadmap](${handoffFiles.roadmap})`],
    [`[Task cards](${handoffFiles.tasks})`],
    [`[Risks](${handoffFiles.risks})`],
    [`[Open questions](${handoffFiles.openQuestions})`],
    [`[Claims left out](${handoffFiles.claimsLeftOut})`],
    [`[Package checks](${handoffFiles.checks})`],
    [`[Source cards](${handoffFiles.sources})`],
    [`[Realistic data shapes](${handoffFiles.fixtures})`],
    [`[Conventions](${handoffFiles.conventions})`],
    ...(writesAgentFolder(handoff.brief.buildMethod)
      ? [[`[Agent definitions](${handoffFiles.agentsReadme})`]]
      : []),
  ];
  return entries.flatMap((lines, index) =>
    lines.map((line, at) => (at === 0 ? `${String(index + 1)}. ${line}` : line)),
  );
}
