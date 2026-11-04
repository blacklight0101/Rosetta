import type { ComponentChildren, JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { UsageTotals } from '../api/cost-schemas.js';
import { tokensLabel } from '../lib/live-run/format.js';
import { priceTableText } from '../lib/money.js';
import { CostFigure, hasExactFigure } from '../components/CostFigure.js';
import { ScrollRegion } from './ScrollRegion.js';

// RF-428, design-system.md section 5 (table): one breakdown of a project's cost page. Each line
// keeps the cost fixed when its calls were made and names the price table versions they used; a
// local model is marked and costs zero. The price table is named once above the rows when every row
// used the same version, and in a column of its own only when the versions differ. The amounts of a table
// take one Tab stop (CostFigure), which follows the row last reached.

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

interface RowProps {
  readonly row: CostRow;
  readonly perRow: boolean;
  /** Whether this row holds the table's one Tab stop for its amounts. */
  readonly tabStop: boolean;
  readonly onReach: () => void;
}

function Row(props: RowProps): JSX.Element {
  const { row, perRow } = props;
  const { totals } = row;
  return (
    <tr>
      <th scope="row">
        {row.name}
        {row.local ? <span class="rst-p136-local">Local</span> : null}
      </th>
      <td data-label="Calls" class="rst-table__num">
        {tokensLabel(totals.calls)}
      </td>
      <td data-label="Input tokens" class="rst-table__num">
        {tokensLabel(totals.inputTokens)}
      </td>
      <td data-label="Output tokens" class="rst-table__num">
        {tokensLabel(totals.outputTokens)}
      </td>
      <td data-label="Cached input" class="rst-table__num">
        {tokensLabel(totals.cachedInputTokens)}
      </td>
      <td data-label="Cost" class="rst-table__num">
        <CostFigure totals={totals} tabStop={props.tabStop} onReach={props.onReach} />
      </td>
      {perRow ? (
        <td data-label="Price table" class="rst-mono">
          {totals.priceTableVersions.map(priceTableText).join(', ')}
        </td>
      ) : null}
    </tr>
  );
}

const versionsOf = (rows: readonly CostRow[]): string[] => [
  ...new Set(rows.flatMap((row) => row.totals.priceTableVersions)),
];

function Head(props: { readonly firstColumn: string; readonly perRow: boolean }): JSX.Element {
  return (
    <thead>
      <tr>
        <th scope="col">{props.firstColumn}</th>
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
        {props.perRow ? <th scope="col">Price table</th> : null}
      </tr>
    </thead>
  );
}

// The one Tab stop of the amounts is the row last reached, the first row until one is, among the rows whose
// amount carries a tooltip (a plain amount cannot take focus). A row that is gone or turned plain hands the
// stop back to the first of those rows.
function useTabStop(rows: readonly CostRow[]): {
  readonly stopKey: string | undefined;
  readonly reach: (key: string) => void;
} {
  const [reached, setReached] = useState<string | null>(null);
  const stops = rows.filter((row) => hasExactFigure(row.totals));
  const stopKey = stops.some((row) => row.key === reached) ? reached : stops[0]?.key;
  return { stopKey: stopKey ?? undefined, reach: setReached };
}

// RF-428
export function CostTable({ caption, firstColumn, rows }: CostTableProps): JSX.Element {
  const versions = versionsOf(rows);
  const [only] = versions;
  const perRow = versions.length > 1;
  const { stopKey, reach } = useTabStop(rows);
  const captionId = `rst-cost-${caption.toLowerCase().replaceAll(' ', '-')}`;
  return (
    <ScrollRegion label={`Cost ${caption.toLowerCase()} table`}>
      <table class="rst-table rst-table--stack rst-p136-table" aria-labelledby={captionId}>
        <caption class="rst-p136-caption">
          <span id={captionId}>{caption}</span>
          {only !== undefined && !perRow ? (
            <span class="rst-p136-pricenote">
              {`Prices of ${priceTableText(only)}, for every row below`}
            </span>
          ) : null}
        </caption>
        <Head firstColumn={firstColumn} perRow={perRow} />
        <tbody>
          {rows.map((row) => (
            <Row
              key={row.key}
              row={row}
              perRow={perRow}
              tabStop={row.key === stopKey}
              onReach={() => {
                reach(row.key);
              }}
            />
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}
