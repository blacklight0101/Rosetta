import type { ComponentChildren, JSX } from 'preact';
import type { UsageTotals } from '../api/cost-schemas.js';
import { CostFigure } from '../components/CostFigure.js';
import { priceTableText } from '../lib/money.js';
import { captionIdOf, CostCaption, useTabStop, versionsOf } from './CostTable.js';
import { ScrollRegion } from './ScrollRegion.js';

// RF-428, DEC-211, P8-109: the breakdown by run as the `P8HistoryCost` artboard draws it: the run, its Kind,
// one column for each of the four roles, the run's total, and a last row with the project's total. A role
// that made no calls in a run reads a dash, never a cost of zero. The amounts of the table (the roles, the
// totals and the project total) take one Tab stop together, as in every cost table (P8-117).

const ROLES = ['reader', 'verifier', 'planner', 'summariser'] as const;
type CostRole = (typeof ROLES)[number];

export interface RunCostRow {
  readonly key: string;
  readonly name: ComponentChildren;
  /** The run's Kind in History's words; a dash for a run History cannot name. */
  readonly kind: string;
  readonly local: boolean;
  readonly totals: UsageTotals;
  /** The cost of each role that made calls in the run; a role without calls has no entry. */
  readonly roles: ReadonlyMap<string, UsageTotals>;
}

const roleLabel = (role: CostRole): string => `${role.charAt(0).toUpperCase()}${role.slice(1)}`;

interface Stops {
  readonly stopKey: string | undefined;
  readonly reach: (key: string) => void;
}

function Amount(props: {
  readonly cell: string;
  readonly totals: UsageTotals;
  readonly stops: Stops;
}): JSX.Element {
  const { cell, totals, stops } = props;
  return (
    <CostFigure
      totals={totals}
      tabStop={cell === stops.stopKey}
      onReach={() => {
        stops.reach(cell);
      }}
    />
  );
}

function Row(props: {
  readonly row: RunCostRow;
  readonly stops: Stops;
  readonly perRow: boolean;
}): JSX.Element {
  const { row, stops } = props;
  return (
    <tr>
      <th scope="row">
        {row.name}
        {row.local ? <span class="rst-p136-local">Local</span> : null}
      </th>
      <td data-label="Kind">{row.kind}</td>
      {ROLES.map((role) => {
        const totals = row.roles.get(role);
        return (
          <td key={role} data-label={roleLabel(role)} class="rst-table__num">
            {totals === undefined ? (
              <>
                <span aria-hidden="true">-</span>
                <span class="rst-visually-hidden">No calls</span>
              </>
            ) : (
              <Amount cell={`${row.key}:${role}`} totals={totals} stops={stops} />
            )}
          </td>
        );
      })}
      <td data-label="Total" class="rst-table__num rst-p136-total">
        <Amount cell={`${row.key}:total`} totals={row.totals} stops={stops} />
      </td>
      {props.perRow ? (
        <td data-label="Price table" class="rst-mono">
          {row.totals.priceTableVersions.map(priceTableText).join(', ')}
        </td>
      ) : null}
    </tr>
  );
}

function Head(props: { readonly perRow: boolean }): JSX.Element {
  return (
    <thead>
      <tr>
        <th scope="col">Run</th>
        <th scope="col">Kind</th>
        {ROLES.map((role) => (
          <th key={role} scope="col" class="rst-table__num">
            {roleLabel(role)}
          </th>
        ))}
        <th scope="col" class="rst-table__num">
          Total
        </th>
        {props.perRow ? <th scope="col">Price table</th> : null}
      </tr>
    </thead>
  );
}

const PROJECT_TOTAL = 'project-total';

// RF-428
export function RunCostTable(props: {
  readonly caption: string;
  readonly rows: readonly RunCostRow[];
  /** The project's total, from the totals of the page. */
  readonly total: UsageTotals;
}): JSX.Element {
  const { caption, rows, total } = props;
  const versions = versionsOf(rows);
  const perRow = versions.length > 1;
  const cells = rows.flatMap((row) => [
    ...ROLES.flatMap((role) => {
      const totals = row.roles.get(role);
      return totals === undefined ? [] : [{ key: `${row.key}:${role}`, totals }];
    }),
    { key: `${row.key}:total`, totals: row.totals },
  ]);
  const stops = useTabStop([...cells, { key: PROJECT_TOTAL, totals: total }]);
  return (
    <ScrollRegion label={`Cost ${caption.toLowerCase()} table`}>
      <table
        class="rst-table rst-table--stack rst-p136-table"
        aria-labelledby={captionIdOf(caption)}
      >
        <CostCaption caption={caption} versions={versions} />
        <Head perRow={perRow} />
        <tbody>
          {rows.map((row) => (
            <Row key={row.key} row={row} stops={stops} perRow={perRow} />
          ))}
          <tr class="rst-p136-projecttotal">
            <th scope="row">Project total</th>
            {/* Empty cells keep the total under its column, which a stacked table at 360 px needs. */}
            {Array.from({ length: 1 + ROLES.length }, (_, at) => (
              <td key={at} />
            ))}
            <td data-label="Total" class="rst-table__num rst-p136-total">
              <Amount cell={PROJECT_TOTAL} totals={total} stops={stops} />
            </td>
            {perRow ? <td /> : null}
          </tr>
        </tbody>
      </table>
    </ScrollRegion>
  );
}
