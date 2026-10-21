import type { JSX } from 'preact';
import { navigate } from '../app/router.js';
import { journeyOf } from '../lib/journey/journey-steps.js';
import { JourneyStrip } from './JourneyStrip.js';
import { useJourney } from './use-journey.js';

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
  /** The path of the page the strip is on (Plan setup), so no action links to the page itself. */
  readonly pagePath?: string | undefined;
}

// RF-615
export function JourneyPanel(props: JourneyPanelProps): JSX.Element | null {
  const { projectId, runId, refresh } = props;
  const load = useJourney({ projectId, runId }, refresh);
  if (load.status === 'loading') return null;
  if (load.status === 'failed') {
    return <p class="rst-road-note">{`The journey could not be read (${load.error.code}).`}</p>;
  }
  const view = journeyOf(load.facts, projectId);
  const source = load.facts.source;
  return (
    <JourneyStrip
      view={view}
      onAnswer={props.onAnswer}
      pagePath={props.pagePath}
      onResumed={
        props.onResumed ??
        (() => {
          if (source !== null) navigate(`/runs/${source.id}`);
        })
      }
    />
  );
}
