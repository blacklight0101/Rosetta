import type { JSX } from 'preact';
import { costLabel, tokensLabel } from '../lib/live-run/format.js';
import { callLabel } from '../lib/live-run/plan-calls.js';
import { usePackageChecks } from './use-package-checks.js';
import type { RunState } from '../lib/live-run/run-state.js';

// RF-1015, RF-1003 (P7-25): the plan figures of a plan run: the planner calls with their tokens and
// cost, and, once the package is written, where its checks are. A plan run has no agents, cards or
// claims, so this stands in the place of those tabs.

function note(state: RunState): string {
  const { ended } = state;
  if (ended?.endState === 'Completed') {
    return 'The package is written. Its checks are in checks.md, in the package download.';
  }
  if (ended?.errorCode === 'RST-1806') {
    return 'The package is written with gaps. checks.md, in the package download, lists the items no task card builds.';
  }
  return 'The checks on the package appear here once it is written.';
}

// RF-1015
export function PlanCalls(props: {
  readonly runId: string;
  readonly state: RunState;
}): JSX.Element {
  const { planCalls } = props.state;
  const sections = usePackageChecks(props.runId, props.state.ended);
  return (
    <>
      {planCalls.length === 0 ? (
        <p class="rst-settings__note">The planner has not made a call yet.</p>
      ) : (
        <ul class="rst-plan-calls" aria-label="Planner calls">
          {planCalls.map((call) => (
            <li key={call.agentTaskId}>
              <span>{callLabel(call.call)}</span>{' '}
              <span>{`${tokensLabel(call.inputTokens + call.outputTokens)} tokens`}</span>{' '}
              <span>{call.costMicros === undefined ? 'no price' : costLabel(call.costMicros)}</span>
              {call.running ? <span>{' (working)'}</span> : null}
            </li>
          ))}
        </ul>
      )}
      <p class="rst-settings__note" data-testid="plan-checks">
        {note(props.state)}
      </p>
      {(sections ?? []).map((section) => (
        <section key={section.title} aria-label={section.title}>
          <h3>{section.title}</h3>
          <p class="rst-plan-check">{section.text}</p>
        </section>
      ))}
    </>
  );
}
