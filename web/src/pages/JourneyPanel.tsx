import type { JSX } from 'preact';

// RF-615: skeleton, filled in by the feature commit.

export interface JourneyPanelProps {
  readonly projectId: string;
  /** The understand or plan run the page is about; none on Plan setup opened from the project. */
  readonly runId: string | undefined;
  /** Changes when the run changes state, so the strip reads the facts again. */
  readonly refresh: string;
  readonly onResumed?: (() => void) | undefined;
  readonly onAnswer?: (() => void) | undefined;
}

export function JourneyPanel(props: JourneyPanelProps): JSX.Element | null {
  return props.projectId === '' ? null : null;
}
