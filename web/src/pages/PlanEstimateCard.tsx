import type { JSX } from 'preact';
import type { PlanCap, PlanEstimate } from '../api/plan-schemas.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Link } from '../components/Link.js';
import {
  capFigure,
  journeyShortOf,
  capName,
  overCapText,
  overCaps,
  runLineText,
  scenarioCost,
  type Blocker,
} from '../lib/plan-setup/estimate.js';
import type { EstimateLoad } from './use-plan-estimate.js';

// RF-613, RF-143, RF-427, design-system.md section 14 (Plan setup): the estimate of the planner
// against the caps, what stops the run (no price, no key) and a warning for a figure over a cap;
// "Start the plan" sits in the bar at the bottom of the window (PlanStartBar.tsx, P8-82). The calls
// behind the figures are shown only when the estimate names them.

export interface PlanEstimateCardProps {
  readonly projectId: string;
  readonly load: EstimateLoad;
  readonly blockers: readonly Blocker[];
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

/** RF-613, P8-01: a figure over a cap never reads as fitting; the likely one first, then the high. */
function warningsOf(estimate: PlanEstimate): readonly string[] {
  // P9-02: the approved amount that is short has its own notice below the figures.
  const short = journeyShortOf(estimate)?.cap.kind;
  const likely = overCaps(estimate, 'likely').filter((cap) => cap.kind !== short);
  const names = new Set(likely.map(capName));
  const high = overCaps(estimate, 'high').filter(
    (cap) => !names.has(capName(cap)) && cap.kind !== short,
  );
  return [
    ...likely.map((cap) => overCapText(estimate, 'likely', cap)),
    ...high.map((cap) => overCapText(estimate, 'high', cap)),
  ];
}

/** P3-113: a prompt of the plan that cannot fit the planner's window even with the cards named by title only. */
function windowWarning(estimate: PlanEstimate): string | undefined {
  const { fitsWindow, windowTokens, oversizedCalls } = estimate.assumptions;
  if (fitsWindow !== false || typeof windowTokens !== 'number') return undefined;
  const calls = Array.isArray(oversizedCalls) ? oversizedCalls.join(', ') : 'a call';
  return `The prompt of the planner call (${calls}) cannot fit the ${windowTokens.toLocaleString('en-US')}-token window of the planner model. Choose a model with a larger window, or set a larger context for it in the project settings.`;
}

function Figures(props: {
  readonly estimate: PlanEstimate;
  readonly projectId: string;
}): JSX.Element {
  const { estimate } = props;
  const calls = estimate.assumptions.calls;
  return (
    <>
      <p class="rst-plan-estimate__lead">
        <strong>{`${scenarioCost(estimate, 'likely')} likely`}</strong>
        {` (low ${scenarioCost(estimate, 'low')}, high ${scenarioCost(estimate, 'high')})`}
        {calls === undefined ? '' : ` for ${String(calls)} planner calls`}
      </p>
      <p class="rst-plan-note" data-testid="plan-run-line">
        {runLineText(estimate)}
      </p>
      <table class="rst-plan-caps">
        <caption>Caps this run is checked against</caption>
        <tbody>
          {estimate.caps.map((cap) => (
            <CapRow key={cap.kind} cap={cap} />
          ))}
        </tbody>
      </table>
      {windowWarning(estimate) === undefined ? null : (
        <p class="rst-plan-warning" role="alert">
          {windowWarning(estimate)}
        </p>
      )}
      <JourneyShortNotice estimate={estimate} projectId={props.projectId} />
      {warningsOf(estimate).map((text) => (
        <p key={text} class="rst-plan-warning">
          {text}
        </p>
      ))}
    </>
  );
}

/** RF-435, P9-02: what is short of the approved amount and the one action that lets the plan start. */
function JourneyShortNotice(props: {
  readonly estimate: PlanEstimate;
  readonly projectId: string;
}): JSX.Element | null {
  const short = journeyShortOf(props.estimate);
  if (short === undefined) return null;
  return (
    <div class="rst-plan-warning" role="status" data-testid="plan-journey-short">
      <p>{short.text}</p>
      {short.usedUp ? (
        <p>
          <Link href={`/projects/${props.projectId}/start`}>Analyse again on the start page</Link>
        </p>
      ) : null}
    </div>
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

// RF-613
export function PlanEstimateCard({
  projectId,
  load,
  blockers,
}: PlanEstimateCardProps): JSX.Element {
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
      {load.status === 'ready' ? <Figures estimate={load.estimate} projectId={projectId} /> : null}
      <Blockers blockers={blockers} />
    </section>
  );
}
