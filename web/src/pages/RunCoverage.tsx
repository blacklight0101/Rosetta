import type { JSX } from 'preact';
import { useId, useState } from 'preact/hooks';
import { Glyph } from '../components/Glyph.js';
import {
  coverageReadText,
  mayHaveMeasures,
  measureLine,
  standingOf,
} from '../lib/understanding/measure-text.js';
import { useUnderstanding } from './use-understanding.js';

// RF-231, RF-1008, RNF-010, P8-89, History artboard: the Coverage column, "42% read" (with "Well covered" and a
// glyph at the bar), and the whole line of measures in a tooltip. The value takes focus (Tab, or a tap), which
// shows the line beside it and has a screen reader read it with the value; hover shows it too, and Escape
// closes it until the pointer leaves or the focus moves (the pattern of the cost figures, P8-110). The line
// sits beside the focusable value, not inside it, so the value's name is "42% read" alone. A dash for a run
// without measures or when they cannot be read: the row never breaks.

const DASH = '–';

function Measured({ runId }: { readonly runId: string }): JSX.Element {
  const load = useUnderstanding(runId, true);
  const tipId = useId();
  const [dismissed, setDismissed] = useState(false);
  if (load.status !== 'ready' || load.understanding.measures === null) return <>{DASH}</>;
  const { measures } = load.understanding;
  const well = standingOf(measures).wellCovered;
  return (
    <span
      class="rst-p889-coverage"
      data-dismissed={dismissed ? '' : undefined}
      onMouseLeave={(event) => {
        if (!event.currentTarget.contains(document.activeElement)) setDismissed(false);
      }}
    >
      <span
        class="rst-p889-coverage__value"
        data-testid="run-coverage"
        tabIndex={0}
        aria-describedby={tipId}
        onFocus={() => {
          setDismissed(false);
        }}
        onBlur={() => {
          setDismissed(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setDismissed(true);
        }}
      >
        {well ? (
          <>
            <Glyph name="check" />{' '}
          </>
        ) : null}
        {coverageReadText(measures)}
        {well ? <span class="rst-table__sub">{' · Well covered'}</span> : null}
      </span>
      <span id={tipId} role="tooltip" class="rst-p889-coverage__line">
        {measureLine(measures)}
      </span>
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
