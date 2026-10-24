import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import { formatCitation } from '../../domain/cards/citation.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import { keepLegacyDefault, legacySafe } from '../../domain/planning/legacy-default.js';
import { secureDefault, securityCards } from '../../domain/planning/keep-or-fix.js';
import { keepOrFixQuestionLines, keepOrFixTable } from './handoff-keep-or-fix-markdown.js';
import { decisionFile, documentSet, handoffFiles, idLink, sourceLinks } from './handoff-links.js';
import {
  proposalReadmeLines,
  stackClashQuestionLines,
  stackClashReadmeLines,
} from './handoff-stack-markdown.js';
import { leftOutSummaryLines } from './handoff-left-out-markdown.js';
import { waitingCards, waitingOf } from './handoff-waiting-markdown.js';
import { uploadSentence } from '../../domain/sources/upload-facts.js';
import { incompleteApiLines, incompleteLines } from './handoff-incomplete-markdown.js';

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
    ...keepOrFixTable(handoff, esc),
  ].join('\n');
}

function briefQuestionLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  if (handoff.briefQuestions.length === 0) return ['Every question of the brief was answered.'];
  const waiting = waitingOf(handoff);
  return [
    '| Question | Id | Default the package used | Cards waiting |',
    '|---|---|---|---|',
    ...handoff.briefQuestions
      .map(legacySafe)
      .map(
        (question) =>
          `| ${esc.inline(question.question)} | ${esc.inline(question.id)} | ${esc.inline(question.answer)} | ${waitingCards(waiting, question.id)} |`,
      ),
  ];
}

/** RF-621, DEC-80: the PRD sections the cards could not fill, each with the default used. */
function prdQuestionLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  if (handoff.prdQuestions.length === 0)
    return ['Every section of the PRD was filled from the cards.'];
  const waiting = waitingOf(handoff);
  return [
    '| Id | Question | Default the package used | Cards waiting |',
    '|---|---|---|---|',
    ...handoff.prdQuestions
      .map(legacySafe)
      .map(
        (question) =>
          `| ${question.id} | ${esc.inline(question.question)} | ${esc.inline(question.answer)} | ${waitingCards(waiting, question.id)} |`,
      ),
  ];
}

// RF-604
export function openQuestionsMarkdown(handoff: HandoffPackage, esc: MarkdownEscaper): string {
  const waiting = waitingOf(handoff);
  const secure = securityCards(handoff.content.judgements ?? [], handoff.sources);
  const unanswered = handoff.openQuestions.map(
    (question) =>
      `- ${esc.inline(question.cardId)}: ${esc.inline(question.question)} Default: ${secure.has(question.cardId) ? secureDefault : keepLegacyDefault} Cards waiting: ${waitingCards(waiting, question.cardId)}`,
  );
  return [
    '# Open questions',
    '',
    '## The rule for a default',
    '',
    'A default keeps the legacy behaviour: a default that would change what users see today is not allowed, and a question that proposed one says so and takes the legacy behaviour instead.',
    '',
    'A security question is the exception: its default is the secure option, never the legacy behaviour. The planner marks a claim as a security matter, and a question of the card that holds such a claim, and a keep-or-fix row about it, default to the secure option.',
    '',
    '## Planning brief questions that took their default',
    '',
    'Nobody answered these questions when the brief was saved; the package was written with the default shown. Confirm or change each one. A question of the brief applies to the whole build, so it marks no single card as waiting.',
    '',
    ...briefQuestionLines(handoff, esc),
    '',
    ...stackClashQuestionLines(handoff, esc),
    '## Product requirements document questions',
    '',
    'The cards cannot answer these questions, so the product requirements document holds a marked placeholder where each answer belongs. Answer or confirm the default of each one.',
    '',
    ...prdQuestionLines(handoff, esc),
    '',
    ...keepOrFixQuestionLines(handoff, esc),
    '## Questions from the analysis without an answer',
    '',
    ...(unanswered.length === 0 ? ['Every question of the analysis was answered.'] : unanswered),
    '',
    '## Claims left out of the package',
    '',
    ...leftOutSummaryLines(handoff, esc),
    '',
  ].join('\n');
}

/** Where the citations point: the commit, the zip or the Excel workbooks (RF-131, RF-156). */
function sourcesPlace(handoff: HandoffPackage): string {
  if (handoff.upload === undefined) return 'at the analysed commit';
  return handoff.upload.workbooks === undefined
    ? 'in the uploaded zip'
    : 'in the uploaded workbooks';
}

