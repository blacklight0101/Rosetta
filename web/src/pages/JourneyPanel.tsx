import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { navigate } from '../app/router.js';
import { journeyOf, type JourneyView } from '../lib/journey/journey-steps.js';
import { JourneyStrip, type JourneyStripProps } from './JourneyStrip.js';
import type { RerunChoice } from './JourneySteps.js';
import { useJourney } from './use-journey.js';
import { useReportView } from './use-report-view.js';
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
  /** P8-27: the path of the package's own run page; "Open the package" there calls `onPackage`. */
  readonly packageHere?: string | undefined;
  /** P8-27: scrolls to and focuses the package section of the page. */
  readonly onPackage?: (() => boolean) | undefined;
  /** The path of the page the strip is on (Plan setup), so no action links to the page itself. */
  readonly pagePath?: string | undefined;
  /** RF-1021: the page offers the Deepen of the source run in place (the project page). */
  readonly deepenInPlace?: boolean | undefined;
  /** RF-1021: draws the questions and plan setup in place (the project page); told when the brief is saved. */
  readonly setupInPlace?: ((onSaved: () => void) => JSX.Element) | undefined;
  /** P8-26: told the view once it is read (none when it cannot be), so the page can title itself after the step. */
  readonly onView?: ((view: JourneyView | undefined) => void) | undefined;
  /** P8-26 (RF-1020): the queued or running run of the project; the step that waits links to it. */
  readonly liveRunId?: string | undefined;
  /** RF-241, P8-26: the choice to re-run with the answers that wait, held by the Questions step. */
  readonly rerun?: RerunChoice | undefined;
  /** RF-1020, P8-100: the strip stays expanded, with no button to hide the details (the project page). */
  readonly alwaysExpanded?: boolean | undefined;
  /** RF-1021 (P8-84): the run read its own code below the coverage bar; none where the page does not know. */
  readonly belowBar?: boolean | undefined;
  /** RF-1021 (P8-84): the page holds its one primary action elsewhere; the strip's action is secondary. */
  readonly actionVariant?: 'primary' | 'secondary' | undefined;
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
  const { liveRunId, belowBar } = props;
  const answered = props.rerun?.answered;
  useReportView({
    ...{ onView: props.onView, load, projectId, liveRunId, answered },
    skipped: skip.skipped,
  });
  if (load.status === 'loading') return null;
  if (load.status === 'failed') {
    return <p class="rst-road-note">{`The journey could not be read (${load.error.code}).`}</p>;
  }
  const view = journeyOf(load.facts, projectId, skip.skipped, { liveRunId, answered, belowBar });
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
      rerun={props.rerun}
      onAnswer={props.onAnswer}
      onDeepen={props.onDeepen}
      packageHere={props.packageHere}
      onPackage={props.onPackage}
      pagePath={props.pagePath}
      alwaysExpanded={props.alwaysExpanded}
      actionVariant={props.actionVariant}
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
