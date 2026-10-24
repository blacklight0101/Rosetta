import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import type { StackClash } from '../../domain/planning/stack-rules.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import { decisionLink, handoffFiles } from './handoff-links.js';

// RF-609, RF-507: what the package says about a clash between the owner's stack choices. The rule
// ids, the question and the default are Rosetta's words; the clash text holds the owner's choices,
// which are free text, so it goes through the escaper.

function clashesOf(handoff: HandoffPackage): readonly StackClash[] {
  return handoff.stackClashes ?? [];
}

/** The checks.md section: each clash, with the rule that found it and the question that answers it. */
export function stackClashCheckLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const clashes = clashesOf(handoff);
  if (clashes.length === 0) return [];
  return [
    '## Stack clashes',
    '',
    'The stack check compares the choices of the planning brief with each other and with the API contract. Rosetta never changes a choice; each clash below is an open question with a default that keeps the legacy behaviour.',
    '',
    ...clashes.flatMap((clash) => [
      `### ${clash.rule}`,
      '',
      esc.block(clash.text),
      '',
      `Rule version ${String(clash.version)}. Open question: ${clash.question.id} in [open questions](${handoffFiles.openQuestions}).`,
      '',
    ]),
  ];
}

/** The open-questions.md section: one row per clash with its default. */
export function stackClashQuestionLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const clashes = clashesOf(handoff);
  if (clashes.length === 0) return [];
  return [
    '## Stack clashes',
    '',
    'Two choices of the planning brief do not fit together. Your choices stay as written until you answer.',
    '',
    '| Question | Id | Default the package used |',
    '|---|---|---|',
    ...clashes.map(
      ({ question }) =>
        `| ${esc.inline(question.question)} | ${esc.inline(question.id)} | ${esc.inline(question.answer)} |`,
    ),
    '',
  ];
}

/** The README line that says the stack has an open clash. */
export function stackClashReadmeLines(handoff: HandoffPackage): string[] {
  const count = clashesOf(handoff).length;
  if (count === 0) return [];
  const unit = count === 1 ? 'clash' : 'clashes';
  return [
    `The stack has an open clash: ${String(count)} ${unit} between the technologies chosen. checks.md lists ${count === 1 ? 'it' : 'them'} and open-questions.md asks the owner; no choice was changed.`,
    '',
  ];
}

/** P5-39: the README lines that say which choices Rosetta proposed instead of the owner. */
export function proposalReadmeLines(handoff: HandoffPackage): string[] {
  const { proposal } = handoff;
  if (proposal === undefined) return [];
  const layers = proposal.layers.length;
  const lines: string[] = [];
  if (layers > 0) {
    const unit = layers === 1 ? 'layer' : 'layers';
    lines.push(
      `Rosetta proposed the technology of ${String(layers)} stack ${unit} for a ${proposal.kind} application (${proposal.kindFrom === 'owner' ? 'the kind the owner answered' : 'the kind found in the code map'}); each is a Proposed decision record, and the cards use it until the owner chooses. The owner's choice always wins: change it in Plan setup and write the package again.`,
      '',
    );
  }
  if (proposal.fit.changedFrom !== null) {
    lines.push(
      'Rosetta changed the default migration strategy to a full rewrite because the strangler fig does not fit this application; the reason is in the strategy decision record.',
      '',
    );
  }
  return lines;
}

/** P5-39: the TRD lines under the stack table: the kind of application and what Rosetta proposed. */
export function proposalLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const { proposal } = handoff;
  if (proposal === undefined) return [];
  return [
    `Kind of application: ${proposal.kind}. ${esc.inline(proposal.kindReason)}`,
    '',
    ...(proposal.layers.length === 0
      ? []
      : [
          `Proposed by Rosetta, not chosen by the owner: ${proposal.layers.map((each) => esc.inline(each.choice)).join(', ')}. Their records are Proposed.`,
          '',
        ]),
  ];
}

/** P5-39: the TRD lines under the strategy: what Rosetta changed or added to fit the kind. */
export function strategyLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const fit = handoff.proposal?.fit;
  if (fit === undefined || fit.reason === '') return [];
  const seam = handoff.choices.seam ?? '';
  return [
    `${fit.changedFrom === null ? 'Fit with the application' : 'Proposed by Rosetta'}: ${esc.inline(fit.reason)}${seam === '' ? '' : ` (${decisionLink(seam)})`}`,
    '',
  ];
}

/** P5-39: the checks.md section for a strategy that does not fit and that the owner chose. */
export function strategyFitCheckLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const finding = handoff.proposal?.fit.finding ?? null;
  if (finding === null) return [];
  return [
    '## Migration strategy fit',
    '',
    esc.inline(finding),
    '',
    'The owner chose this strategy, so Rosetta kept it. Decide the seam between the two systems before the first phase.',
    '',
  ];
}
