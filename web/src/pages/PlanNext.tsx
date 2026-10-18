import type { JSX } from 'preact';
import { navigate } from '../app/router.js';
import { Button } from '../components/Button.js';
import { isResumable } from '../lib/live-run/resumable.js';
import { ResumeButton } from './ResumeButton.js';

// RF-614, RF-1017, RF-006, RST-1802: what the "Your turn" panel of an understand run offers about the
// plan. A run that ended `Completed` with a Supported claim offers "Set up the plan", which opens Plan
// setup for this run; it is the main action unless questions are still open. A run with no Supported
// claim says there is nothing to plan from. A run that stopped (`CapReached`, `Failed`,
// `Interrupted`) offers Resume instead, because `plan` refuses it.

export interface PlanNextProps {
  readonly runId: string;
  readonly projectId: string;
  readonly endState: string;
  readonly supportedClaims: number;
  /** Questions are still open: Answer questions stays the main action. */
  readonly questionsOpen: boolean;
  readonly onResumed: () => void;
}

/** RF-614: Plan setup for this run, named by its id in the query string. */
const planSetupPath = (projectId: string, runId: string): string =>
  `/projects/${encodeURIComponent(projectId)}/plan-setup?run=${encodeURIComponent(runId)}`;

// RF-614
export function PlanNext(props: PlanNextProps): JSX.Element | null {
  const { runId, projectId, endState } = props;
  if (isResumable('understand', endState)) {
    return (
      <>
        <p>
          This run stopped before it finished, so the plan cannot start from it. Resume it; Set up
          the plan appears once it completes.
        </p>
        <ResumeButton runId={runId} onResumed={props.onResumed} />
      </>
    );
  }
  if (endState !== 'Completed') return null;
  if (props.supportedClaims === 0) {
    return (
      <p>
        This run has no Supported claim, so there is nothing to plan from. Check its evidence, or
        start a new run on more areas.
      </p>
    );
  }
  return (
    <Button
      variant={props.questionsOpen ? 'secondary' : 'primary'}
      onClick={() => {
        navigate(planSetupPath(projectId, runId));
      }}
    >
      Set up the plan
    </Button>
  );
}
