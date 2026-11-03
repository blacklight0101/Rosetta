import type { JSX } from 'preact';
import type { RunRow } from '../api/run-schemas.js';
import type { CodeAreaInfo } from '../lib/live-run/code-map-tiles.js';
import { countText } from '../lib/understanding/measure-text.js';
import type { RunState } from '../lib/live-run/run-state.js';
import { RunDownloads } from './RunDownloads.js';
import { useCodeAreas } from './use-code-areas.js';

// RF-1015, RF-1016, RF-008 (P8-27, UX-11, UX-12): what the page of a scan run that has ended shows:
// the code map the scan wrote (its areas with their files and estimated tokens) and the download
// that applies to a scan. A scan has no readers, cards, claims, report or hand-off, so none of
// those panels is drawn. All the styles are under `.rst-p827-`.

const plural = (count: number, word: string): string =>
  `${countText(count)} ${word}${count === 1 ? '' : 's'}`;

function AreaLine({ area }: { readonly area: CodeAreaInfo }): JSX.Element {
  const files = area.files === undefined ? '' : `${plural(area.files, 'file')} · `;
  const tokens = `${countText(area.estimatedTokens)} tokens`;
  return (
    <li class="rst-p827-area">
      <span class="rst-p827-area__name">{area.name}</span>
      <span class="rst-p827-area__meta">
        {`${files}${tokens}${area.thirdParty ? ' · library, left out of a run by default' : ''}`}
      </span>
    </li>
  );
}

function Summary({ state }: { readonly state: RunState }): JSX.Element | null {
  if (state.scan === undefined) return null;
  return (
    <p class="rst-settings__note" data-testid="scan-summary">
      {`${plural(state.scan.files, 'file')} in ${plural(state.scan.areas, 'area')}.`}
    </p>
  );
}

function ScanMap(props: {
  readonly state: RunState;
  readonly areas: readonly CodeAreaInfo[] | undefined;
}): JSX.Element {
  const { areas } = props;
  return (
    <section class="rst-card rst-p827-map" aria-label="Code map">
      <h2 class="rst-live-section__title">Code map</h2>
      <Summary state={props.state} />
      {areas === undefined || areas.length === 0 ? null : (
        <ul class="rst-p827-areas" aria-label="Areas of the code">
          {areas.map((area) => (
            <AreaLine key={area.name} area={area} />
          ))}
        </ul>
      )}
    </section>
  );
}

// RF-1015
export function ScanResult(props: { readonly run: RunRow; readonly state: RunState }): JSX.Element {
  const { run } = props;
  // The estimate lists every area of the project's code map, which is what a scan wrote.
  const areas = useCodeAreas(run.projectId, 'understand');
  return (
    <div class="rst-p170-grid">
      <ScanMap state={props.state} areas={areas} />
      <aside class="rst-p170-rail">
        <section class="rst-card rst-p170-downloads" aria-label="Downloads of the scan">
          <RunDownloads runId={run.id} stage="scan" ended />
        </section>
      </aside>
    </div>
  );
}
