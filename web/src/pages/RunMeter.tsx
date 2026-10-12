import type { JSX } from 'preact';
import type { RunEstimate } from '../api/estimate-schemas.js';
import { costLabel, tokensLabel } from '../lib/live-run/format.js';
import type { CapsState, RunState } from '../lib/live-run/run-state.js';
import { roleTotalsOf, shareOf, type RoleTotals } from '../lib/live-run/run-summary.js';
import { microsToDollars } from '../lib/usd.js';
import { ScrollRegion } from './ScrollRegion.js';

// RF-1003, RF-424, design-system.md section 14 (live run): the run meter: tokens and cost per role
// and in total, the cap as a bar, and the estimate beside it for comparison. Tokens come from the
// turns of the agents; the cost so far comes from the run (the server adds every call to it). A
// number the page does not have is shown as a dash, never as zero.

export interface RunMeterProps {
  readonly state: RunState;
  /** The cost of the run so far, in micro-dollars. */
  readonly costMicros: number;
  readonly estimate: RunEstimate | undefined;
}

function Bar(props: {
  readonly label: string;
  readonly share: number;
  readonly text: string;
}): JSX.Element {
  return (
    <div class="rst-live-meter__item">
      <div class="rst-live-meter__figures">
        <span>{props.label}</span>
        <span>{props.text}</span>
      </div>
      <div
        class="rst-cap-meter"
        role="meter"
        aria-label={`Run ${props.label.toLowerCase()} against cap`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={props.share}
        aria-valuetext={`${props.text} (${String(props.share)}%)`}
      >
        <div
          class={
            props.share >= 80
              ? 'rst-cap-meter__fill rst-live-meter__fill--warn'
              : 'rst-cap-meter__fill'
          }
          style={{ inlineSize: `${String(props.share)}%` }}
        />
      </div>
    </div>
  );
}

function Bars(props: {
  readonly caps: CapsState | undefined;
  readonly tokens: number;
  readonly costMicros: number;
}): JSX.Element {
  const { caps, tokens, costMicros } = props;
  if (caps === undefined)
    return <p class="rst-settings__note">The caps of the run are not known yet.</p>;
  return (
    <div class="rst-live-meter__bars">
      <Bar
        label="Cost"
        share={shareOf(costMicros, caps.maxCostMicros)}
        text={`${costLabel(costMicros)} of ${costLabel(caps.maxCostMicros)}`}
      />
      <Bar
        label="Tokens"
        share={shareOf(tokens, caps.maxTokens)}
        text={`${tokensLabel(tokens)} of ${tokensLabel(caps.maxTokens)}`}
      />
    </div>
  );
}

function Estimate({
  estimate,
}: {
  readonly estimate: RunEstimate | undefined;
}): JSX.Element | null {
  if (estimate === undefined) return null;
  const { low, likely, high } = estimate.total;
  const dollars = (micros: string): string => `$${microsToDollars(micros)}`;
  return (
    <p class="rst-live-meter__estimate">
      Estimate (likely): {tokensLabel(likely.inputTokens + likely.outputTokens)} tokens,{' '}
      {dollars(likely.costMicros)}. Range {dollars(low.costMicros)} to {dollars(high.costMicros)}.
    </p>
  );
}

function RoleRow({ role }: { readonly role: RoleTotals }): JSX.Element {
  return (
    <tr>
      <th scope="row">{role.role}</th>
      <td class="rst-table__number">{tokensLabel(role.inputTokens)}</td>
      <td class="rst-table__number">{tokensLabel(role.outputTokens)}</td>
      <td class="rst-table__number">{tokensLabel(role.inputTokens + role.outputTokens)}</td>
      <td class="rst-table__number">
        {role.costMicros === undefined ? '—' : costLabel(role.costMicros)}
      </td>
    </tr>
  );
}

function TotalRow(props: {
  readonly roles: readonly RoleTotals[];
  readonly costMicros: number;
}): JSX.Element {
  const input = props.roles.reduce((sum, role) => sum + role.inputTokens, 0);
  const output = props.roles.reduce((sum, role) => sum + role.outputTokens, 0);
  return (
    <tr>
      <th scope="row">
        <strong>Total</strong>
      </th>
      <td class="rst-table__number">{tokensLabel(input)}</td>
      <td class="rst-table__number">{tokensLabel(output)}</td>
      <td class="rst-table__number">{tokensLabel(input + output)}</td>
      <td class="rst-table__number">
        <strong>{costLabel(props.costMicros)}</strong>
      </td>
    </tr>
  );
}

function RoleTable(props: { readonly state: RunState; readonly costMicros: number }): JSX.Element {
  const roles = roleTotalsOf(props.state);
  return (
    <ScrollRegion label="Tokens and cost per role">
      <table class="rst-table">
        <caption class="rst-visually-hidden">Tokens and cost per role</caption>
        <thead>
          <tr>
            <th scope="col">Role</th>
            {['Input', 'Output', 'Tokens', 'Cost'].map((title) => (
              <th key={title} scope="col" class="rst-table__number">
                {title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <RoleRow key={role.role} role={role} />
          ))}
          <TotalRow roles={roles} costMicros={props.costMicros} />
        </tbody>
      </table>
    </ScrollRegion>
  );
}

// RF-1003, RF-424
export function RunMeter({ state, costMicros, estimate }: RunMeterProps): JSX.Element {
  const tokens = roleTotalsOf(state).reduce(
    (sum, role) => sum + role.inputTokens + role.outputTokens,
    0,
  );
  return (
    <section class="rst-live-meter rst-card" aria-label="Run meter">
      <h2 class="rst-live-section__title">Run meter</h2>
      <Bars caps={state.caps} tokens={tokens} costMicros={costMicros} />
      <RoleTable state={state} costMicros={costMicros} />
      <Estimate estimate={estimate} />
      <p class="rst-settings__note">
        Cost is the run's total so far. The cost of each role and agent shows a dash until the
        server reports it per call.
      </p>
    </section>
  );
}
