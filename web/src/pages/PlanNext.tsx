import type { JSX } from 'preact';
import { navigate } from '../app/router.js';
import { Button } from '../components/Button.js';
import { isResumable } from '../lib/live-run/resumable.js';

// RF-614, RF-1017, RF-006, RST-1802: what the "Your turn" panel of an understand run offers about the
// plan. A run that ended `Completed` with a Supported claim offers "Set up the plan", which opens Plan
// setup for this run; it is the main action unless questions are still open. A run with no Supported
// claim says there is nothing to plan from. A run that ended `CapReached` with a Supported claim also
// offers it, beside Resume (the button in the page head, RF-006), and says the package uses only the
// claims judged (P3-121). A run that `Failed` or was `Interrupted` points to Resume instead, because
// `plan` refuses it.

export interface PlanNextProps {
  readonly runId: string;
  readonly projectId: string;
  readonly endState: string;
  readonly supportedClaims: number;
  /** Questions are still open: Answer questions stays the main action. */
  readonly questionsOpen: boolean;
}

/** RF-614: Plan setup for this run, named by its id in the query string. */
const planSetupPath = (projectId: string, runId: string): string =>
  `/projects/${encodeURIComponent(projectId)}/plan-setup?run=${encodeURIComponent(runId)}`;

// RF-614
export function PlanNext(props: PlanNextProps): JSX.Element | null {
  const { endState } = props;
  if (endState === 'CapReached' && props.supportedClaims > 0) {
    return (
      <>
        <p>
          This run stopped at a cap before it finished. Resume it with the Resume run button at the
          top of the page to judge the rest, or set up the plan now: it uses only the Supported
          claims, and the package says the run stopped at a cap.
        </p>
        <SetUp {...props} />
      </>
    );
  }
  if (isResumable('understand', endState)) {
    return (
      <p>
        This run stopped before it finished, so the plan cannot start from it. Resume it with the
        Resume run button at the top of the page; Set up the plan appears once it completes.
      </p>
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
  return <SetUp {...props} />;
}

function SetUp({ runId, projectId, questionsOpen }: PlanNextProps): JSX.Element {
  return (
    <Button
      variant={questionsOpen ? 'secondary' : 'primary'}
      onClick={() => {
        navigate(planSetupPath(projectId, runId));
      }}
    >
      Set up the plan
    </Button>
  );
}
