import type { JSX } from 'preact';
import type { ApiFailure } from '../api/client.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { STEP_IDS, type StepId } from '../lib/plan-setup/steps.js';

// RF-605, design-system.md section 14 (Plan setup): Back, "Use the defaults for the rest" and
// "Save and continue" (just "Save" on the last step), with the refusal of a save above them.

export interface PlanStepButtonsProps {
  readonly step: StepId;
  readonly saving: boolean;
  readonly error: ApiFailure | undefined;
  readonly onBack: () => void;
  readonly onDefaults: () => void;
  readonly onSave: () => void;
}

// RF-605
export function PlanStepButtons(props: PlanStepButtonsProps): JSX.Element {
  const first = props.step === STEP_IDS[0];
  const last = props.step === STEP_IDS[STEP_IDS.length - 1];
  return (
    <div class="rst-plan-actions">
      {props.error === undefined ? null : <ErrorBanner error={props.error} />}
      <div class="rst-plan-actions__row">
        {first ? null : <Button onClick={props.onBack}>Back</Button>}
        <span class="rst-plan-actions__spacer" />
        <Button variant="ghost" busy={props.saving} onClick={props.onDefaults}>
          Use the defaults for the rest
        </Button>
        <Button variant="primary" busy={props.saving} onClick={props.onSave}>
          {last ? 'Save' : 'Save and continue'}
        </Button>
      </div>
    </div>
  );
}
