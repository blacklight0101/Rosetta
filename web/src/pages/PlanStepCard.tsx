import type { ComponentChildren, JSX } from 'preact';
import { STEP_TEXT, type StepId } from '../lib/plan-setup/steps.js';

// RF-605, design-system.md section 14 (Plan setup): the card of one step: the question, the reason
// it matters, the default taken when it is left alone, then the answers.

export interface PlanStepCardProps {
  readonly step: StepId;
  /** What the package assumes when the question is left alone (DEC-80). */
  readonly defaultText: string;
  readonly children: ComponentChildren;
}

// RF-605
export function PlanStepCard({ step, defaultText, children }: PlanStepCardProps): JSX.Element {
  const text = STEP_TEXT[step];
  return (
    <div class="rst-plan-step">
      <h2 class="rst-plan-step__title">{text.title}</h2>
      <p class="rst-plan-why">{text.why}</p>
      <p class="rst-plan-default">{defaultText}</p>
      {children}
    </div>
  );
}
