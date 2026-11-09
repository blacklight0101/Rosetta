import type { JSX } from 'preact';
import { Glyph } from '../components/Glyph.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import {
  deepenFiguresOf,
  overCapTexts,
  roundPlanText,
} from '../lib/understanding/deepen-estimate-text.js';
import type { DeepenEstimateLoad } from './use-deepen.js';

// RF-209, RF-425, RF-427, RF-434, DEC-211: the estimate of a Deepen as the panel draws it (P8Deepen): what
// the first round does, then three figures (the first round, up to N rounds, and what stops it, which
// is what is left of the approved amount), one sentence under them and, with a glyph, a warning shown
// once when the high figure could pass that amount. Nothing here starts a run.

function Figure(props: {
  readonly label: string;
  readonly value: string;
  readonly testId: string;
}): JSX.Element {
  return (
    <div class="rst-p241-measure" data-testid={props.testId}>
      <dt>{props.label}</dt>
      <dd>{props.value}</dd>
    </div>
  );
}

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
  const figures = deepenFiguresOf(estimate);
  return (
    <div class="rst-p241-estimate">
      <p data-testid="deepen-plan">{roundPlanText(estimate)}</p>
      <dl class="rst-p241-measures">
        <Figure label="First round" value={figures.first} testId="deepen-first-round" />
        <Figure label={figures.allLabel} value={figures.all} testId="deepen-all-rounds" />
        <Figure label="What stops it" value={figures.stops} testId="deepen-stops" />
      </dl>
      <p>{figures.note}</p>
      {overCapTexts(estimate).map((text) => (
        <p key={text} class="rst-p241-warning" data-testid="deepen-over-cap">
          <Glyph name="warning-triangle" />
          <span>{text}</span>
        </p>
      ))}
    </div>
  );
}
