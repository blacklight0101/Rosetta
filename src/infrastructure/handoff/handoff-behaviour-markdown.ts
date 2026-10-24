import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import { formatCitation } from '../../domain/cards/citation.js';
import {
  behavioursOf,
  type ChangedBehaviour,
  type KeptBehaviour,
} from '../../domain/planning/behaviours-to-keep.js';
import type { PlanTask } from '../../domain/planning/plan-content.js';
import type { GuardKind } from '../../domain/planning/task-card-quality.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import { keepOrFixOf } from './handoff-keep-or-fix.js';
import { decisionLink, handoffFiles, idLink, shapeLink, shapeSections } from './handoff-links.js';
import type { KeepOrFixRow } from '../../domain/planning/keep-or-fix.js';

// RF-631, RF-632, DEC-135: what a task card says about the legacy behaviour it must keep (taken by
// code from the supported claims of the cards it builds on, each with its citation, each with an
// approval test to write before the change) and the data shapes of `fixtures.md` it must handle
// when it adds a limit or a parser. Text from the repository goes through the escaper.

function approvalLine(claim: string): string {
  return `  - Approval test before the change: pin ${claim} against the legacy code, then keep it passing on the new code.`;
}

function keptLines(kept: readonly KeptBehaviour[], esc: MarkdownEscaper): string[] {
  if (kept.length === 0) return [];
  return [
    'Behaviour to keep:',
    '',
    ...kept.flatMap((each) => [lineOf(each, esc), approvalLine(esc.inline(each.claimId))]),
    '',
  ];
}

function lineOf(each: KeptBehaviour, esc: MarkdownEscaper): string {
  const citations = each.citations.map((citation) => esc.inline(formatCitation(citation)));
  const claim = esc.inline(each.claimId);
  return `- ${idLink(each.cardId, handoffFiles.sources)} ${claim}: ${esc.inline(each.text)} Citations: ${citations.join(', ')}`;
}

/** P5-41: the claims a decision or an answered question changes, each naming the decision. */
function changedLines(changed: readonly ChangedBehaviour[], esc: MarkdownEscaper): string[] {
  if (changed.length === 0) return [];
  return [
    'Behaviour to change:',
    '',
    ...changed.flatMap((each) => {
      const by =
        each.decisionId === undefined
          ? `the owner answer to ${esc.inline(each.answerCard ?? '')}`
          : decisionLink(each.decisionId);
      return [
        `${lineOf(each, esc)} Changed by: ${by}.`,
        '  - Build what the decision says. Do not pin this claim with an approval test.',
      ];
    }),
    '',
  ];
}

/** P5-41: the claims judged a likely defect, each with the row of the keep-or-fix table. */
function fixLines(
  fix: readonly KeptBehaviour[],
  rows: readonly KeepOrFixRow[],
  esc: MarkdownEscaper,
): string[] {
  if (fix.length === 0) return [];
  return [
    `Keep or fix (the default is fix; see [keep or fix](${handoffFiles.risks}#keep-or-fix)):`,
    '',
    ...fix.flatMap((each) => {
      const row = rows.find((candidate) => candidate.claimId === each.claimId);
      return [
        `${lineOf(each, esc)} Row: ${row?.id ?? 'none'}.`,
        '  - Do not pin this claim with an approval test until the owner decides to keep it.',
      ];
    }),
    '',
  ];
}

/** The behaviours the task keeps, changes or has to keep or fix, with the approval test to write first. */
// RF-631, P5-41
export function behaviourLines(
  task: PlanTask,
  handoff: HandoffPackage,
  esc: MarkdownEscaper,
): string[] {
  const { context, rows } = keepOrFixOf(handoff);
  const { keep, change, fix } = behavioursOf(
    task,
    handoff.content.requirements,
    handoff.sources,
    context,
  );
  return [...keptLines(keep, esc), ...changedLines(change, esc), ...fixLines(fix, rows, esc)];
}

const shapesFor: Readonly<Record<'limit' | 'parser', readonly (keyof typeof shapeSections)[]>> = {
  limit: ['volumes', 'seeds'],
  parser: ['seeds', 'tests'],
};

/** The sections of `fixtures.md` a card that adds a limit or a parser must handle. */
// RF-632
export function shapeLines(task: PlanTask, workbook = false): string[] {
  const kinds = task.adds.filter(
    (kind: GuardKind): kind is 'limit' | 'parser' => kind === 'limit' || kind === 'parser',
  );
  const keys = [...new Set(kinds.flatMap((kind) => shapesFor[kind]))];
  if (keys.length === 0) return [];
  // P5-08: a workbook has no file shapes worth testing; its data is sheets, rows and cells.
  if (workbook) {
    return [
      `Data shapes to handle: the sheets, rows and cells of the workbook, see ${shapeLink(shapeSections.volumes)}`,
      '',
    ];
  }
  const links = keys.map((key) => shapeLink(shapeSections[key]));
  return [`Data shapes to handle: ${links.join(', ')}`, ''];
}

/** The rule of the build method for behaviour to preserve and for the default of a question. */
// RF-631
export function behaviourRuleLines(): string[] {
  return [
    '## Behaviour to preserve',
    '',
    'Every task card that touches a feature, a rule, a flow or a screen lists the behaviours of the legacy system it must keep, each with its citation into the legacy code. For each one, write an approval test that passes on the legacy behaviour before you change it, and keep it passing. When a question comes up while you build, the default keeps the legacy behaviour; a default that would change what users see today is not allowed, so stop and ask the owner. A claim that a decision or an answer changes is listed as behaviour to change and is not pinned with an approval test. A claim the planner judged a likely defect is a keep-or-fix row of the risks file with a default of fix, and is not pinned either. A security question is the exception to the default above: a security question defaults to the secure option, never to the legacy behaviour.',
    '',
  ];
}
