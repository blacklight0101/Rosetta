import type { JSX } from 'preact';
import type { JourneyView } from '../lib/journey/journey-steps.js';

// RF-615: skeleton, filled in by the feature commit.

export interface JourneyStripProps {
  readonly view: JourneyView;
  /** RF-006: called once the server has queued the understand run again. */
  readonly onResumed: () => void;
  /** Opens the questions where the page can show them. */
  readonly onAnswer?: (() => void) | undefined;
}

export function JourneyStrip(props: JourneyStripProps): JSX.Element {
  return <div data-steps={props.view.steps.length} />;
}
