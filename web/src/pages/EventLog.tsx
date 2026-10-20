import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { BreakableText } from '../components/BreakableText.js';
import { RenderedText } from '../components/RenderedText.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { stateLists } from '../components/badge-specs.js';
import { elapsedLabel } from '../lib/live-run/elapsed.js';
import { LOG_LIMIT } from '../lib/live-run/log-count.js';
import type { LogLine, VerdictDetail } from '../lib/live-run/run-state.js';
import { countText } from '../lib/understanding/measure-text.js';

// RF-1002, design-system.md section 14 (live run): the verbose event log, every event with its time,
// newest first. The time counts from the start of the run. The log does not announce each event to a
// screen reader (a run has hundreds); the status of the run does. Event text comes from the run and
// is shown as text. A verdict has the badge of the claims list and its reason, cut at
// `REASON_SHOWN` characters with the way to open it in full.

/** A verdict reason longer than this is cut, with a button that opens it whole. */
const REASON_SHOWN = 200;

function toneOf(type: string): string {
  if (type.startsWith('verify.') || type === 'agent.card.proposed')
    return 'rst-live-log__type--brand';
  if (type.startsWith('budget.')) return 'rst-live-log__type--warn';
  if (type === 'run.ended' || type === 'agent.ended') return 'rst-live-log__type--ok';
  return '';
}

function VerdictBadge({ status }: { readonly status: string }): JSX.Element {
  const known = stateLists.ClaimStatus.find((each) => each === status);
  return known === undefined ? (
    <span>{status}</span>
  ) : (
    <StatusBadge list="ClaimStatus" value={known} />
  );
}

/** The reason of a verdict: whole when short, cut with a button to open it in full when long. */
function Reason({ reason }: { readonly reason: string }): JSX.Element {
  const [open, setOpen] = useState(false);
  const cut = reason.length > REASON_SHOWN;
  const shown = cut && !open ? `${reason.slice(0, REASON_SHOWN).trimEnd()}…` : reason;
  return (
    <>
      <span class="rst-live-log__reason" data-testid="log-reason">
        <RenderedText text={shown} />
      </span>
      {cut ? (
        <button
          type="button"
          class="rst-button rst-button--link rst-live-log__more"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open ? 'Show less' : 'Show the full reason'}
        </button>
      ) : null}
    </>
  );
}

function Verdict({ verdict }: { readonly verdict: VerdictDetail }): JSX.Element {
  return (
    <span class="rst-live-log__verdict">
      <span class="rst-mono">{verdict.claimId}</span>
      <VerdictBadge status={verdict.status} />
      {verdict.reason === '' ? null : <Reason reason={verdict.reason} />}
    </span>
  );
}

function Line(props: { readonly line: LogLine; readonly startedAt: string | undefined }) {
  const { line, startedAt } = props;
  return (
    <li class="rst-live-log__item">
      <time dateTime={line.at} title={line.at} class="rst-live-log__time">
        {elapsedLabel(startedAt, line.at)}
      </time>
      <span class="rst-live-log__body">
        <span class={`rst-live-log__type ${toneOf(line.type)}`}>{line.type}</span>
        <span class="rst-live-log__text">
          {line.detail?.kind === 'verdict' ? (
            <Verdict verdict={line.detail} />
          ) : (
            <BreakableText text={line.text} />
          )}
        </span>
      </span>
    </li>
  );
}

// RF-1002
export function EventLog(props: {
  readonly lines: readonly LogLine[];
  readonly startedAt: string | undefined;
}): JSX.Element {
  const newestFirst = [...props.lines].reverse();
  return (
    <section class="rst-live-log rst-card">
      <h2 class="rst-live-section__title">Event log</h2>
      <p class="rst-settings__note">
        Verbose, newest first. Times count from the start of the run.
        {props.lines.length >= LOG_LIMIT
          ? ` Only the newest ${countText(LOG_LIMIT)} events are kept.`
          : ''}
      </p>
      <div
        role="log"
        aria-label="Event log"
        aria-live="off"
        tabIndex={0}
        class="rst-live-log__scroll"
      >
        <ol class="rst-live-log__list">
          {newestFirst.map((line) => (
            <Line key={line.seq} line={line} startedAt={props.startedAt} />
          ))}
        </ol>
      </div>
    </section>
  );
}
