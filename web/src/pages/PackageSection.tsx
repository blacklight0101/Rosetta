import type { JSX } from 'preact';
import { runDownloadPath } from '../api/runs.js';
import { Link } from '../components/Link.js';
import type { JourneyView } from '../lib/journey/journey-steps.js';
import { MoneyAmount } from '../components/MoneyAmount.js';

// RF-1021, RF-627, RF-1020, DEC-211 (P8-26, P8Project): the project page once the plan wrote a package:
// the hand-off package (what wrote it, whether every item is built by a task card, the downloads) and
// the journey cost against the approved amount. The marks come from the facts of the journey, so a
// package with gaps or one that is out of date says so; the list of what no card builds is in checks.md.

interface Handoff {
  readonly runId: string;
  readonly runKey: string;
  readonly outOfDate: boolean;
  readonly gaps: boolean;
}

interface Check {
  readonly mark: string;
  readonly tone: 'ok' | 'warn';
  readonly text: string;
}

const built: Check = {
  mark: '✓',
  tone: 'ok',
  text: 'Every feature, table, operation, journey and screen is built by a task card.',
};
const gaps: Check = {
  mark: '!',
  tone: 'warn',
  text: 'Some requirements are built by no task card. checks.md lists them.',
};
const stale: Check = {
  mark: '!',
  tone: 'warn',
  text: 'The brief or the source run changed since this package was written.',
};

function checksOf(handoff: Handoff): readonly Check[] {
  return [handoff.gaps ? gaps : built, ...(handoff.outOfDate ? [stale] : [])];
}

function Main(props: { readonly view: JourneyView; readonly handoff: Handoff }): JSX.Element {
  const { view, handoff } = props;
  const claims = view.facts.source?.supportedClaims ?? 0;
  const setUp = view.steps.find((step) => step.key === 'brief')?.href;
  return (
    <div class="rst-p826-package__main">
      <h2 id="package-heading">Hand-off package</h2>
      <p>
        Written by plan <span class="rst-mono">{handoff.runKey}</span> from {String(claims)}{' '}
        supported claims. Review{' '}
        <a href={`/runs/${handoff.runId}/files/handoff/checks.md`}>checks.md</a> before you hand it
        to a team.
      </p>
      <ul class="rst-p826-checks">
        {checksOf(handoff).map((check) => (
          <li key={check.text}>
            <span aria-hidden="true" class={`rst-p826-checks__mark--${check.tone}`}>
              {check.mark}
            </span>
            <span>{check.text}</span>
          </li>
        ))}
      </ul>
      <div class="rst-p826-actions">
        <a
          class="rst-button rst-button--primary"
          href={runDownloadPath(handoff.runId, 'handoff')}
          download
        >
          Download hand-off zip
        </a>
        <Link class="rst-button rst-button--secondary" href={`/runs/${handoff.runId}`}>
          Open the plan run
        </Link>
        {setUp === undefined ? null : (
          <Link class="rst-button rst-button--secondary" href={setUp}>
            Change the brief and plan again
          </Link>
        )}
      </div>
    </div>
  );
}

function Cost({ view }: { readonly view: JourneyView }): JSX.Element {
  const { approved } = view;
  const percent =
    approved === undefined || approved.cap === 0
      ? 0
      : Math.min(100, Math.round((approved.spent / approved.cap) * 100));
  const costOf = (key: 'understand' | 'plan'): JSX.Element | string => {
    const step = view.steps.find((each) => each.key === key);
    if (step?.costMicros === undefined) return step?.cost ?? '';
    return <MoneyAmount micros={step.costMicros} tabStop />;
  };
  return (
    <div class="rst-p826-cost">
      <h3>Journey cost</h3>
      <p class="rst-p826-cost__total">
        <MoneyAmount micros={view.totalCostMicros} tabStop />
      </p>
      {approved === undefined ? null : (
        <>
          <div
            class="rst-cap-meter"
            role="meter"
            aria-label="Spent of the approved amount"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div class="rst-cap-meter__fill" style={{ inlineSize: `${String(percent)}%` }} />
          </div>
          <p class="rst-settings__note">{approved.text}</p>
        </>
      )}
      <p class="rst-settings__note">
        {'Understand '}
        {costOf('understand')}
        {' · Plan '}
        {costOf('plan')}
      </p>
      <Link href={`/projects/${view.projectId}/cost`}>See the cost by run</Link>
    </div>
  );
}

// RF-1021
export function PackageSection({ view }: { readonly view: JourneyView }): JSX.Element | null {
  const { handoff } = view.facts;
  if (handoff === null) return null;
  return (
    <section class="rst-card rst-p826-package" aria-labelledby="package-heading">
      <Main view={view} handoff={handoff} />
      <Cost view={view} />
    </section>
  );
}
