import type { JSX } from 'preact';
import type { ApiFailure } from '../api/client.js';
import type { PlanSource } from '../api/plan-schemas.js';
import { ErrorBanner } from '../components/ErrorBanner.js';

// RF-614, RF-605, design-system.md section 14 (Plan setup): names the understand run the package is
// written from: its folder name, when it ended, the areas of its cards and how many Supported claims
// it holds; says when it is the newest completed run of the project. A project with no usable run
// shows the reason instead.

export interface PlanSourcePanelProps {
  readonly source: PlanSource | undefined;
  readonly error: ApiFailure | undefined;
}

/** `2026-10-12T09:41:00.000Z` as `2026-10-12 09:41 UTC`. */
const when = (endedAt: string): string => `${endedAt.slice(0, 16).replace('T', ' ')} UTC`;

function Description({ source }: { readonly source: PlanSource }): JSX.Element {
  const claims = `${String(source.supportedClaims)} Supported claim${source.supportedClaims === 1 ? '' : 's'}`;
  return (
    <>
      <p class="rst-plan-note">
        {`The package is written from the understand run ${source.runKey}`}
        {source.endedAt === null ? '' : `, which ended ${when(source.endedAt)}`}
        {`. Areas: ${source.areas.length === 0 ? 'none named' : source.areas.join(', ')}. ${claims}.`}
      </p>
      {source.newest ? (
        <p class="rst-plan-note">
          It is the newest completed understand run of the project. To plan from another run, open
          Plan setup from that run's page.
        </p>
      ) : null}
    </>
  );
}

// RF-614
export function PlanSourcePanel({ source, error }: PlanSourcePanelProps): JSX.Element {
  return (
    <section class="rst-plan-card" aria-label="Source run">
      <h2 class="rst-plan-card__title">Source run</h2>
      {source === undefined ? null : <Description source={source} />}
      {error === undefined ? null : <ErrorBanner error={error} />}
    </section>
  );
}
