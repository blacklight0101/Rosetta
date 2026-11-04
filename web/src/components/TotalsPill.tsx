import type { JSX } from 'preact';
import type { AccountTotals } from '../api/cost-schemas.js';
import { totalCostText, tokenSplitText, tokensText } from '../lib/cost-text.js';
import { serverMonthOf } from '../pages/admin-month.js';
import { CostFigure, exactCostTitle } from './CostFigure.js';
import { Link } from './Link.js';
import { MoneyAmount } from './MoneyAmount.js';

// RF-1010, RF-1106, design-system.md section 14 (totals pill): "Your total" from the ledger, the
// tokens (input, output, cached) and the cost; inside a project it links to that project's cost
// page. The administrator also sees the server's spend this month against its monthly cap.

export interface TotalsPillProps {
  readonly totals: AccountTotals;
  /** The cost page of the open project, when one is open. */
  readonly href?: string | undefined;
}

// P5-07: a local-only account has tokens and no dollar amount.
function Own({
  totals,
  local,
  linked,
}: {
  readonly totals: AccountTotals['totals'];
  readonly local: boolean;
  /** Inside a link the exact figure is the title of the link's cost, not a tooltip (P8-91). */
  readonly linked: boolean;
}): JSX.Element {
  return (
    <>
      <span class="rst-p136-pill__label">Your total</span>{' '}
      <span>
        <strong>{tokensText(totals)}</strong> tokens
      </span>
      {local ? null : (
        <>
          {' '}
          <strong class="rst-p136-pill__cost" title={linked ? exactCostTitle(totals) : undefined}>
            {linked ? totalCostText(totals) : <CostFigure totals={totals} />}
          </strong>
        </>
      )}
    </>
  );
}

function Server({ server }: { readonly server: NonNullable<AccountTotals['server']> }) {
  const month = serverMonthOf(server.serverMonthToDate, BigInt(server.caps.serverMonthMicros));

  return (
    <span class="rst-p136-pill__server" data-testid="header-server-month">
      <span class="rst-p136-pill__label">Server, this month</span>{' '}
      <span class={month.warn ? 'rst-p136-pill__warn' : undefined}>
        <MoneyAmount micros={month.usedMicros.toString()} tabStop />
        {' of '}
        <MoneyAmount micros={server.caps.serverMonthMicros} tabStop />
      </span>
    </span>
  );
}

// RF-1010: the split is also the tooltip of the figures, for the widths at which the header folds it (P8-101).
export function TotalsPill({ totals, href }: TotalsPillProps): JSX.Element {
  const split = tokenSplitText(totals.totals);
  return (
    <>
      {href === undefined ? (
        <span class="rst-p136-pill__own" title={split}>
          <Own totals={totals.totals} local={totals.local} linked={false} />
        </span>
      ) : (
        <Link href={href} class="rst-p136-pill__own rst-p136-pill__link" title={split}>
          <Own totals={totals.totals} local={totals.local} linked />
        </Link>
      )}
      <span class="rst-p136-pill__split">{split}</span>
      {totals.server === null ? null : <Server server={totals.server} />}
    </>
  );
}
