import type { JSX } from 'preact';
import { navigate } from '../app/router.js';
import { Button } from '../components/Button.js';

// RF-1015, RF-627 (P7-25): what the "Your turn" panel of an ended plan run offers. A plan run is never
// resumed: a plan that did not finish is tried again from Plan setup, and a package written with gaps
// (RST-1806) points to the checks.md that lists them. The Resume run and "Set up the plan" texts belong
// to an understand run (PlanNext).

export interface PlanTurnProps {
  readonly projectId: string;
  readonly endState: string | undefined;
  readonly errorCode: string | undefined;
}

// RF-1015
export function PlanTurn(props: PlanTurnProps): JSX.Element {
  if (props.endState === 'Completed' && props.errorCode === undefined) {
    return (
      <p>The plan is written. Download the package below; checks.md in it lists what to review.</p>
    );
  }
  const text =
    props.errorCode === 'RST-1806'
      ? 'The package was written, but checks.md, in the package download, lists the items no task card builds. Try the plan again to ask for task cards for them.'
      : 'The plan did not finish. What failed and what to do is shown above the tabs. Try the plan again when you are ready.';
  return (
    <>
      <p>{text}</p>
      <Button
        variant="primary"
        onClick={() => {
          navigate(`/projects/${encodeURIComponent(props.projectId)}/plan-setup`);
        }}
      >
        Try the plan again
      </Button>
    </>
  );
}
