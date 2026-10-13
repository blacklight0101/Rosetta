import type { JSX } from 'preact';
import type { CallRow } from '../api/call-schemas.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { isProblem } from '../lib/api-calls/call-filter.js';
import { clockText, costText, durationText, tokenText } from '../lib/api-calls/format.js';

// RF-1011, RF-408: the rows of the "API calls" panel. A retried, failed or refused attempt is
// highlighted by its row, its badge and its error code; colour is never the only sign. The link of
// a call opens its masked transcript in the panel below.

export interface CallsTableProps {
  readonly calls: readonly CallRow[];
  readonly selected: number | undefined;
  readonly transcriptHref: (seq: number) => string;
  readonly onSelect: (seq: number) => void;
}

/** What an attempt that did not answer has no figure for. */
const NONE = '-';

function StatusCell({ call }: { readonly call: CallRow }): JSX.Element {
  return (
    <td>
      <StatusBadge
        list="CallStatus"
        value={call.status}
        {...(call.httpStatus === undefined ? {} : { detail: String(call.httpStatus) })}
      />
      {call.attempt > 1 ? <span class="rst-table__sub"> attempt {call.attempt}</span> : null}
      {call.errorCode === undefined ? null : (
        <span class="rst-mono rst-p137-code"> {call.errorCode}</span>
      )}
    </td>
  );
}

function Row(props: CallsTableProps & { readonly call: CallRow }): JSX.Element {
  const { call, selected } = props;
  const answered = call.status === 'ok';
  return (
    <tr
      data-testid="call-row"
      data-seq={call.seq}
      data-problem={isProblem(call) ? 'true' : 'false'}
      aria-current={selected === call.seq ? 'true' : undefined}
      class={`rst-p137-row${isProblem(call) ? ' rst-p137-row--problem' : ''}`}
    >
      <td class="rst-mono">{call.seq}</td>
      <td class="rst-mono">{clockText(call.startedAt)}</td>
      <td>{call.agent}</td>
      <td class="rst-mono">{`${call.provider} / ${call.model}`}</td>
      <td class="rst-table__num">{answered ? durationText(call.timeToFirstTokenMs) : NONE}</td>
      <td class="rst-table__num">{durationText(call.latencyMs)}</td>
      <td class="rst-table__num">{answered ? tokenText(call.inputTokens) : NONE}</td>
      <td class="rst-table__num">{answered ? tokenText(call.outputTokens) : NONE}</td>
      <td class="rst-table__num">{costText(call.costMicros)}</td>
      <StatusCell call={call} />
      <td>
        {call.hasTranscript ? (
          <a
            href={props.transcriptHref(call.seq)}
            aria-label={`Transcript of call ${String(call.seq)}`}
            onClick={(event) => {
              event.preventDefault();
              props.onSelect(call.seq);
            }}
          >
            open
          </a>
        ) : (
          <span class="rst-table__sub">none</span>
        )}
      </td>
    </tr>
  );
}

const heads = [
  ['#', false],
  ['Time', false],
  ['Agent', false],
  ['Provider, model', false],
  ['First token', true],
  ['Latency', true],
  ['In', true],
  ['Out', true],
  ['Cost', true],
  ['Status', false],
  ['Transcript', false],
] as const;

// RF-1011
export function CallsTable(props: CallsTableProps): JSX.Element {
  return (
    <div class="rst-table-scroll">
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
          {props.calls.map((call) => (
            <Row key={call.seq} {...props} call={call} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
