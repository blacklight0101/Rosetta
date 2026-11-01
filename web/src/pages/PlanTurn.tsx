import type { JSX } from 'preact';
import { usePackageChecks } from './use-package-checks.js';
import { navigate } from '../app/router.js';
import type { RunState } from '../lib/live-run/run-state.js';
import { Button } from '../components/Button.js';

// RF-1015, RF-627 (P7-25): what the "Your turn" panel of an ended plan run offers. A plan run is never
// resumed: a plan that did not finish is tried again from Plan setup, and a package written with gaps
// (RST-1806) points to the checks.md that lists them. The Resume run and "Set up the plan" texts belong
// to an understand run (PlanNext).

export interface PlanTurnProps {
  readonly projectId: string;
  readonly runId: string;
  readonly ended: RunState['ended'];
}

// RF-1015
export function PlanTurn(props: PlanTurnProps): JSX.Element {
  const { endState, errorCode } = props.ended ?? {};
  const sections = usePackageChecks(props.runId, props.ended);
  if (endState === 'Completed' && errorCode === undefined) {
    return (
      <p>The plan is written. Download the package below; checks.md in it lists what to review.</p>
    );
  }
  const text =
    errorCode === 'RST-1806'
      ? 'The package was written, but checks.md, in the package download, lists the items no task card builds. Try the plan again to ask for task cards for them.'
      : 'The plan did not finish. What failed and what to do is shown above the tabs. Try the plan again when you are ready.';
  return (
    <>
      <p>{text}</p>
      {errorCode === 'RST-1806'
        ? (sections ?? []).map((section) => (
            <section key={section.title} aria-label={section.title}>
              <h3>{section.title}</h3>
              <p class="rst-plan-check">{section.text}</p>
            </section>
          ))
        : null}
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
