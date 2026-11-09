import type { JSX } from 'preact';
import type { RunRow } from '../api/run-schemas.js';
import { countText } from '../lib/understanding/measure-text.js';
import type { RunState } from '../lib/live-run/run-state.js';
import { RunDownloads } from './RunDownloads.js';

// RF-1015, RF-1016, RF-008 (P8-27, UX-11, UX-12): what the page of a scan run that has ended shows:
// the code map the scan wrote, as the run's own `scan.completed` event counts it (files and areas, so
// it can never disagree with the run), and the download that applies to a scan. A scan has no
// readers, cards, claims, report or hand-off, so none of those panels is drawn.

const plural = (count: number, word: string): string =>
  `${countText(count)} ${word}${count === 1 ? '' : 's'}`;

function Summary({ state }: { readonly state: RunState }): JSX.Element {
  if (state.scan === undefined) {
    return <p class="rst-settings__note">This scan wrote no summary of its code map.</p>;
  }
  return (
    <p data-testid="scan-summary">
      {`${plural(state.scan.files, 'file')} in ${plural(state.scan.areas, 'area')}.`}
    </p>
  );
}

// RF-1015
export function ScanResult(props: { readonly run: RunRow; readonly state: RunState }): JSX.Element {
  const { run } = props;
  return (
    <div class="rst-p170-grid">
      <section class="rst-card rst-p827-map" aria-label="Code map">
        <h2 class="rst-live-section__title">Code map</h2>
        <Summary state={props.state} />
        <p class="rst-settings__note">
          The areas are listed on the start page, where you choose what a run reads.
        </p>
      </section>
      <aside class="rst-p170-rail">
        <section class="rst-card rst-p170-downloads" aria-label="Downloads of the scan">
          <RunDownloads runId={run.id} stage="scan" ended />
        </section>
      </aside>
    </div>
  );
}
