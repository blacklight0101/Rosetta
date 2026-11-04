import type { JSX } from 'preact';
import { Glyph } from '../components/Glyph.js';
import {
  coverageReadText,
  mayHaveMeasures,
  measureLine,
  standingOf,
} from '../lib/understanding/measure-text.js';
import { useUnderstanding } from './use-understanding.js';

// RF-231, RF-1008, P8-89, History artboard: the Coverage column, "42% read" (with "Well covered" and a glyph
// at the bar), and the whole line of measures in its tooltip. A dash for a run without measures or when they
// cannot be read: the row never breaks.

const DASH = '–';

function Measured({ runId }: { readonly runId: string }): JSX.Element {
  const load = useUnderstanding(runId, true);
  if (load.status !== 'ready' || load.understanding.measures === null) return <>{DASH}</>;
  const { measures } = load.understanding;
  const well = standingOf(measures).wellCovered;
  return (
    <span data-testid="run-coverage" title={measureLine(measures)}>
      {well ? (
        <>
          <Glyph name="check" />{' '}
        </>
      ) : null}
      {coverageReadText(measures)}
      {well ? <span class="rst-table__sub">{' · Well covered'}</span> : null}
    </span>
  );
}

// RF-231
export function RunCoverage(props: {
  readonly run: { readonly id: string; readonly stage: string; readonly endState: string | null };
}): JSX.Element {
  const { run } = props;
  return mayHaveMeasures(run) ? <Measured runId={run.id} /> : <>{DASH}</>;
}
