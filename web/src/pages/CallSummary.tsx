import type { JSX } from 'preact';
import type { SummaryRow } from '../api/call-schemas.js';
import { costText, durationText, speedText, tokenText } from '../lib/api-calls/format.js';
import { ScrollRegion } from './ScrollRegion.js';

// RF-1011, DEC-57: the summary per provider and role: calls, errors, P50 and P95 latency and time
// to first token, tokens per second for Ollama, tokens and cost.

export interface CallSummaryProps {
  readonly rows: readonly SummaryRow[];
}

function errorsText(row: SummaryRow): string {
  const parts = [
    ...(row.retried > 0 ? [`${String(row.retried)} retried`] : []),
    ...(row.failed > 0 ? [`${String(row.failed)} failed`] : []),
    ...(row.refused > 0 ? [`${String(row.refused)} refused by cap`] : []),
  ];
  return parts.join(', ');
}

function Row({ row }: { readonly row: SummaryRow }): JSX.Element {
  return (
    <tr data-testid="summary-row">
      <th scope="row">{row.provider}</th>
      <td>{row.role}</td>
      <td class="rst-table__num">{tokenText(row.calls)}</td>
      <td>
        <span class={row.errors > 0 ? 'rst-p137-errors' : undefined}>{String(row.errors)}</span>
        {errorsText(row) === '' ? null : (
          <span class="rst-table__sub rst-p137-errors__detail">{errorsText(row)}</span>
        )}
      </td>
      <td class="rst-table__num">{durationText(row.latencyP50Ms)}</td>
      <td class="rst-table__num">{durationText(row.latencyP95Ms)}</td>
      <td class="rst-table__num">{durationText(row.firstTokenP50Ms)}</td>
      <td class="rst-table__num">{durationText(row.firstTokenP95Ms)}</td>
      <td class="rst-table__num">{speedText(row.tokensPerSecond)}</td>
      <td class="rst-table__num">{tokenText(row.inputTokens + row.outputTokens)}</td>
      <td class="rst-table__num">{costText(row.costMicros)}</td>
    </tr>
  );
}

const heads = [
  ['Provider', false],
  ['Role', false],
  ['Calls', true],
  ['Errors', false],
  ['Latency P50', true],
  ['Latency P95', true],
  ['First token P50', true],
  ['First token P95', true],
  ['Speed', true],
  ['Tokens', true],
  ['Cost', true],
] as const;

// RF-1011
export function CallSummary({ rows }: CallSummaryProps): JSX.Element {
  return (
    <section class="rst-card rst-p137-panel" aria-label="Summary per provider and role">
      <h2 class="rst-live-section__title">Summary per provider and role</h2>
      {rows.length === 0 ? (
        <p class="rst-settings__note">The figures appear when the run makes its first call.</p>
      ) : (
        <ScrollRegion label="Summary figures">
          <table class="rst-table">
            <thead>
              <tr>
                {heads.map(([label, numeric]) => (
                  <th key={label} scope="col" class={numeric ? 'rst-table__num' : undefined}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Row key={`${row.provider}/${row.role}`} row={row} />
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      )}
    </section>
  );
}
