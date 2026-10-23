import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import type { StackClash } from '../../domain/planning/stack-rules.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import { handoffFiles } from './handoff-links.js';

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
