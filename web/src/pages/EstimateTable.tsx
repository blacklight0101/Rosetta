import type { JSX } from 'preact';
import type { RoleEstimate, RunEstimate, Scenario } from '../api/estimate-schemas.js';
import {
  dollars,
  pricedTotal,
  roleCost,
  scenarios,
  totalTokens,
  unpricedRoles,
} from '../lib/estimate-math.js';

// RF-425: tokens and cost per role as a low, likely and high range. A cloud model without a price
// shows its cost as unknown, never as free, and the total then reads "at least" (RF-427).

const columnTitles: Readonly<Record<Scenario, string>> = {
  low: 'Low',
  likely: 'Likely',
  high: 'High',
};

function tokens(count: number): string {
  return `${count.toLocaleString('en-US')} tokens`;
}

function RoleRow({ role }: { readonly role: RoleEstimate }): JSX.Element {
  return (
    <tr>
      <th scope="row">{role.role}</th>
      <td class="rst-table__wrap" data-label="Provider, model">
        <span class="rst-mono">
          {role.provider} / {role.model}
        </span>
      </td>
      {scenarios.map((scenario) => (
        <td key={scenario} class="rst-table__number" data-label={columnTitles[scenario]}>
          <div>{roleCost(role, scenario)}</div>
          <div class="rst-table__sub">{tokens(totalTokens(role, scenario))}</div>
        </td>
      ))}
    </tr>
  );
}

function TotalRow({ estimate }: { readonly estimate: RunEstimate }): JSX.Element {
  const incomplete = unpricedRoles(estimate).length > 0;
  return (
    <tr>
      <th scope="row">
        <strong>Total</strong>
      </th>
      <td />
      {scenarios.map((scenario) => {
        const amount = dollars(pricedTotal(estimate, scenario));
        return (
          <td key={scenario} class="rst-table__number" data-label={columnTitles[scenario]}>
            <div>
              <strong>{incomplete ? `at least ${amount}` : amount}</strong>
            </div>
            <div class="rst-table__sub">{tokens(totalTokens(estimate.total, scenario))}</div>
          </td>
        );
      })}
    </tr>
  );
}

function IncompleteNote({ estimate }: { readonly estimate: RunEstimate }): JSX.Element | null {
  const unpriced = unpricedRoles(estimate);
  if (unpriced.length === 0) return null;
  const models = unpriced.map((role) => `${role.provider} / ${role.model}`);
  return (
    <p class="rst-settings__note">
      The total is not complete: {models.join(', ')} has no price in the price table, so its cost is
      unknown.
    </p>
  );
}

// RF-425
export function EstimateTable({ estimate }: { readonly estimate: RunEstimate }): JSX.Element {
  const { assumptions } = estimate;
  return (
    <>
      <div class="rst-table-scroll" role="region" aria-label="Estimate table" tabIndex={0}>
        <table class="rst-table rst-table--stack">
          <caption class="rst-visually-hidden">Estimate per role</caption>
          <thead>
            <tr>
              <th scope="col">Role</th>
              <th scope="col">Provider, model</th>
              {scenarios.map((scenario) => (
                <th key={scenario} scope="col" class="rst-table__number">
                  {columnTitles[scenario]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {estimate.roles.map((role) => (
              <RoleRow key={role.role} role={role} />
            ))}
            <TotalRow estimate={estimate} />
          </tbody>
        </table>
      </div>
      <IncompleteNote estimate={estimate} />
      <p class="rst-settings__note">
        Assumptions: {estimate.areas.length} areas, {assumptions.turnsPerArea.likely} turns per area
        (likely), price table {estimate.priceTableVersion} ({estimate.currency}).
      </p>
    </>
  );
}
