import type { JSX } from 'preact';
import { Glyph } from '../components/Glyph.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import {
  allRoundsText,
  firstRoundText,
  overCapTexts,
} from '../lib/understanding/deepen-estimate-text.js';
import type { DeepenEstimateLoad } from './use-deepen.js';

// RF-209, RF-425, RF-427: the estimate of a Deepen as the panel shows it: the first round and all
// rounds, all rounds as a working ceiling with the run cap named as what stops the run, and a
// warning, with a glyph, when the high figure could pass the cap. Nothing here starts a run.

// RF-209
export function DeepenEstimateView({ load }: { readonly load: DeepenEstimateLoad }): JSX.Element {
  if (load.status === 'loading') {
    return (
      <p class="rst-loading" role="status">
        Reading the estimate
      </p>
    );
  }
  if (load.status === 'failed') return <ErrorBanner error={load.error} />;
  const { estimate } = load;
  return (
    <div class="rst-p241-estimate">
      <p data-testid="deepen-first-round">{firstRoundText(estimate)}</p>
      <p data-testid="deepen-all-rounds">{allRoundsText(estimate)}</p>
      {overCapTexts(estimate).map((text) => (
        <p key={text} class="rst-p241-warning" data-testid="deepen-over-cap">
          <Glyph name="warning-triangle" />
          <span>{text}</span>
        </p>
      ))}
    </div>
  );
}
