import type { JSX } from 'preact';
import type { StateValue } from './badge-specs.js';
import { StatusBadge } from './StatusBadge.js';

// P7-02, DEC-194, design-system section 6: the badge of an ended run.

export interface RunEndBadgeProps {
  readonly endState: StateValue<'RunEndState'>;
  /** The planned areas no reader started; read as 0 when the server did not say. */
  readonly unreadAreas?: number | undefined;
}

export function RunEndBadge({ endState }: RunEndBadgeProps): JSX.Element {
  return <StatusBadge list="RunEndState" value={endState} />;
}
