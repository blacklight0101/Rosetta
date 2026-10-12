import type { ComponentChildren, JSX } from 'preact';
import type { UsageTotals } from '../api/cost-schemas.js';
import { tokensLabel } from '../lib/live-run/format.js';
import { totalCostText } from '../lib/cost-text.js';
import { ScrollRegion } from './ScrollRegion.js';

// RF-428, design-system.md section 5 (table): one breakdown of a project's cost page. Each line
// keeps the cost fixed when its calls were made and names the price table versions they used; a
// local model is marked and costs zero.

export interface CostRow {
  readonly key: string;
  readonly name: ComponentChildren;
  readonly local: boolean;
  readonly totals: UsageTotals;
}

export interface CostTableProps {
  /** The table's caption and accessible name, for example `By run`. */
  readonly caption: string;
  readonly firstColumn: string;
  readonly rows: readonly CostRow[];
}

function Row({ row }: { readonly row: CostRow }): JSX.Element {
  const { totals } = row;
  return (
    <tr>
      <th scope="row">
        {row.name}
        {row.local ? <span class="rst-p136-local">Local</span> : null}
      </th>
      <td class="rst-table__num">{tokensLabel(totals.calls)}</td>
      <td class="rst-table__num">{tokensLabel(totals.inputTokens)}</td>
      <td class="rst-table__num">{tokensLabel(totals.outputTokens)}</td>
      <td class="rst-table__num">{tokensLabel(totals.cachedInputTokens)}</td>
      <td class="rst-table__num">{totalCostText(totals)}</td>
      <td class="rst-mono">{totals.priceTableVersions.join(', ')}</td>
    </tr>
  );
}

// RF-428
export function CostTable({ caption, firstColumn, rows }: CostTableProps): JSX.Element {
  return (
    <ScrollRegion label={`Cost ${caption.toLowerCase()} table`}>
      <table class="rst-table rst-p136-table">
        <caption class="rst-p136-caption">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{firstColumn}</th>
            <th scope="col" class="rst-table__num">
              Calls
            </th>
            <th scope="col" class="rst-table__num">
              Input tokens
            </th>
            <th scope="col" class="rst-table__num">
              Output tokens
            </th>
            <th scope="col" class="rst-table__num">
              Cached input
            </th>
            <th scope="col" class="rst-table__num">
              Cost
            </th>
            <th scope="col">Price table</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Row key={row.key} row={row} />
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}
