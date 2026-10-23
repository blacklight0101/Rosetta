import type { JSX } from 'preact';
import type { RunEstimate } from '../api/estimate-schemas.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { dollars, pricedTotal, roleCost, tokensText, unpricedRoles } from '../lib/estimate-math.js';

// RF-425, RF-427, DEC-97: the question before an understand run whose likely cost is above the
// confirm threshold: the estimate as the page shows it (low, likely and high, per role), the
// threshold and the run cap. A model without a price is named, and the total is then a lower bound.

/** RF-429: the likely tokens of a local estimate that are above the run token cap. */
interface OverTokenCap {
  readonly likelyTokens: number;
  readonly capTokens: number;
}

export interface StartConfirmDialogProps {
  readonly overTokenCap?: OverTokenCap | undefined;
  readonly estimate: RunEstimate;
  readonly thresholdMicros: bigint;
  readonly capMicros: bigint;
  readonly busy: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** RF-429: why a run on local models asks: its likely tokens are above the run token cap. */
function TokenReason({ over }: { readonly over: OverTokenCap }): JSX.Element {
  return (
    <p>
      The likely estimate, {tokensText(over.likelyTokens)}, is above the run token cap of{' '}
      {tokensText(over.capTokens)}. The run would stop at the cap with part of the selection unread:
      choose fewer areas or raise the run cap in the project settings, or start anyway.
    </p>
  );
}

/** RF-425: why a run asks: its likely cost is above the confirm threshold. */
function CostReason(props: StartConfirmDialogProps): JSX.Element {
  const { estimate } = props;
  const atLeast = unpricedRoles(estimate).length === 0 ? '' : 'at least ';
  return (
    <p>
      The likely cost is {atLeast}
      {dollars(pricedTotal(estimate, 'likely'))}, above the {dollars(props.thresholdMicros)} you
      asked to confirm. Low {atLeast}
      {dollars(pricedTotal(estimate, 'low'))}, high {atLeast}
      {dollars(pricedTotal(estimate, 'high'))}.
    </p>
  );
}

// RF-425, RF-429
export function StartConfirmDialog(props: StartConfirmDialogProps): JSX.Element {
  const { estimate, overTokenCap } = props;
  return (
    <ConfirmDialog
      title="Start this run?"
      confirmLabel="Confirm and start"
      confirmVariant="primary"
      busy={props.busy}
      onConfirm={props.onConfirm}
      onCancel={props.onCancel}
    >
      {overTokenCap === undefined ? <CostReason {...props} /> : <TokenReason over={overTokenCap} />}
      <ul>
        {estimate.roles.map((role) => (
          <li key={role.role}>
            {role.role}: {role.provider} / {role.model}, likely {roleCost(role, 'likely')}
            {role.priced ? '' : ' (no price: the cost is unknown)'}
          </li>
        ))}
      </ul>
      {overTokenCap === undefined ? (
        <p>The run stops by itself before it passes the run cap of {dollars(props.capMicros)}.</p>
      ) : null}
    </ConfirmDialog>
  );
}
