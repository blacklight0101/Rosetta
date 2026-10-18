import type { JSX } from 'preact';
import type { PlanCap, PlanEstimate } from '../api/plan-schemas.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Link } from '../components/Link.js';
import {
  capFigure,
  capName,
  overCaps,
  scenarioCost,
  type Blocker,
} from '../lib/plan-setup/estimate.js';
import type { EstimateLoad } from './use-plan-estimate.js';
import { useWritePackage } from './use-write-package.js';

// RF-613, RF-143, RF-427, design-system.md section 14 (Plan setup): the estimate of the planner
// against the caps, what stops the run (no price, no key), a warning for a figure over a cap, and
// "Write the package". The calls behind the figures are shown only when the estimate names them.

export interface PlanEstimateCardProps {
  readonly projectId: string;
  /** RF-614: the understand run the package is written from. */
  readonly sourceRunId: string | undefined;
  readonly load: EstimateLoad;
  readonly blockers: readonly Blocker[];
  readonly consent: boolean;
  /** Why the package cannot be written yet for a reason of the steps or the consent. */
  readonly stepReason: string | undefined;
  readonly outOfDate: boolean;
}

function CapRow({ cap }: { readonly cap: PlanCap }): JSX.Element {
  return (
    <tr>
      <th scope="row">{capName(cap)}</th>
      <td>{capFigure(cap, cap.limit)}</td>
      <td>{`${capFigure(cap, cap.remaining)} left`}</td>
    </tr>
  );
}

function warningsOf(estimate: PlanEstimate): readonly string[] {
  const likely = overCaps(estimate, 'likely').map(
    (cap) =>
      `The likely estimate (${scenarioCost(estimate, 'likely')}) is over what is left of the ${capName(cap)}.`,
  );
  const names = new Set(overCaps(estimate, 'likely').map(capName));
  const high = overCaps(estimate, 'high')
    .filter((cap) => !names.has(capName(cap)))
    .map(
      (cap) =>
        `The high estimate (${scenarioCost(estimate, 'high')}) could pass the ${capName(cap)} (${capFigure(cap, cap.limit)}).`,
    );
  return [...likely, ...high];
}

function Figures({ estimate }: { readonly estimate: PlanEstimate }): JSX.Element {
  const calls = estimate.assumptions.calls;
  return (
    <>
      <p class="rst-plan-estimate__lead">
        <strong>{`${scenarioCost(estimate, 'likely')} likely`}</strong>
        {` (low ${scenarioCost(estimate, 'low')}, high ${scenarioCost(estimate, 'high')})`}
        {calls === undefined ? '' : ` for ${String(calls)} planner calls`}
      </p>
      <table class="rst-plan-caps">
        <caption>Caps this run is checked against</caption>
        <tbody>
          {estimate.caps.map((cap) => (
            <CapRow key={cap.kind} cap={cap} />
          ))}
        </tbody>
      </table>
      {warningsOf(estimate).map((text) => (
        <p key={text} class="rst-plan-warning">
          {text} The run stops cleanly when it reaches a cap.
        </p>
      ))}
    </>
  );
}

function Blockers({ blockers }: { readonly blockers: readonly Blocker[] }): JSX.Element | null {
  return blockers.length === 0 ? null : (
    <>
      {blockers.map((blocker) => (
        <div key={blocker.code} class="rst-callout rst-callout--error" role="alert">
          <p class="rst-callout__message">
            <span class="rst-mono rst-callout__code">{blocker.code}</span> {blocker.message}
          </p>
          <p class="rst-callout__next-step">
            {blocker.nextStep}{' '}
            {blocker.code === 'RST-2302' ? <Link href="/settings">Settings and keys</Link> : null}
          </p>
        </div>
      ))}
    </>
  );
}

function reasonOf(props: PlanEstimateCardProps): string | undefined {
  const { load, blockers, stepReason } = props;
  if (load.status === 'idle') return stepReason ?? 'Save your answers first.';
  if (load.status === 'loading') return 'The estimate is being read.';
  if (load.status === 'failed') return 'The estimate could not be read.';
  if (blockers.length > 0) return 'Fix the problem above first.';
  return stepReason;
}

// RF-613
export function PlanEstimateCard(props: PlanEstimateCardProps): JSX.Element {
  const { projectId, sourceRunId, load, blockers, consent, outOfDate } = props;
  const writing = useWritePackage({ projectId, sourceRunId }, consent);
  const reason = reasonOf(props);
  return (
    <section
      class="rst-plan-card"
      aria-label="Plan estimate"
      aria-busy={load.status === 'loading' ? 'true' : 'false'}
    >
      <h2 class="rst-plan-card__title">Plan estimate</h2>
      <p class="rst-plan-note">
        The planner writes the package under your caps. Questions left on their default appear as
        open questions in the package.
      </p>
      {load.status === 'idle' ? (
        <p class="rst-plan-note">The estimate appears once your answers are saved.</p>
      ) : null}
      {load.status === 'failed' ? <ErrorBanner error={load.error} /> : null}
      {load.status === 'ready' ? <Figures estimate={load.estimate} /> : null}
      <Blockers blockers={blockers} />
      {writing.error === undefined ? null : <ErrorBanner error={writing.error} />}
      <Button
        variant="primary"
        busy={writing.busy}
        {...(reason === undefined ? {} : { disabledReason: reason })}
        onClick={writing.write}
      >
        {outOfDate ? 'Write the package again' : 'Write the package'}
      </Button>
    </section>
  );
}
