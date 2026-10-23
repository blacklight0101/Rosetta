import type { JSX } from 'preact';
import type { AccountTotals } from '../api/cost-schemas.js';
import { tokenSplitText, tokensText, totalCostText } from '../lib/cost-text.js';
import { microsToDollars } from '../lib/usd.js';
import { serverMonthOf } from '../pages/admin-month.js';
import { Link } from './Link.js';

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
}: {
  readonly totals: AccountTotals['totals'];
  readonly local: boolean;
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
          <strong class="rst-p136-pill__cost">{totalCostText(totals)}</strong>
        </>
      )}
    </>
  );
}

function Server({ server }: { readonly server: NonNullable<AccountTotals['server']> }) {
  const month = serverMonthOf(server.serverMonthToDate, BigInt(server.caps.serverMonthMicros));
  const used = microsToDollars(month.usedMicros.toString());
  const cap = microsToDollars(server.caps.serverMonthMicros);
  return (
    <span class="rst-p136-pill__server" data-testid="header-server-month">
      <span class="rst-p136-pill__label">Server, this month</span>{' '}
      <span class={month.warn ? 'rst-p136-pill__warn' : undefined}>{`$${used} of $${cap}`}</span>
    </span>
  );
}

// RF-1010
export function TotalsPill({ totals, href }: TotalsPillProps): JSX.Element {
  return (
    <>
      {href === undefined ? (
        <span class="rst-p136-pill__own">
          <Own totals={totals.totals} local={totals.local} />
        </span>
      ) : (
        <Link href={href} class="rst-p136-pill__own rst-p136-pill__link">
          <Own totals={totals.totals} local={totals.local} />
        </Link>
      )}
      <span class="rst-p136-pill__split">{tokenSplitText(totals.totals)}</span>
      {totals.server === null ? null : <Server server={totals.server} />}
    </>
  );
}
