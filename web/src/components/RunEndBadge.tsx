import type { JSX } from 'preact';
import type { EndReason } from '../api/end-reason.js';
import type { StateValue } from './badge-specs.js';
import { percentText } from '../lib/understanding/measure-text.js';
import { StatusBadge } from './StatusBadge.js';

// P7-02, DEC-194, design-system section 6: the badge of an ended run. P8-93 (artboard P8Run): a run
// that ended with areas read below the coverage bar reads "Partly read: 16% of your code", also when
// it ended Completed; a run that read above the bar keeps its state.

export interface RunEndBadgeProps {
  readonly endState: StateValue<'RunEndState'>;
  /** The planned areas no reader started; read as 0 when the server did not say. */
  readonly unreadAreas?: number | undefined;
  /** P8-111: why an `Interrupted` run ended; none reads "Stopped by you". */
  readonly endReason?: EndReason | null | undefined;
  /** P8-93: how many areas the coverage puts below the coverage bar; read as 0 when not known. */
  readonly partlyReadAreas?: number | undefined;
  /** P8-93: the share of the first-party tokens the run read (0 to 1), when the page knows it. */
  readonly readShare?: number | null | undefined;
}

/** A run is partly read when its cap left areas unread, or the coverage puts an area under the bar. */
function isPartlyRead(props: RunEndBadgeProps): boolean {
  const { endState } = props;
  if (endState === 'CapReached' && (props.unreadAreas ?? 0) > 0) return true;
  return (
    (props.partlyReadAreas ?? 0) > 0 && (endState === 'Completed' || endState === 'CapReached')
  );
}

/** The artboard's "Partly read: 16% of your code"; the share is left out until it is known. */
function shareSuffix(share: number | null | undefined): string | undefined {
  return share === undefined || share === null ? undefined : `: ${percentText(share)} of your code`;
}

export function RunEndBadge(props: RunEndBadgeProps): JSX.Element {
  const { endState, endReason } = props;
  if (isPartlyRead(props)) {
    return (
      <StatusBadge list="RunPartlyRead" value="PartlyRead" suffix={shareSuffix(props.readShare)} />
    );
  }
  if (endState === 'Interrupted' && (endReason === 'Restart' || endReason === 'QueueCancel')) {
    return <StatusBadge list="RunInterruptedBy" value={endReason} />;
  }
  return <StatusBadge list="RunEndState" value={endState} />;
}
