import type { JSX } from 'preact';
import type { StepId } from '../lib/plan-setup/steps.js';
import { PlanArchitectureStep, type ArchitectureProps } from './PlanArchitectureStep.js';
import { PlanContextStep } from './PlanContextStep.js';
import { PlanMethodStep } from './PlanMethodStep.js';
import { PlanMigrationStep } from './PlanMigrationStep.js';
import { PlanPrinciplesStep, type StepProps } from './PlanPrinciplesStep.js';
import { PlanStackStep } from './PlanStackStep.js';

// RF-605: the questions of the open step.

export interface PlanStepBodyProps extends ArchitectureProps {
  readonly step: StepId;
}

// RF-605
export function PlanStepBody(props: PlanStepBodyProps): JSX.Element {
  const { step, load, waitingForConsent, askAgain, ...common } = props;
  const plain: StepProps = common;
  const asked = { load, waitingForConsent, askAgain };
  switch (step) {
    case 'principles':
      return <PlanPrinciplesStep {...plain} />;
    case 'architecture':
      return <PlanArchitectureStep {...plain} {...asked} />;
    case 'migration':
      return <PlanMigrationStep {...plain} />;
    case 'stack':
      return <PlanStackStep {...plain} {...asked} />;
    case 'context':
      return <PlanContextStep {...plain} />;
    case 'method':
      return <PlanMethodStep {...plain} />;
  }
}
