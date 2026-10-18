import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import { formatCitation } from '../../domain/cards/citation.js';
import { behavioursToKeep } from '../../domain/planning/behaviours-to-keep.js';
import type { PlanTask } from '../../domain/planning/plan-content.js';
import type { GuardKind } from '../../domain/planning/task-card-quality.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import { handoffFiles, idLink, shapeLink, shapeSections } from './handoff-links.js';

// RF-631, RF-632, DEC-135: what a task card says about the legacy behaviour it must keep (taken by
// code from the supported claims of the cards it builds on, each with its citation, each with an
// approval test to write before the change) and the data shapes of `fixtures.md` it must handle
// when it adds a limit or a parser. Text from the repository goes through the escaper.

/** The behaviours the task keeps, each with the approval test to write first. */
// RF-631
export function behaviourLines(
  task: PlanTask,
  handoff: HandoffPackage,
  esc: MarkdownEscaper,
): string[] {
  const kept = behavioursToKeep(task, handoff.content.requirements, handoff.sources);
  if (kept.length === 0) return [];
  return [
    'Behaviour to keep:',
    '',
    ...kept.flatMap((each) => {
      const citations = each.citations.map((citation) => esc.inline(formatCitation(citation)));
      const claim = esc.inline(each.claimId);
      return [
        `- ${idLink(each.cardId, handoffFiles.sources)} ${claim}: ${esc.inline(each.text)} Citations: ${citations.join(', ')}`,
        `  - Approval test before the change: pin ${claim} against the legacy code, then keep it passing on the new code.`,
      ];
    }),
    '',
  ];
}

const shapesFor: Readonly<Record<'limit' | 'parser', readonly (keyof typeof shapeSections)[]>> = {
  limit: ['largest', 'byKind', 'deepest', 'volumes'],
  parser: ['encodings', 'lineEndings', 'unusual', 'largest'],
};

/** The sections of `fixtures.md` a card that adds a limit or a parser must handle. */
// RF-632
export function shapeLines(task: PlanTask): string[] {
  const kinds = task.adds.filter(
    (kind: GuardKind): kind is 'limit' | 'parser' => kind === 'limit' || kind === 'parser',
  );
  const keys = [...new Set(kinds.flatMap((kind) => shapesFor[kind]))];
  if (keys.length === 0) return [];
  const links = keys.map((key) => shapeLink(shapeSections[key]));
  return [`Data shapes to handle: ${links.join(', ')}`, ''];
}

/** The rule of the build method for behaviour to preserve and for the default of a question. */
// RF-631
export function behaviourRuleLines(): string[] {
  return [
    '## Behaviour to preserve',
    '',
    'Every task card that touches a feature, a rule, a flow or a screen lists the behaviours of the legacy system it must keep, each with its citation into the legacy code. For each one, write an approval test that passes on the legacy behaviour before you change it, and keep it passing. When a question comes up while you build, the default keeps the legacy behaviour; a default that would change what users see today is not allowed, so stop and ask the owner.',
    '',
  ];
}
