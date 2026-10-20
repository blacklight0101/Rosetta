import type { JSX } from 'preact';
import type { RunEstimate } from '../api/estimate-schemas.js';
import { costLabel, tokensLabel } from '../lib/live-run/format.js';
import type { CapsState, RunState } from '../lib/live-run/run-state.js';
import { roleTotalsOf, shareOf, type RoleTotals } from '../lib/live-run/run-summary.js';
import { microsToDollars } from '../lib/usd.js';
import { ScrollRegion } from './ScrollRegion.js';

// RF-1003, RF-424, design-system.md section 14 (live run): the run meter: tokens and cost per role
// and in total, the cap as a bar, and the estimate beside it for comparison. The tokens and cost of
// each role add up its usage.recorded events (P1-96; the turns of its agents for a run without
// them), and the total cost is read from the run (the server adds every call to it), so the two can
// be checked against each other. A number the page does not have (a role whose model has no price)
// is a dash, never zero; a local model's calls cost zero.

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

type Point = RunEstimate['total']['likely'];

const dollars = (micros: string): string => `$${microsToDollars(micros)}`;
const tokensOf = (point: Point): number => point.inputTokens + point.outputTokens;

/** The range in tokens, and in dollars when the models have a price: free models show 0 to 0. */
function rangeText(total: RunEstimate['total']): string {
  const tokens = `${tokensLabel(tokensOf(total.low))} to ${tokensLabel(tokensOf(total.high))} tokens`;
  const priced = BigInt(total.high.costMicros) > 0n;
  return priced
    ? `${tokens}, ${dollars(total.low.costMicros)} to ${dollars(total.high.costMicros)}`
    : tokens;
}

/** Says so when the run has used more than the likely estimate: in dollars if priced, else tokens. */
function overrunOf(props: EstimateProps): string | undefined {
  const { likely } = props.estimate.total;
  if (BigInt(likely.costMicros) > 0n) {
    const over = BigInt(Math.round(props.costMicros)) > BigInt(likely.costMicros);
    return over
      ? `Over the estimate: ${costLabel(props.costMicros)} spent so far against ${dollars(likely.costMicros)} likely.`
      : undefined;
  }
  const expected = tokensOf(likely);
  return expected > 0 && props.tokens > expected
    ? `Over the estimate: ${tokensLabel(props.tokens)} tokens used so far against ${tokensLabel(expected)} likely.`
    : undefined;
}

interface EstimateProps {
  readonly estimate: RunEstimate;
  readonly tokens: number;
  readonly costMicros: number;
}

function Estimate(props: EstimateProps): JSX.Element {
  const { likely } = props.estimate.total;
  const over = overrunOf(props);
  return (
    <>
      <p class="rst-live-meter__estimate" data-testid="estimate-line">
        Estimate (likely): {tokensLabel(tokensOf(likely))} tokens, {dollars(likely.costMicros)}.
        Range {rangeText(props.estimate.total)}.
      </p>
      {over === undefined ? null : (
        <p class="rst-live-meter__over" data-testid="estimate-over">
          {over}
        </p>
      )}
    </>
  );
}

function RoleRow({ role }: { readonly role: RoleTotals }): JSX.Element {
  return (
    <tr>
      <th scope="row">{role.role}</th>
      <td class="rst-table__number" data-label="Input">
        {tokensLabel(role.inputTokens)}
      </td>
      <td class="rst-table__number" data-label="Output">
        {tokensLabel(role.outputTokens)}
      </td>
      <td class="rst-table__number" data-label="Tokens">
        {tokensLabel(role.inputTokens + role.outputTokens)}
      </td>
      <td class="rst-table__number" data-label="Cost">
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
      <td class="rst-table__number" data-label="Input">
        {tokensLabel(input)}
      </td>
      <td class="rst-table__number" data-label="Output">
        {tokensLabel(output)}
      </td>
      <td class="rst-table__number" data-label="Tokens">
        {tokensLabel(input + output)}
      </td>
      <td class="rst-table__number" data-label="Cost">
        <strong>{costLabel(props.costMicros)}</strong>
      </td>
    </tr>
  );
}

function RoleTable(props: { readonly state: RunState; readonly costMicros: number }): JSX.Element {
  const roles = roleTotalsOf(props.state);
  return (
    <ScrollRegion label="Tokens and cost per role">
      <table class="rst-table rst-table--stack">
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
      {estimate === undefined ? null : <Estimate {...{ estimate, tokens, costMicros }} />}
    </section>
  );
}
