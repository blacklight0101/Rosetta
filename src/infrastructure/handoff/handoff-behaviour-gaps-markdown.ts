import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import {
  behavioursKeptByNoCard,
  type KeptBehaviour,
} from '../../domain/planning/behaviours-to-keep.js';
import { sourceCardsWithNoRequirement } from '../../domain/planning/coverage-checks.js';
import { keepOrFixOf } from './handoff-keep-or-fix.js';

// RF-631, P10-14, P10-D6: the behaviour of the source that the task cards leave out, said under the
// summary of "Plan coverage" in checks.md. The eShop package of P10-11 read "Every feature, table,
// operation, journey and screen is built" above 98 behaviours kept by no card; the line names the
// counts and the sections that list them, so the coverage never reads as if all the behaviour were
// built. It changes no outcome of the run. Counts and sentences are Rosetta's, never model text.

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? '' : 's'}`;
}

/** The behaviours no task card keeps, changes or lists as keep-or-fix (section "Behaviour kept by no card"). */
// RF-631
export function keptByNoCard(handoff: HandoffPackage): KeptBehaviour[] {
  const { tasks, requirements } = handoff.content;
  return behavioursKeptByNoCard(tasks, requirements, handoff.sources, keepOrFixOf(handoff).context);
}

function lostPart(lost: readonly KeptBehaviour[]): string {
  const cards = new Set(lost.map((each) => each.cardId)).size;
  const verb = lost.length === 1 ? 'is' : 'are';
  return `${plural(lost.length, 'behaviour')} of ${plural(cards, 'source card')} ${verb} kept by no card`;
}

function unreachedPart(count: number): string {
  return `${plural(count, 'feature card')} ${count === 1 ? 'reaches' : 'reach'} no requirement`;
}

/** The line under the coverage summary, with its blank line; nothing when no behaviour is left out. */
// RF-631
export function behaviourGapLines(handoff: HandoffPackage): string[] {
  const lost = keptByNoCard(handoff);
  const unreached = sourceCardsWithNoRequirement(handoff.sources, handoff.content.requirements);
  const gaps = [
    ...(lost.length === 0 ? [] : [{ part: lostPart(lost), section: 'Behaviour kept by no card' }]),
    ...(unreached.length === 0
      ? []
      : [
          {
            part: unreachedPart(unreached.length),
            section: 'Source cards that reach no requirement',
          },
        ]),
  ];
  if (gaps.length === 0) return [];
  const parts = gaps.map((each) => each.part).join(', and ');
  const sections = gaps.map((each) => `"${each.section}"`).join(' and ');
  return [`Not every behaviour of the source is kept: ${parts} (see ${sections}).`, ''];
}
