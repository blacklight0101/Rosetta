import type { JSX } from 'preact';
import type { RunEstimate } from '../api/estimate-schemas.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { dollars, pricedTotal, roleCost, unpricedRoles } from '../lib/estimate-math.js';

// RF-425, RF-427, DEC-97: the question before an understand run whose likely cost is above the
// confirm threshold: the estimate as the page shows it (low, likely and high, per role), the
// threshold and the run cap. A model without a price is named, and the total is then a lower bound.

export interface StartConfirmDialogProps {
  readonly estimate: RunEstimate;
  readonly thresholdMicros: bigint;
  readonly capMicros: bigint;
  readonly busy: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

// RF-425
export function StartConfirmDialog(props: StartConfirmDialogProps): JSX.Element {
  const { estimate } = props;
  const missing = unpricedRoles(estimate);
  const atLeast = missing.length === 0 ? '' : 'at least ';
  return (
    <ConfirmDialog
      title="Start this run?"
      confirmLabel="Confirm and start"
      confirmVariant="primary"
      busy={props.busy}
      onConfirm={props.onConfirm}
      onCancel={props.onCancel}
    >
      <p>
        The likely cost is {atLeast}
        {dollars(pricedTotal(estimate, 'likely'))}, above the {dollars(props.thresholdMicros)} you
        asked to confirm. Low {atLeast}
        {dollars(pricedTotal(estimate, 'low'))}, high {atLeast}
        {dollars(pricedTotal(estimate, 'high'))}.
      </p>
      <ul>
        {estimate.roles.map((role) => (
          <li key={role.role}>
            {role.role}: {role.provider} / {role.model}, likely {roleCost(role, 'likely')}
            {role.priced ? '' : ' (no price: the cost is unknown)'}
          </li>
        ))}
      </ul>
      <p>The run stops by itself before it passes the run cap of {dollars(props.capMicros)}.</p>
    </ConfirmDialog>
  );
}
