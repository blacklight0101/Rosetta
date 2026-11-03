import type { JSX } from 'preact';
import type { RunState } from '../lib/live-run/run-state.js';
import { usePackageChecks } from './use-package-checks.js';

// RF-1015, RF-627 (P8-27): the summary of the checks.md of the package, in the package section of a
// plan run: what it covers, by section title. The text of each section is in the Planner calls tab
// and in the file. Shown as text, never as HTML.

// RF-1015
export function PackageChecks(props: {
  readonly runId: string;
  readonly ended: RunState['ended'];
}): JSX.Element | null {
  const checks = usePackageChecks(props.runId, props.ended);
  if (checks === undefined || checks.sections.length === 0) return null;
  return (
    <div class="rst-p827-checks" data-testid="package-checks">
      <p class="rst-settings__note">
        checks.md in the package covers: {checks.sections.map((each) => each.title).join(', ')}.
      </p>
    </div>
  );
}
