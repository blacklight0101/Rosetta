import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { CallRow } from '../api/call-schemas.js';
import { Button } from '../components/Button.js';
import { Field } from '../components/Field.js';
import {
  anyFilter,
  filterCalls,
  nextProblemSeq,
  optionsOf,
  type CallFilters,
} from '../lib/api-calls/call-filter.js';
import { CallDetail } from './CallDetail.js';
import { CallsTable } from './CallsTable.js';

// RF-1011: the "API calls" panel: the attempts of the provider call log, filtered by provider, role,
// agent and status, with Next error to walk through the retries and failures. Everything is
// filtered in the page from the calls the server sent; the figures of the summary are not filtered.
// Styles are under `.rst-p137-`.

export interface CallsPanelProps {
  readonly runId: string;
  readonly calls: readonly CallRow[];
  readonly total: number;
  /** P5-22: calls of the log that are not loaded yet, and how to load the next page. */
  readonly more: {
    readonly available: boolean;
    readonly loading: boolean;
    readonly onLoad: () => void;
  };
}

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'problems', label: 'Errors and retries' },
  { value: 'ok', label: 'Ok' },
  { value: 'retried', label: 'Retried' },
  { value: 'failed', label: 'Failed' },
  { value: 'refused-by-cap', label: 'Refused by cap' },
] as const;

const withAll = (values: readonly string[]): { value: string; label: string }[] => [
  { value: '', label: 'All' },
  ...values.map((value) => ({ value, label: value })),
];

function statusFilter(value: string): CallFilters['status'] {
  return STATUS_OPTIONS.find((option) => option.value === value)?.value ?? '';
}

interface FiltersProps {
  readonly calls: readonly CallRow[];
  readonly filters: CallFilters;
  readonly onChange: (filters: CallFilters) => void;
}

function Filters({ calls, filters, onChange }: FiltersProps): JSX.Element {
  const options = optionsOf(calls);
  return (
    <div class="rst-p137-filters">
      <Field
        kind="select"
        id="p137-provider"
        label="Provider"
        value={filters.provider}
        options={withAll(options.providers)}
        onChange={(provider) => {
          onChange({ ...filters, provider });
        }}
      />
      <Field
        kind="select"
        id="p137-role"
        label="Role"
        value={filters.role}
        options={withAll(options.roles)}
        onChange={(role) => {
          onChange({ ...filters, role });
        }}
      />
      <Field
        kind="select"
        id="p137-agent"
        label="Agent"
        value={filters.agent}
        options={withAll(options.agents)}
        onChange={(agent) => {
          onChange({ ...filters, agent });
        }}
      />
      <Field
        kind="select"
        id="p137-status"
        label="Status"
        value={filters.status}
        options={STATUS_OPTIONS}
        onChange={(status) => {
          onChange({ ...filters, status: statusFilter(status) });
        }}
      />
    </div>
  );
}

function Body(props: {
  readonly runId: string;
  readonly calls: readonly CallRow[];
  readonly visible: readonly CallRow[];
  readonly selected: number | undefined;
  readonly onSelect: (seq: number) => void;
}): JSX.Element {
  if (props.calls.length === 0) {
    return (
      <p class="rst-settings__note">
        No provider calls yet. They appear here as the run makes them.
      </p>
    );
  }
  if (props.visible.length === 0) {
    return <p class="rst-settings__note">No calls match the filters.</p>;
  }
  return (
    <CallsTable
      calls={props.visible}
      selected={props.selected}
      transcriptHref={(seq) => `/api/runs/${props.runId}/calls/${String(seq)}/transcript`}
      onSelect={props.onSelect}
    />
  );
}

function LoadMore(props: CallsPanelProps['more']): JSX.Element | null {
  if (!props.available) return null;
  return (
    <div class="rst-p137-more">
      <p class="rst-settings__note">The filters and Next error work on the calls loaded so far.</p>
      <Button
        variant="secondary"
        {...(props.loading ? { disabledReason: 'Loading the next calls.' } : {})}
        onClick={props.onLoad}
      >
        Load more calls
      </Button>
    </div>
  );
}

// RF-1011
export function CallsPanel({ runId, calls, total, more }: CallsPanelProps): JSX.Element {
  const [filters, setFilters] = useState<CallFilters>(anyFilter);
  const [selected, setSelected] = useState<number | undefined>();
  const visible = filterCalls(calls, filters);
  const selectedCall = calls.find((call) => call.seq === selected);
  const hasProblem = nextProblemSeq(visible, undefined) !== undefined;
  useEffect(() => {
    if (selected === undefined) return;
    document
      .querySelector(`[data-testid="call-row"][data-seq="${String(selected)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  return (
    <>
      <section class="rst-card rst-p137-panel" aria-label="API calls">
        <div class="rst-p137-head">
          <h2 class="rst-live-section__title">Calls</h2>
          <span class="rst-settings__note">
            {visible.length === calls.length && calls.length === total
              ? `${String(total)} attempts`
              : `${String(visible.length)} of ${String(total)} attempts${calls.length < total ? ' loaded' : ''}`}
          </span>
          <Button
            variant="secondary"
            {...(hasProblem ? {} : { disabledReason: 'No call was retried or failed.' })}
            onClick={() => {
              setSelected(nextProblemSeq(visible, selected));
            }}
          >
            Next error
          </Button>
        </div>
        <Filters calls={calls} filters={filters} onChange={setFilters} />
        <Body {...{ runId, calls, visible, selected }} onSelect={setSelected} />
        <LoadMore {...more} />
      </section>
      {selectedCall === undefined ? null : <CallDetail runId={runId} call={selectedCall} />}
    </>
  );
}
