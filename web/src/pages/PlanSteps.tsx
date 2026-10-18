import type { JSX } from 'preact';
import { STEP_IDS, STEP_NAMES, type StepId } from '../lib/plan-setup/steps.js';

// RF-605, design-system.md section 14 (Plan setup): the six steps as a row of pills; the current one
// is marked with `aria-current="step"` and the ones before it are done. Any step can be opened.

export interface PlanStepsProps {
  readonly current: StepId;
  readonly onOpen: (step: StepId) => void;
}

// RF-605
export function PlanSteps({ current, onOpen }: PlanStepsProps): JSX.Element {
  const at = STEP_IDS.indexOf(current);
  return (
    <nav aria-label="Steps">
      <ol class="rst-plan-steps">
        {STEP_IDS.map((step, index) => (
          <li key={step}>
            <button
              type="button"
              class={`rst-plan-steps__pill${index < at ? ' rst-plan-steps__pill--done' : ''}`}
              aria-current={step === current ? 'step' : undefined}
              onClick={() => {
                onOpen(step);
              }}
            >
              {STEP_NAMES[step]}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
