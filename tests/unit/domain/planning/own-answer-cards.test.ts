import { describe, expect, it } from 'vitest';
import { withFoundationCards } from '../../../../src/domain/planning/foundation-cards.js';
import { withOwnAnswerCards } from '../../../../src/domain/planning/own-answer-cards.js';
import type { PlanningBrief } from '../../../../src/domain/planning/planning-brief.js';
import { withMigrationCard } from '../../../../src/domain/planning/plan-coverage.js';
import type { PlanTask } from '../../../../src/domain/planning/plan-content.js';
import { cardFault } from '../../../../src/domain/planning/task-card-quality.js';
import { targetModel } from '../../../support/data-model-fixtures.js';
import { planOf, twoTasks } from '../../../support/coverage-fixtures.js';

// RF-605, RF-645, DEC-184: with an own migration answer the cut-over card follows the owner's answer
// in its decision record and prescribes no strategy; with an own architecture answer the skeleton
// card points to the owner's answer, not to the layers of a catalogue style.

const tables = targetModel().tables;
const records = { style: 'ADR-002', migration: 'ADR-003' } as const;
const own = {
  architecture: 'Cells, one per region, each with its own database.',
  migration: 'Move one module a week behind a feature flag.',
};
/** The words of a strategy of the catalogue (the routing of a strangler fig, a freeze of a rewrite, the two ways of a parallel change). */
const strategySpecific =
  /routing|routed|route\b|facade|façade|strangler|request for a part|frozen|freeze|old way|new way/iu;

type Typed = Pick<PlanningBrief, 'defaulted' | 'typed'>;

function planned(brief: Typed): readonly PlanTask[] {
  const migrated = withMigrationCard(planOf(twoTasks(), 3), tables);
  return withOwnAnswerCards(withFoundationCards(migrated, 'strangler-fig', tables), brief, records)
    .tasks;
}

const cardText = (task: PlanTask | undefined): string =>
  [task?.invariant ?? '', ...(task?.acceptanceCriteria ?? []), ...(task?.probes ?? [])].join('\n');

describe('withOwnAnswerCards: the cut-over card', () => {
  it('RF-645 DEC-184 with an own migration answer the cut-over follows the answer in its record', () => {
    const card = planned({ defaulted: [], typed: { migration: own.migration } }).at(-1);

    expect(card?.title).toMatch(/Cut over/u);
    expect(card?.invariant).toContain("owner's own migration answer in ADR-003");
    expect(cardText(card)).not.toMatch(strategySpecific);
  });

  it('RF-645 the neutral cut-over card is still a card an agent can build, at the same place', () => {
    const before = planned({ defaulted: [] }).at(-1);
    const card = planned({ defaulted: [], typed: { migration: own.migration } }).at(-1);

    expect(card && cardFault(card)).toBeUndefined();
    expect(card?.id).toBe(before?.id);
    expect(card?.dependsOn).toEqual(before?.dependsOn);
    expect(card?.riskClass).toBe('data loss');
    expect(card?.probes.length).toBeGreaterThan(0);
  });

  it('ADR-013 the owner text is never copied into the card; it stays in the escaped record', () => {
    const card = planned({ defaulted: [], typed: { migration: own.migration } }).at(-1);

    expect(JSON.stringify(card)).not.toContain('feature flag');
  });

  it('RF-608 with no own answer, or one still defaulted, the strategy card stays', () => {
    for (const brief of [
      { defaulted: [] },
      { defaulted: ['migration'], typed: { migration: own.migration } },
    ] satisfies Typed[]) {
      expect(planned(brief).at(-1)?.acceptanceCriteria.join(' ')).toContain('routing step');
    }
  });
});

describe('withOwnAnswerCards: the skeleton card', () => {
  it('RF-645 DEC-184 with an own architecture answer the skeleton points to the answer in its record', () => {
    const skeleton = planned({ defaulted: [], typed: { architecture: own.architecture } })[0];

    expect(skeleton?.acceptanceCriteria.join(' ')).toContain(
      "owner's own architecture answer in ADR-002",
    );
    expect(skeleton?.acceptanceCriteria.join(' ')).not.toContain('chosen architecture style');
    expect(skeleton && cardFault(skeleton)).toBeUndefined();
  });

  it('RF-608 with no own architecture answer the skeleton names the layers of the chosen style', () => {
    const skeleton = planned({ defaulted: [], typed: { migration: own.migration } })[0];

    expect(skeleton?.acceptanceCriteria.join(' ')).toContain('chosen architecture style');
  });
});