/** P5-32: the ids merged into a card, each an anchor of its own so an old link still lands here. */
function aliasLines(card: HandoffPackage['sources'][number]): string[] {
  const merged = (card.mergedFrom ?? []).filter((id) => id !== card.id);
  if (merged.length === 0) return [];
  const anchors = merged.map((id) => `<a id="${id.toLowerCase()}"></a>`).join('');
  return [`Merged ids: ${merged.join(', ')}${anchors}`, ''];
}

// RF-602
export function sourcesMarkdown(handoff: HandoffPackage, esc: MarkdownEscaper): string {
  const where = sourcesPlace(handoff);
  return [
    '# Source cards',
    '',
    `The cards of the analysis the package is planned from, each with the claims the verifier found supported and their citations (\`path:startLine-endLine\`) into the legacy code ${where}.`,
    '',
    ...handoff.sources.flatMap((card) => [
      `## ${card.id}`,
      '',
      `**${esc.inline(card.title)}** (${card.type}, area ${esc.inline(card.area)})`,
      '',
      esc.block(card.summary),
      '',
      ...aliasLines(card),
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
function readingOrder(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const entries = [
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
    ...(handoff.brief.buildMethod.aiAssisted ? [[`[AGENTS.md](${handoffFiles.agents})`]] : []),
  ];
  return entries.flatMap((lines, index) =>
    lines.map((line, at) => (at === 0 ? `${String(index + 1)}. ${line}` : line)),
  );
}

/** RF-624: where the API contract is, or why none applies, and the cards no operation serves. */
function apiContractSection(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const { apiContract } = handoff;
  if (apiContract.kind === 'none') {
    return [
      '## API contract',
      '',
      ...incompleteApiLines(handoff),
      `No API contract applies to this package: ${esc.inline(apiContract.reason)}`,
      '',
    ];
  }
  const count = apiContract.operations.length;
  const unit = count === 1 ? 'operation' : 'operations';
  return [
    '## API contract',
    '',
    `The OpenAPI 3.1 contract is the file \`${handoffFiles.apiContract}\`: ${String(count)} ${unit}, each naming the feature or flow cards it serves, with schemas from the target data model, error responses and authentication.`,
    ...(apiContract.unserved.length === 0
      ? []
      : [
          '',
          'Cards no operation serves:',
          '',
          ...apiContract.unserved.map(
            ({ cardId, reason }) =>
              `- ${idLink(cardId, handoffFiles.sources)}: ${esc.inline(reason)}`,
          ),
        ]),
    '',
  ];
}

// RF-604, Q-59, DEC-80: the first line of the README when no stack layer was chosen; nothing when one was.
function noStackLines(handoff: HandoffPackage): string[] {
  if (handoff.brief.stack.some((entry) => entry.proposed !== true)) return [];
  if (handoff.proposal !== undefined && handoff.proposal.layers.length > 0) return [];
  return [
    'No technology was chosen; the cards are written for any stack. Choose a stack in Plan setup and write the package again.',
    '',
  ];
}

// RF-604, P3-121: the first lines of the README when the source run stopped at a cap.
function sourceStopLines(handoff: HandoffPackage): string[] {
  if (handoff.sourceStop === undefined) return [];
  return [
    'The understand run this package was planned from stopped at a cap before it finished, so the package covers only the claims it had judged. checks.md says how many were left out.',
    '',
  ];
}

// RF-601, RF-603, RF-620
export function readmeMarkdown(handoff: HandoffPackage, esc: MarkdownEscaper): string {
  const { repository, brief } = handoff;
  const commit = repository.commitSha ?? 'not recorded';
  const analysed =
    handoff.upload === undefined
      ? `${esc.url(repository.url)} at commit ${esc.inline(commit)}`
      : esc.inline(uploadSentence(handoff.upload));
  return [
    '# Modernisation hand-off package',
    '',
    ...noStackLines(handoff),
    ...proposalReadmeLines(handoff),
    ...sourceStopLines(handoff),
    ...stackClashReadmeLines(handoff),
    `Planned from the analysis of ${analysed} (understand run ${esc.inline(handoff.sourceRun)}), with the planning brief saved at ${esc.inline(brief.savedAt)}.`,
    '',
    'Only claims the verifier found supported by the code were used. Every requirement names its source cards, and every source card lists its citations into the legacy code. The files are plain Markdown (the API contract, when there is one, is YAML); the diagrams are Mermaid.',
    '',
    ...incompleteLines(handoff),
    '## Reading order',
    '',
    ...readingOrder(handoff, esc),
    '',
    ...apiContractSection(handoff, esc),
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
