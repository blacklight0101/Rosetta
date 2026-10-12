import type { JSX } from 'preact';
import { elapsedLabel } from '../lib/live-run/elapsed.js';
import type { LogLine } from '../lib/live-run/run-state.js';

// RF-1002, design-system.md section 14 (live run): the verbose event log, every event with its time,
// newest first. The time counts from the start of the run. The log does not announce each event to a
// screen reader (a run has hundreds); the status of the run does. Event text comes from the run and
// is shown as text.

function toneOf(type: string): string {
  if (type.startsWith('verify.') || type === 'agent.card.proposed')
    return 'rst-live-log__type--brand';
  if (type.startsWith('budget.')) return 'rst-live-log__type--warn';
  if (type === 'run.ended' || type === 'agent.ended') return 'rst-live-log__type--ok';
  return '';
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
            <li key={line.seq} class="rst-live-log__item">
              <time dateTime={line.at} title={line.at} class="rst-live-log__time">
                {elapsedLabel(props.startedAt, line.at)}
              </time>
              <span class="rst-live-log__body">
                <span class={`rst-live-log__type ${toneOf(line.type)}`}>{line.type}</span>
                <span class="rst-live-log__text">{line.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
