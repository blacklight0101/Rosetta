import type { JSX } from 'preact';
import type { EndReason } from '../api/end-reason.js';
import type { StateValue } from './badge-specs.js';
import { StatusBadge } from './StatusBadge.js';

// P7-02, DEC-194, design-system section 6: the badge of an ended run.

export interface RunEndBadgeProps {
  readonly endState: StateValue<'RunEndState'>;
  /** The planned areas no reader started; read as 0 when the server did not say. */
  readonly unreadAreas?: number | undefined;
  /** P8-111: why an `Interrupted` run ended; none reads "Stopped by you". */
  readonly endReason?: EndReason | null | undefined;
}

export function RunEndBadge({ endState, unreadAreas, endReason }: RunEndBadgeProps): JSX.Element {
  if (endState === 'CapReached' && (unreadAreas ?? 0) > 0) {
    return <StatusBadge list="RunPartlyRead" value="PartlyRead" />;
  }
  if (endState === 'Interrupted' && (endReason === 'Restart' || endReason === 'QueueCancel')) {
    return <StatusBadge list="RunInterruptedBy" value={endReason} />;
  }
  return <StatusBadge list="RunEndState" value={endState} />;
}
