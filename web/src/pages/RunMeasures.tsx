import type { JSX } from 'preact';
import { Glyph } from '../components/Glyph.js';
import { measureLine, standingOf } from '../lib/understanding/measure-text.js';
import { useUnderstanding } from './use-understanding.js';

// RF-231 scenario 1: the measures of an ended understand run on one line, beside the run in a list
// (the Projects page and the history), not only on its own page. It shows nothing for a run without
// measures or when they cannot be read: the row never breaks. "Well covered" needs 80% of the
// first-party tokens read and no claim left unjudged, and comes with a glyph. All the styles are
// under `.rst-p241-`.

// RF-231
export function RunMeasures({ runId }: { readonly runId: string }): JSX.Element | null {
  const load = useUnderstanding(runId, true);
  if (load.status !== 'ready') return null;
  const { measures } = load.understanding;
  if (measures === null) return null;
  const well = standingOf(measures).wellCovered;
  return (
    <span class="rst-table__sub rst-p241-line" data-testid="run-measures">
      {well ? (
        <>
          <Glyph name="check" />
          <b>Well covered</b>
          {' · '}
        </>
      ) : null}
      {measureLine(measures)}
    </span>
  );
}
