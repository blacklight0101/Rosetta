import { useEffect } from 'preact/hooks';
import type { JourneyExtras, JourneyView } from '../lib/journey/journey-steps.js';
import { journeyOf } from '../lib/journey/journey-steps.js';
import type { JourneyLoad } from './use-journey.js';

// RF-1021, P8-26: tells the page the view of the journey it drew, so the page can title itself after the
// current step. Nothing is told while the facts are being read; a journey that cannot be read is
// told as none.

export interface ReportViewInput extends JourneyExtras {
  readonly onView: ((view: JourneyView | undefined) => void) | undefined;
  readonly load: JourneyLoad;
  readonly projectId: string;
  readonly skipped: boolean;
}

// RF-1021
export function useReportView(input: ReportViewInput): void {
  const { onView, load, projectId, skipped, liveRunId, answered } = input;
  const facts = load.status === 'ready' ? load.facts : undefined;
  useEffect(() => {
    if (onView === undefined || load.status === 'loading') return;
    onView(
      facts === undefined
        ? undefined
        : journeyOf(facts, projectId, skipped, { liveRunId, answered }),
    );
  }, [onView, load.status, facts, projectId, skipped, liveRunId, answered]);
}
