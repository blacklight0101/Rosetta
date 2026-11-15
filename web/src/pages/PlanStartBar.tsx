import type { JSX } from 'preact';
import type { PlanEstimate } from '../api/plan-schemas.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import {
  capFigure,
  journeyShortOf,
  scenarioCost,
  type Blocker,
} from '../lib/plan-setup/estimate.js';
import type { EstimateLoad } from './use-plan-estimate.js';
import { useWritePackage } from './use-write-package.js';

// RF-605, RF-604, RF-613, P8-82, design-system.md section 14 (Plan setup): the bar that stays at
// the bottom of the window while the page scrolls, built like the start page's summary bar
// (SummaryBar.tsx): the likely figure of the plan estimate, the reason "Start the plan" cannot be
// pressed, and "Start the plan". The caps, warnings and blockers stay in PlanEstimateCard.

export interface PlanStartBarProps {
  readonly projectId: string;
  /** RF-614: the understand run the package is written from. */
  readonly sourceRunId: string | undefined;
  /** RST-1802: the source run was refused, so no package can be written from it. */
  readonly sourceRefused: boolean;
  readonly load: EstimateLoad;
  readonly blockers: readonly Blocker[];
  readonly consent: boolean;
  /** RF-132: the second confirmation was ticked. */
  readonly privateConfirmed: boolean;
  /** Why the package cannot be written yet for a reason of the steps or the consent. */
  readonly stepReason: string | undefined;
  readonly outOfDate: boolean;
}

function reasonOf(props: PlanStartBarProps): string | undefined {
  const { load, blockers, stepReason } = props;
  if (props.sourceRefused) return 'The source run cannot be used. Fix it above first.';
  if (load.status === 'idle') return stepReason ?? 'Save your answers first.';
  if (load.status === 'loading') return 'The estimate is being read.';
  if (load.status === 'failed') return 'The estimate could not be read.';
  if (blockers.length > 0) return 'Fix the problem above first.';
  if (journeyShortOf(load.estimate)?.usedUp === true) {
    return 'Nothing is left of the approved amount. Press Analyse again on the start page first.';
  }
  return stepReason;
}

/** "Plan estimate: likely $0.03", and what is left of the approved amount the plan runs under. */
function estimateText(estimate: PlanEstimate): string {
  const likely = `Plan estimate: likely ${scenarioCost(estimate, 'likely')}`;
  const approved = estimate.caps.find((cap) => cap.approved);
  if (approved === undefined) return likely;
  const left = capFigure(approved, approved.remaining);
  return `${likely} · ${left} left of ${capFigure(approved, approved.limit)} approved`;
}

// RF-605
export function PlanStartBar(props: PlanStartBarProps): JSX.Element {
  const { projectId, sourceRunId, load, consent, outOfDate } = props;
  const writing = useWritePackage({ projectId, sourceRunId }, consent, props.privateConfirmed);
  const reason = reasonOf(props);
  return (
    <section class="rst-start__bar" aria-label="Plan summary">
      <div class="rst-start__bar-text">
        {load.status === 'ready' ? (
          <p class="rst-start__bar-totals">{estimateText(load.estimate)}</p>
        ) : null}
        {reason === undefined ? null : (
          <p class="rst-settings__note" data-testid="plan-start-reason">
            {reason}
          </p>
        )}
        {writing.error === undefined ? null : <ErrorBanner error={writing.error} />}
      </div>
      <div class="rst-start__actions">
        <Button
          variant="primary"
          busy={writing.busy}
          {...(reason === undefined ? {} : { disabledReason: reason })}
          onClick={writing.write}
        >
          {outOfDate ? 'Start the plan again' : 'Start the plan'}
        </Button>
      </div>
    </section>
  );
}
