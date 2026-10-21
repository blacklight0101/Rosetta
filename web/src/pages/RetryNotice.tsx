import type { JSX } from 'preact';
import { Link } from '../components/Link.js';
import type { RetryProgress } from '../lib/live-run/run-state.js';
import { countText } from '../lib/understanding/measure-text.js';

// RF-208, Q-43, RF-1002: a run that retries the failed areas of another run says which run, with a
// link to it, and what it starts from. It reads again only the areas named; the rest it holds as
// they were, so its cards and Supported claims include every one of that run.

function areasText(count: number): string {
  return count === 1 ? '1 area' : `${countText(count)} areas`;
}

// RF-208
export function RetryNotice(props: { readonly retry: RetryProgress }): JSX.Element {
  const { parentRunId, parentRunKey, areas, seeded } = props.retry;
  const held = `${countText(seeded.cards)} cards and ${countText(seeded.supported)} of ${countText(seeded.claims)} claims supported`;
  return (
    <section class="rst-callout rst-callout--info" data-testid="retry-of" aria-label="Retry">
      <p class="rst-callout__message">
        {'Retry of run '}
        <Link href={`/runs/${encodeURIComponent(parentRunId)}`}>{parentRunKey}</Link>
      </p>
      <p class="rst-callout__next-step">
        {`Holds ${held} from that run and reads ${areasText(areas)} again.`}
      </p>
    </section>
  );
}
