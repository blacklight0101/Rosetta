import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import { formatCitation } from '../../domain/cards/citation.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import { decisionFile, documentSet, handoffFiles, sourceLinks } from './handoff-links.js';

// RF-601..RF-604, RF-603: the README with the reading order, the risks, the open questions (the
// brief's questions that took their default, the analysis questions without an answer and the
// claims left out, each with its id) and the source cards with their citations. Plain Markdown;
// model, repository and user text goes through the escaper.

// RF-601
export function risksMarkdown(handoff: HandoffPackage, esc: MarkdownEscaper): string {
  const { risks } = handoff.content;
  return [
    '# Risks',
    '',
    ...(risks.length === 0
      ? ['The planner named no risk.']
      : risks.flatMap((risk) => [
          `## ${risk.id}`,
          '',
          esc.block(risk.text),
          '',
          `Source cards: ${sourceLinks(risk.sources)}`,
          '',
        ])),
    '',
  ].join('\n');
}

function briefQuestionLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  if (handoff.briefQuestions.length === 0) return ['Every question of the brief was answered.'];
  return [
    '| Question | Id | Default the package used |',
    '|---|---|---|',
    ...handoff.briefQuestions.map(
      (question) =>
        `| ${esc.inline(question.question)} | ${esc.inline(question.id)} | ${esc.inline(question.answer)} |`,
    ),
  ];
}

/** RF-621, DEC-80: the PRD sections the cards could not fill, each with the default used. */
function prdQuestionLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  if (handoff.prdQuestions.length === 0)
    return ['Every section of the PRD was filled from the cards.'];
  return [
    '| Id | Question | Default the package used |',
    '|---|---|---|',
    ...handoff.prdQuestions.map(
      (question) =>
        `| ${question.id} | ${esc.inline(question.question)} | ${esc.inline(question.answer)} |`,
    ),
  ];
}

function excludedLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  if (handoff.excluded.length === 0) return ['No claim was left out.'];
  return [
    '| Claim | Card | Status |',
    '|---|---|---|',
    ...handoff.excluded.map(
      (claim) => `| ${esc.inline(claim.claimId)} | ${esc.inline(claim.cardId)} | ${claim.status} |`,
    ),
  ];
}

// RF-604
export function openQuestionsMarkdown(handoff: HandoffPackage, esc: MarkdownEscaper): string {
  const unanswered = handoff.openQuestions.map(
    (question) => `- ${esc.inline(question.cardId)}: ${esc.inline(question.question)}`,
  );
  return [
    '# Open questions',
    '',
    '## Planning brief questions that took their default',
    '',
    'Nobody answered these questions when the brief was saved; the package was written with the default shown. Confirm or change each one.',
    '',
    ...briefQuestionLines(handoff, esc),
    '',
    '## Product requirements document questions',
    '',
    'The cards cannot answer these questions, so the product requirements document holds a marked placeholder where each answer belongs. Answer or confirm the default of each one.',
    '',
    ...prdQuestionLines(handoff, esc),
    '',
    '## Questions from the analysis without an answer',
    '',
    ...(unanswered.length === 0 ? ['Every question of the analysis was answered.'] : unanswered),
    '',
    '## Claims left out of the package',
    '',
    'Claims the verifier did not find supported by the code (rejected, with an invalid citation, or never judged). The package uses none of them.',
    '',
    ...excludedLines(handoff, esc),
    '',
  ].join('\n');
}

// RF-602
export function sourcesMarkdown(handoff: HandoffPackage, esc: MarkdownEscaper): string {
  return [
    '# Source cards',
    '',
    'The cards of the analysis the package is planned from, each with the claims the verifier found supported and their citations (`path:startLine-endLine`) into the legacy code at the analysed commit.',
    '',
    ...handoff.sources.flatMap((card) => [
      `## ${card.id}`,
      '',
      `**${esc.inline(card.title)}** (${card.type}, area ${esc.inline(card.area)})`,
      '',
      esc.block(card.summary),
      '',
      ...card.claims.map(
        (claim) =>
          `- ${esc.inline(claim.claimId)}: ${esc.inline(claim.text)} Citations: ${claim.citations.map((citation) => esc.inline(formatCitation(citation))).join(', ')}`,
      ),
      '',
    ]),
  ].join('\n');
}

function decisionLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const { decisions } = handoff.content;
  if (decisions.length === 0) return ['   No decision record was written.'];
  return decisions.map(
    (decision) =>
      `   - [${decision.id}](${decisionFile(decision.id)}): ${esc.inline(decision.title)}`,
  );
}

/** RF-620, RF-601: the documentation set first, then the parts of RF-601, each linking its file. */
function readingOrder(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const entries = [
    ...documentSet.map(({ title, file }) => [`[${title}](${file})`]),
    [`[Requirements specification](${handoffFiles.requirements})`],
    [`[Target architecture](${handoffFiles.architecture})`],
    ['Architecture decision records', ...decisionLines(handoff, esc)],
    [`[Entity mapping](${handoffFiles.entities})`],
    [`[Roadmap](${handoffFiles.roadmap})`],
    [`[Task cards](${handoffFiles.tasks})`],
    [`[Risks](${handoffFiles.risks})`],
    [`[Open questions](${handoffFiles.openQuestions})`],
    [`[Source cards](${handoffFiles.sources})`],
    [`[Conventions](${handoffFiles.conventions})`],
    ...(handoff.brief.buildMethod.aiAssisted ? [[`[AGENTS.md](${handoffFiles.agents})`]] : []),
  ];
  return entries.flatMap((lines, index) =>
    lines.map((line, at) => (at === 0 ? `${String(index + 1)}. ${line}` : line)),
  );
}

// RF-601, RF-603, RF-620
export function readmeMarkdown(handoff: HandoffPackage, esc: MarkdownEscaper): string {
  const { repository, brief } = handoff;
  const commit = repository.commitSha ?? 'not recorded';
  return [
    '# Modernisation hand-off package',
    '',
    `Planned from the analysis of ${esc.inline(repository.url)} at commit ${esc.inline(commit)} (understand run ${esc.inline(handoff.sourceRun)}), with the planning brief saved at ${esc.inline(brief.savedAt)}.`,
    '',
    'Only claims the verifier found supported by the code were used. Every requirement names its source cards, and every source card lists its citations into the legacy code. The files are plain Markdown; the diagrams are Mermaid.',
    '',
    '## Reading order',
    '',
    ...readingOrder(handoff, esc),
    '',
    '## Principles and practices',
    '',
    ...(handoff.principles.length === 0
      ? ['None were chosen.']
      : handoff.principles.map(
          (principle) => `- **${esc.inline(principle.title)}**: ${esc.inline(principle.rule)}`,
        )),
    '',
  ].join('\n');
}
