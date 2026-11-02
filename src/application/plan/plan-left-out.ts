import type { LeftOutCard } from '../../domain/planning/left-out-card.js';
import type { UnreadableItem } from '../../domain/planning/plan-draft.js';
import type { SecretRisks } from '../../domain/planning/secret-risks.js';
import type { HandoffPackage } from './handoff-package.js';
import type { PlannedDocuments } from './plan-documents.js';
import { placeOf } from './plan-repair.js';

// P7-18: the parts of the plan the hand-off package leaves out, split out of plan-package.ts (behaviour
// unchanged). Each becomes a row of checks.md.

/** P3-101: the task cards the answer left out, by position, for checks.md. */
function taskCardItems(cards: readonly LeftOutCard[]): HandoffPackage['leftOut'] {
  return cards.map((each) => ({
    area: 'Task cards',
    item: String(each.position),
    field: each.field,
    reason: each.reason,
  }));
}

/** P3-126: the items of the other lists of the answer that could not be read, for checks.md. */
function unreadableItems(items: readonly UnreadableItem[]): HandoffPackage['leftOut'] {
  return items.map((each) => ({
    area: 'Plan answer',
    item: placeOf(each),
    field: each.field,
    reason: each.reason,
  }));
}

/** P3-101, P3-102, P3-126: every part of the plan the package leaves out, for checks.md. */
export function leftOutItems(documents: {
  readonly leftOut: readonly LeftOutCard[];
  readonly unreadable: readonly UnreadableItem[];
  readonly dataModelProblems: PlannedDocuments['dataModelProblems'];
}): HandoffPackage['leftOut'] {
  return [
    ...taskCardItems(documents.leftOut),
    ...unreadableItems(documents.unreadable),
    ...dataModelItems(documents.dataModelProblems),
  ];
}

/** P3-102, P7-13: the data-model parts the parser dropped and the checks of the kept ones, for checks.md (the problem keeps its kind). */
function dataModelItems(
  problems: PlannedDocuments['dataModelProblems'],
): HandoffPackage['leftOut'] {
  return problems.map((each) => ({ area: 'Data model', ...each }));
}

/** P5-34: a scan that could not be read is not "no plain-text secret"; checks.md says so. */
export function unreadSecretItems(secrets: SecretRisks): HandoffPackage['leftOut'] {
  if (secrets.unread !== true) return [];
  return [
    {
      area: 'Risks',
      item: 'Plain-text secrets',
      field: 'scan',
      reason:
        'The scan could not be read, so the risks do not list the files that hold a plain-text secret. None was found and none was ruled out.',
    },
  ];
}
