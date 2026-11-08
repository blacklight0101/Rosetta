import type { JSX } from 'preact';
import { queueText } from '../lib/live-run/queue-text.js';
import type { JourneyFacts } from '../api/journey-schemas.js';
import type { LastRun } from '../api/overview-schemas.js';
import { FailedAreasNote } from '../components/FailedAreasNote.js';
import { Glyph, type GlyphName } from '../components/Glyph.js';
import { skippedDeepen } from '../lib/deepen-choice.js';
import { positionOf, type PositionTone } from '../lib/journey/project-position.js';
import { mayHaveMeasures } from '../lib/understanding/measure-text.js';
import { RunMeasures } from './RunMeasures.js';

// RF-010, RF-1108, RF-231, DEC-222, P8-137, `P8Projects` artboard: the "Where it is" cell of a project
// row. The position in the journey is a glyph and words, never colour alone, read from the journey
// facts of the overview with the viewer's Deepen choice, as the project page reads them; a queued run
// keeps its place in the queue under it, a run that read with failures its note and an ended
// understand run its measures line.
// The classes are under `.rst-p1105-where`.

const glyphs: Readonly<Record<PositionTone, GlyphName>> = {
  idle: 'open-circle',
  working: 'live-dot',
  done: 'check',
  attention: 'warning-triangle',
  stopped: 'square',
  failed: 'cross',
};

// RF-010
export function ProjectPosition(props: {
  readonly projectId: string;
  readonly run: LastRun | null;
  readonly journey: JourneyFacts | null;
}): JSX.Element {
  const { projectId, run, journey } = props;
  const sourceId = journey?.source?.id;
  const skipped = sourceId !== undefined && skippedDeepen(sourceId);
  const { text, tone } = positionOf({ projectId, lastRun: run, journey, skippedDeepen: skipped });
  return (
    <>
      <span class={`rst-p1105-where rst-p1105-where--${tone}`}>
        <Glyph name={glyphs[tone]} />
        {text}
      </span>
      {run === null ? null : (
        <>
          {run.position === null ? null : (
            <span class="rst-table__sub rst-p1105-note">{queueText(run.position)}</span>
          )}
          <FailedAreasNote count={run.failedAreas} />
          {mayHaveMeasures(run) ? <RunMeasures runId={run.id} /> : null}
        </>
      )}
    </>
  );
}
