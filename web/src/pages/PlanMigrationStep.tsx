import type { JSX } from 'preact';
import { withAnswered } from '../lib/plan-setup/draft.js';
import { PlanChoice } from './PlanChoice.js';
import { PlanStepCard } from './PlanStepCard.js';
import type { StepProps } from './PlanPrinciplesStep.js';

// RF-610, design-system.md section 14 (Plan setup): Strangler Fig (the default and the
// recommendation), Parallel Change or a full rewrite, each with its trade-off.

// RF-610
export function PlanMigrationStep({ draft, catalogue, change }: StepProps): JSX.Element {
  const first = catalogue.migrations[0]?.id;
  return (
    <PlanStepCard
      step="migration"
      defaultText={`Default: ${catalogue.migrations[0]?.title ?? 'Strangler Fig'}.`}
    >
      <div class="rst-plan-options">
        {catalogue.migrations.map((strategy) => (
          <PlanChoice
            key={strategy.id}
            id={`migration-${strategy.id}`}
            group="migration"
            title={strategy.id === first ? `${strategy.title} (Recommended)` : strategy.title}
            checked={draft.migration === strategy.id}
            onChoose={() => {
              change(withAnswered({ ...draft, migration: strategy.id }, ['migration']));
            }}
          >
            <p class="rst-plan-note">{strategy.tradeOff}</p>
          </PlanChoice>
        ))}
      </div>
    </PlanStepCard>
  );
}
