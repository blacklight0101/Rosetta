import type { JSX } from 'preact';
import type { ApiFailure } from '../api/client.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { noStackChosen, type Draft } from '../lib/plan-setup/draft.js';
import { STEP_IDS, type StepId } from '../lib/plan-setup/steps.js';

// RF-605, design-system.md section 14 (Plan setup): Back, "Use the defaults for the rest" and
// "Save and continue" (just "Save" on the last step), with the refusal of a save above them.

export interface PlanStepButtonsProps {
  readonly step: StepId;
  readonly saving: boolean;
  readonly error: ApiFailure | undefined;
  readonly draft: Draft;
  readonly onBack: () => void;
  readonly onDefaults: () => void;
  readonly onSave: () => void;
  readonly onGoTo: (step: StepId) => void;
}

// RF-605, Q-59: the line beside the defaults button while no stack layer is chosen.
function NoStackLine(props: { readonly onChoose: () => void }): JSX.Element {
  return (
    <p class="rst-plan-actions__note">
      No stack is chosen yet: the package will name no technology, and the suggested stack options
      stay unused.
      <Button variant="ghost" onClick={props.onChoose}>
        Choose a stack
      </Button>
    </p>
  );
}

// RF-605
export function PlanStepButtons(props: PlanStepButtonsProps): JSX.Element {
  const first = props.step === STEP_IDS[0];
  const last = props.step === STEP_IDS[STEP_IDS.length - 1];
  const onChoose = (): void => {
    props.onGoTo('stack');
  };
  return (
    <div class="rst-plan-actions">
      {props.error === undefined ? null : <ErrorBanner error={props.error} />}
      {noStackChosen(props.draft) ? <NoStackLine onChoose={onChoose} /> : null}
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
