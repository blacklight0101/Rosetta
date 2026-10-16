import type { JSX } from 'preact';
import { claimCounts, overviewOf } from '../lib/live-run/run-summary.js';
import type { RunState } from '../lib/live-run/run-state.js';

// RF-1002, RF-1004, design-system.md section 14 (live run): the overview of the run: agents planned,
// running, done and failed, the cards proposed and the claims by status.

const claimWords: readonly (readonly [string, string])[] = [
  ['CitationsChecked', 'citations checked'],
  ['CitationInvalid', 'citation invalid'],
  ['Supported', 'supported'],
  ['Rejected', 'rejected'],
  ['Unverified', 'unverified'],
  ['Proposed', 'proposed'],
];

function claimLine(state: RunState): string {
  const counts = claimCounts(state.claims);
  const parts = claimWords.flatMap(([status, words]) => {
    const count = counts[status] ?? 0;
    return count === 0 ? [] : [`${String(count)} ${words}`];
  });
  return parts.length === 0 ? 'none yet' : parts.join(' · ');
}

// RF-1002
export function RunOverview({ state }: { readonly state: RunState }): JSX.Element {
  const overview = overviewOf(state);
  return (
    <section class="rst-live-overview" aria-label="Overview">
      <div class="rst-live-tile">
        <h2 class="rst-live-tile__title">Agents</h2>
        <dl class="rst-live-counts">
          <div>
            <dt>Planned</dt>
            <dd>{overview.planned}</dd>
          </div>
          <div>
            <dt>Running</dt>
            <dd>{overview.running}</dd>
          </div>
          <div>
            <dt>Done</dt>
            <dd>{overview.done}</dd>
          </div>
          <div>
            <dt>Failed</dt>
            <dd>{overview.failed}</dd>
          </div>
        </dl>
      </div>
      <div class="rst-live-tile">
        <h2 class="rst-live-tile__title">Cards proposed</h2>
        <p class="rst-live-tile__figure">{state.cards.length}</p>
      </div>
      <div class="rst-live-tile">
        <h2 class="rst-live-tile__title">Claims</h2>
        <p class="rst-live-tile__figure">{state.claims.length}</p>
        <p class="rst-live-tile__note">{claimLine(state)}</p>
        <p class="rst-live-tile__note">Judgement comes in a later version.</p>
      </div>
    </section>
  );
}
