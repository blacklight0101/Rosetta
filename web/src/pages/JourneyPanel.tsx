import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { navigate } from '../app/router.js';
import { journeyOf } from '../lib/journey/journey-steps.js';
import { JourneyStrip, type JourneyStripProps } from './JourneyStrip.js';
import { useJourney } from './use-journey.js';
import { useSkipDeepen } from './use-skip-deepen.js';

// RF-615, RF-1015: the journey strip of a page: reads the facts of the run the page is about
// (`/api/projects/:id/journey`) and draws them. The understand run page, Plan setup and the plan run
// page each hold one. Another user's run is not found, so no step of it is drawn; the page says the
// journey could not be read.

export interface JourneyPanelProps {
  readonly projectId: string;
  /** The understand or plan run the page is about; none on Plan setup opened from the project. */
  readonly runId: string | undefined;
  /** Changes when the run changes state, so the strip reads the facts again. */
  readonly refresh: string;
  /** RF-006: called once the understand run is queued again; the run page opens by default. */
  readonly onResumed?: (() => void) | undefined;
  /** Opens the questions where the page can show them. */
  readonly onAnswer?: (() => void) | undefined;
  /** RF-646: focuses the Deepen of the run where the page holds it. */
  readonly onDeepen?: (() => void) | undefined;
  /** The path of the page the strip is on (Plan setup), so no action links to the page itself. */
  readonly pagePath?: string | undefined;
  /** RF-1021: the page offers the Deepen of the source run in place (the project page). */
  readonly deepenInPlace?: boolean | undefined;
  /** RF-1021: draws the questions and plan setup in place (the project page); told when the brief is saved. */
  readonly setupInPlace?: ((onSaved: () => void) => JSX.Element) | undefined;
}

/** RF-1021: what the project page does in place: Deepen, skipping it, and the questions and plan setup. */
function inPlaceOf(
  props: JourneyPanelProps,
  sourceId: string | undefined,
  on: { readonly skip: () => void; readonly saved: () => void },
): Pick<JourneyStripProps, 'setup' | 'onSkipDeepen' | 'deepenRunId'> {
  const setup = props.setupInPlace?.(on.saved);
  if (props.deepenInPlace !== true) return { setup };
  return { setup, onSkipDeepen: on.skip, deepenRunId: sourceId };
}

// RF-615
export function JourneyPanel(props: JourneyPanelProps): JSX.Element | null {
  const { projectId, runId, refresh } = props;
  const [saved, setSaved] = useState(0);
  const load = useJourney({ projectId, runId }, `${refresh}:${String(saved)}`);
  // The project page names no run: the choice is kept for the source run the facts name.
  const skip = useSkipDeepen(
    runId ?? (load.status === 'ready' ? load.facts.source?.id : undefined),
  );
  if (load.status === 'loading') return null;
  if (load.status === 'failed') {
    return <p class="rst-road-note">{`The journey could not be read (${load.error.code}).`}</p>;
  }
  const view = journeyOf(load.facts, projectId, skip.skipped);
  const source = load.facts.source;
  const inPlace = inPlaceOf(props, source?.id, {
    skip: () => {
      skip.choose(true);
    },
    saved: () => {
      setSaved((now) => now + 1);
    },
  });
  return (
    <JourneyStrip
      view={view}
      onAnswer={props.onAnswer}
      onDeepen={props.onDeepen}
      pagePath={props.pagePath}
      {...inPlace}
      onResumed={
        props.onResumed ??
        (() => {
          if (source !== null) navigate(`/runs/${source.id}`);
        })
      }
    />
  );
}
