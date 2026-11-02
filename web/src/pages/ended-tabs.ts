import type { TabSpec } from '../components/Tabs.js';
import { logCountOf } from '../lib/live-run/log-count.js';
import type { RunState } from '../lib/live-run/run-state.js';

// RF-1015, RF-1017: the tabs of the page of an ended run.

// RF-1015
export function endedTabsOf(props: {
  readonly stage: string;
  readonly asks: boolean;
  readonly open: number | undefined;
  readonly state: RunState;
}): readonly TabSpec[] {
  const { asks, open, state } = props;
  // RF-1015 (P7-25): a plan run has planner calls, not cards, claims or coverage.
  if (props.stage === 'plan') {
    return [
      { id: 'calls', label: 'Planner calls', count: state.planCalls.length },
      { id: 'activity', label: 'Activity', count: logCountOf(state.log) },
    ];
  }
  return [
    ...(asks ? [{ id: 'overview', label: 'Overview' }] : []),
    ...(asks ? [{ id: 'questions', label: 'Your questions', count: open }] : []),
    { id: 'evidence', label: 'Evidence', count: state.cards.length },
    { id: 'activity', label: 'Activity', count: logCountOf(state.log) },
  ];
}
